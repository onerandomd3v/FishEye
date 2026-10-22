import json
from datetime import UTC, date, datetime

import polars as pl
from fisheye_domain.context import parse_synthetic_context
from fisheye_domain.evaluation import EmployeeDayKey
from fisheye_worker.research_engine import DaySignals, _scores, evaluate_prepared_frames


def _context():
    return parse_synthetic_context(
        json.dumps(
            {
                "schema_version": "fisheye.context.v1",
                "roles": [{"role_id": "teller", "authorized_systems": ["core"]}],
                "employee_schedules": [
                    {
                        "employee_id": "employee-1",
                        "timezone": "UTC",
                        "working_weekdays": [0, 1, 2, 3, 4, 5, 6],
                        "work_start_local": "08:00",
                        "work_end_local": "17:00",
                    }
                ],
            }
        ).encode()
    )


def _prepared_frames(evaluation_label: str):
    days = [date(2026, 1, day) for day in range(1, 6)]
    partitions = pl.DataFrame(
        {
            "employee_id": ["employee-1"] * 5,
            "employee_day_utc": days,
            "dataset_partition": ["baseline"] * 3 + ["calibration", "evaluation"],
        }
    )
    events = pl.DataFrame(
        [
            {
                "event_id": f"event-{day.day}",
                "employee_id": "employee-1",
                "role_id": "teller",
                "department_id": "branch",
                "event_timestamp_utc": datetime(day.year, day.month, day.day, hour, tzinfo=UTC),
                "event_type": "record_read",
                "system": "core" if day.day != 4 else "wire-transfer",
                "device_id": "device-1",
                "location_label": "branch-1",
                "record_count": 10,
            }
            for day, hour in zip(days, [9, 9, 9, 9, 21], strict=True)
        ]
    )
    labels = pl.DataFrame(
        {
            "employee_id": ["employee-1", "employee-1"],
            "employee_day_utc": [days[3], days[4]],
            "ground_truth_label": ["threat_scenario", evaluation_label],
        }
    )
    return events, partitions, labels


def test_contextual_guardrails_keep_off_hours_low_and_out_of_role_medium() -> None:
    key = EmployeeDayKey("employee-1", date(2026, 1, 5))
    shared = {
        "key": key,
        "event_ids": ("event-1",),
        "off_hours_event_ids": (),
        "unseen_device_event_ids": (),
        "unseen_location_event_ids": (),
        "failed_sign_in_count": 0,
        "record_count_total": 1,
        "unusually_high_volume": False,
        "cold_start": False,
    }
    out_of_role = DaySignals(
        **shared,
        out_of_role_event_ids=("event-1",),
    )
    only_off_hours = DaySignals(
        **{**shared, "off_hours_event_ids": ("event-1",)},
        out_of_role_event_ids=(),
    )

    _, role_score = _scores(out_of_role)
    _, time_score = _scores(only_off_hours)

    assert role_score.score >= 40
    assert role_score.severity in {"medium", "high"}
    assert "out_of_role_access" in role_score.reason_codes
    assert time_score.score == 10
    assert time_score.severity == "low"


def test_held_out_labels_do_not_change_scores_or_calibrated_thresholds() -> None:
    events, partitions, benign_labels = _prepared_frames("benign_scenario")
    _, _, threat_labels = _prepared_frames("threat_scenario")

    benign_result = evaluate_prepared_frames(events, partitions, benign_labels, _context())
    threat_result = evaluate_prepared_frames(events, partitions, threat_labels, _context())

    assert benign_result.contextual.threshold == threat_result.contextual.threshold
    assert benign_result.tuned_rules.threshold == threat_result.tuned_rules.threshold
    assert benign_result.scores == threat_result.scores
    assert benign_result.contextual.report.by_scenario == ()
    assert benign_result.contextual.report.metrics.confusion != (
        threat_result.contextual.report.metrics.confusion
    )
