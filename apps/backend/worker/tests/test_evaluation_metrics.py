from datetime import date

import pytest
from fisheye_domain.evaluation import EmployeeDayKey, EmployeeDayTruth, GroundTruthLabel
from fisheye_evaluation.metrics import (
    MAX_RECALL_DROP,
    calibrate_threshold,
    compare_recall,
    evaluate_employee_days,
)


def key(employee: str, day: int) -> EmployeeDayKey:
    return EmployeeDayKey(employee, date(2026, 1, day))


def truth_rows() -> dict[EmployeeDayKey, EmployeeDayTruth]:
    return {
        key("emp-1", 1): EmployeeDayTruth(key("emp-1", 1), GroundTruthLabel.THREAT, "scenario-a"),
        key("emp-2", 1): EmployeeDayTruth(key("emp-2", 1), GroundTruthLabel.BENIGN, "scenario-b"),
        key("emp-3", 1): EmployeeDayTruth(key("emp-3", 1), GroundTruthLabel.BENIGN, "scenario-b"),
    }


def test_employee_day_metrics_and_scenario_counts_are_derived_from_predictions() -> None:
    truth = truth_rows()
    report = evaluate_employee_days(
        {key("emp-1", 1): True, key("emp-2", 1): True, key("emp-3", 1): False}, truth
    )

    assert report.metrics.confusion.true_positive == 1
    assert report.metrics.confusion.false_positive == 1
    assert report.metrics.confusion.true_negative == 1
    assert report.metrics.confusion.false_negative == 0
    assert report.metrics.precision.value == 0.5
    assert report.metrics.recall.value == 1.0
    assert report.metrics.false_positive_rate.value == 0.5
    assert report.metrics.alerts_per_100_employee_days.value == pytest.approx(200 / 3)
    assert [(row.scenario_id, row.metrics.unit_count) for row in report.by_scenario] == [
        ("scenario-a", 1),
        ("scenario-b", 2),
    ]


def test_undefined_metrics_are_none_with_an_explanation() -> None:
    truth = {key("emp-1", 1): EmployeeDayTruth(key("emp-1", 1), GroundTruthLabel.BENIGN, "benign")}
    metrics = evaluate_employee_days({key("emp-1", 1): False}, truth).metrics

    assert metrics.precision.value is None
    assert metrics.precision.undefined_reason
    assert metrics.recall.value is None
    assert metrics.false_positive_rate.value == 0


def test_calibration_selects_strictest_threshold_meeting_recall_floor() -> None:
    truth = truth_rows()
    scores = {key("emp-1", 1): 70, key("emp-2", 1): 60, key("emp-3", 1): 20}

    threshold, report = calibrate_threshold(scores, truth, minimum_recall=1.0)

    assert threshold == 70
    assert report.metrics.confusion.true_positive == 1
    assert report.metrics.confusion.false_positive == 0


def test_recall_gate_uses_approved_five_percentage_point_absolute_tolerance() -> None:
    assert MAX_RECALL_DROP == 0.05
    truth = {
        key(f"threat-{index}", 1): EmployeeDayTruth(
            key(f"threat-{index}", 1), GroundTruthLabel.THREAT, "threat"
        )
        for index in range(20)
    }
    baseline_predictions = dict.fromkeys(truth, True)
    candidate_at_limit = dict.fromkeys(truth, True)
    candidate_at_limit[key("threat-0", 1)] = False
    candidate_over_limit = dict(candidate_at_limit)
    candidate_over_limit[key("threat-1", 1)] = False
    baseline = evaluate_employee_days(baseline_predictions, truth).metrics

    within_gate = compare_recall(
        baseline, evaluate_employee_days(candidate_at_limit, truth).metrics
    )
    over_gate = compare_recall(
        baseline, evaluate_employee_days(candidate_over_limit, truth).metrics
    )

    assert within_gate.passed is True
    assert within_gate.maximum_drop == 0.05
    assert within_gate.observed_drop == pytest.approx(0.05)
    assert over_gate.passed is False


def test_evaluation_refuses_to_fill_missing_employee_days() -> None:
    truth = truth_rows()
    with pytest.raises(ValueError, match="exact same employee-days"):
        evaluate_employee_days({key("emp-1", 1): True}, truth)
