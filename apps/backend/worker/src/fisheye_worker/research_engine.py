"""Deterministic, employee-day research comparison over prepared synthetic data.

The scoring weights and thresholds are an initial proposal for review. They are
not a validated benchmark and must not be presented as production effectiveness.
"""

from collections import defaultdict
from dataclasses import dataclass
from datetime import UTC, datetime
from statistics import median
from typing import cast
from zoneinfo import ZoneInfo

import polars as pl
from fisheye_domain.context import SyntheticContext
from fisheye_domain.evaluation import EmployeeDayKey, EmployeeDayTruth, GroundTruthLabel
from fisheye_evaluation.metrics import (
    EvaluationReport,
    calibrate_threshold,
    compare_recall,
    evaluate_employee_days,
)

METHODOLOGY_VERSION = "fisheye.employee-day-proposal.v1"
SIMPLE_ALERT_THRESHOLD = 40
HIGH_SEVERITY_THRESHOLD = 70
MIN_PERSONAL_BASELINE_DAYS = 3
MIN_ROLE_BASELINE_DAYS = 3
VOLUME_MULTIPLIER = 3.0


@dataclass(frozen=True)
class DaySignals:
    key: EmployeeDayKey
    event_ids: tuple[str, ...]
    out_of_role_event_ids: tuple[str, ...]
    off_hours_event_ids: tuple[str, ...]
    unseen_device_event_ids: tuple[str, ...]
    unseen_location_event_ids: tuple[str, ...]
    failed_sign_in_count: int
    record_count_total: int
    unusually_high_volume: bool
    cold_start: bool


@dataclass(frozen=True)
class ScoreResult:
    key: EmployeeDayKey
    score: int
    severity: str
    reason_codes: tuple[str, ...]
    evidence_event_ids: tuple[str, ...]


@dataclass(frozen=True)
class DetectorEvaluation:
    threshold: float
    report: EvaluationReport
    recall_gate_passed: bool


@dataclass(frozen=True)
class ResearchEvaluation:
    methodology_version: str
    evaluation_unit: str
    calibration_unit_count: int
    evaluation_unit_count: int
    simple_rule: DetectorEvaluation
    tuned_rules: DetectorEvaluation
    contextual: DetectorEvaluation
    scores: tuple[ScoreResult, ...]
    claim_status: str = "not_benchmarked; methodology_requires_review"


def evaluate_prepared_frames(
    events: pl.DataFrame,
    partitions: pl.DataFrame,
    labels: pl.DataFrame,
    context: SyntheticContext,
) -> ResearchEvaluation:
    """Score calibration/evaluation employee-days without giving labels to detectors."""
    partition_by_key: dict[EmployeeDayKey, str] = {}
    for row in partitions.iter_rows(named=True):
        key = EmployeeDayKey(row["employee_id"], row["employee_day_utc"])
        partition = row["dataset_partition"]
        if key in partition_by_key:
            raise ValueError("Prepared split data contains a duplicate employee-day.")
        if partition not in {"baseline", "calibration", "evaluation"}:
            raise ValueError("Prepared split data contains an unsupported partition.")
        partition_by_key[key] = partition

    truth_by_key: dict[EmployeeDayKey, EmployeeDayTruth] = {}
    for row in labels.iter_rows(named=True):
        key = EmployeeDayKey(row["employee_id"], row["employee_day_utc"])
        if key in truth_by_key:
            raise ValueError("Prepared label data contains a duplicate employee-day.")
        truth_by_key[key] = EmployeeDayTruth(
            key=key,
            label=GroundTruthLabel(row["ground_truth_label"]),
        )
    signals = _build_signals(events, partition_by_key, context)
    calibration_keys = {key for key, part in partition_by_key.items() if part == "calibration"}
    evaluation_keys = {key for key, part in partition_by_key.items() if part == "evaluation"}
    if not calibration_keys or not evaluation_keys:
        raise ValueError("Evaluation requires separate calibration and evaluation employee-days.")
    if set(signals) != calibration_keys | evaluation_keys:
        raise ValueError("Every calibration/evaluation employee-day must have prepared events.")
    if calibration_keys & evaluation_keys:
        raise ValueError("An employee-day cannot be present in both calibration and evaluation.")
    if set(truth_by_key) - calibration_keys - evaluation_keys:
        raise ValueError(
            "Ground-truth labels may only be provided for calibration/evaluation data."
        )
    if not calibration_keys.issubset(truth_by_key) or not evaluation_keys.issubset(truth_by_key):
        raise ValueError("Calibration and evaluation labels are required for every employee-day.")

    score_rows = {key: _scores(row) for key, row in signals.items()}
    simple_scores = {key: values[0].score for key, values in score_rows.items()}
    contextual_scores = {key: values[1].score for key, values in score_rows.items()}

    calibration_truth = {key: truth_by_key[key] for key in calibration_keys}
    calibration_simple = {key: simple_scores[key] for key in calibration_keys}
    fixed_calibration_predictions = {
        key: score >= SIMPLE_ALERT_THRESHOLD for key, score in calibration_simple.items()
    }
    baseline_calibration = evaluate_employee_days(fixed_calibration_predictions, calibration_truth)
    recall_floor = max(0.0, (baseline_calibration.metrics.recall.value or 0.0) - 0.05)
    tuned_threshold, _ = calibrate_threshold(
        calibration_simple, calibration_truth, minimum_recall=recall_floor
    )
    contextual_threshold, _ = calibrate_threshold(
        {key: contextual_scores[key] for key in calibration_keys},
        calibration_truth,
        minimum_recall=recall_floor,
    )

    held_out_truth = {key: truth_by_key[key] for key in evaluation_keys}
    simple_predictions = {
        key: simple_scores[key] >= SIMPLE_ALERT_THRESHOLD for key in evaluation_keys
    }
    tuned_predictions = {key: simple_scores[key] >= tuned_threshold for key in evaluation_keys}
    contextual_predictions = {
        key: contextual_scores[key] >= contextual_threshold for key in evaluation_keys
    }
    simple_report = evaluate_employee_days(simple_predictions, held_out_truth)
    tuned_report = evaluate_employee_days(tuned_predictions, held_out_truth)
    contextual_report = evaluate_employee_days(contextual_predictions, held_out_truth)
    scores = tuple(score for key in sorted(evaluation_keys) for score in score_rows[key])
    return ResearchEvaluation(
        methodology_version=METHODOLOGY_VERSION,
        evaluation_unit="employee_day_utc",
        calibration_unit_count=len(calibration_keys),
        evaluation_unit_count=len(evaluation_keys),
        simple_rule=DetectorEvaluation(SIMPLE_ALERT_THRESHOLD, simple_report, True),
        tuned_rules=DetectorEvaluation(
            tuned_threshold,
            tuned_report,
            compare_recall(simple_report.metrics, tuned_report.metrics).passed,
        ),
        contextual=DetectorEvaluation(
            contextual_threshold,
            contextual_report,
            compare_recall(simple_report.metrics, contextual_report.metrics).passed,
        ),
        scores=scores,
    )


def _build_signals(
    events: pl.DataFrame,
    partition_by_key: dict[EmployeeDayKey, str],
    context: SyntheticContext,
) -> dict[EmployeeDayKey, DaySignals]:
    grouped: dict[EmployeeDayKey, list[dict[str, object]]] = defaultdict(list)
    for row in events.iter_rows(named=True):
        timestamp = row["event_timestamp_utc"]
        if not isinstance(timestamp, datetime) or timestamp.tzinfo is None:
            raise ValueError("Prepared event timestamps must be timezone-aware.")
        key = EmployeeDayKey(row["employee_id"], timestamp.astimezone(UTC).date())
        if key not in partition_by_key:
            raise ValueError("Prepared event is missing its employee-day partition mapping.")
        grouped[key].append(row)

    baseline_days: dict[EmployeeDayKey, list[dict[str, object]]] = {
        key: rows for key, rows in grouped.items() if partition_by_key[key] == "baseline"
    }
    employee_devices: dict[str, set[str]] = defaultdict(set)
    employee_locations: dict[str, set[str]] = defaultdict(set)
    employee_volumes: dict[str, list[int]] = defaultdict(list)
    role_volumes: dict[str, list[int]] = defaultdict(list)
    role_days: dict[str, set[EmployeeDayKey]] = defaultdict(set)
    for key, rows in baseline_days.items():
        total = sum(_record_count(row["record_count"]) for row in rows)
        employee_volumes[key.employee_id].append(total)
        role_totals: dict[str, int] = defaultdict(int)
        for row in rows:
            role = str(row["role_id"])
            role_totals[role] += _record_count(row["record_count"])
            if row["device_id"]:
                employee_devices[key.employee_id].add(str(row["device_id"]))
            if row["location_label"]:
                employee_locations[key.employee_id].add(str(row["location_label"]))
        for role, role_total in role_totals.items():
            role_volumes[role].append(role_total)
            role_days[role].add(key)

    result: dict[EmployeeDayKey, DaySignals] = {}
    for key, rows in grouped.items():
        if partition_by_key[key] == "baseline":
            continue
        if key.employee_id not in context.employee_schedules:
            raise ValueError("Context file has no schedule for an event employee.")
        schedule = context.employee_schedules[key.employee_id]
        off_hours_ids: list[str] = []
        out_of_role_ids: list[str] = []
        unseen_device_ids: list[str] = []
        unseen_location_ids: list[str] = []
        failed_sign_ins = 0
        total_records = 0
        roles_for_day = {str(row["role_id"]) for row in rows}
        if roles_for_day - context.roles.keys():
            raise ValueError("Context file is missing a role authorization mapping.")
        for row in rows:
            event_id = str(row["event_id"])
            role_context = context.roles[str(row["role_id"])]
            if str(row["system"]) not in role_context.authorized_systems:
                out_of_role_ids.append(event_id)
            timestamp = cast(datetime, row["event_timestamp_utc"]).astimezone(
                ZoneInfo(schedule.timezone)
            )
            local_time = timestamp.time().replace(tzinfo=None)
            if not schedule.is_working_time(timestamp.weekday(), local_time):
                off_hours_ids.append(event_id)
            device = row["device_id"]
            if device and str(device) not in employee_devices[key.employee_id]:
                unseen_device_ids.append(event_id)
            location = row["location_label"]
            if location and str(location) not in employee_locations[key.employee_id]:
                unseen_location_ids.append(event_id)
            if row["event_type"] == "failed_sign_in":
                failed_sign_ins += 1
            total_records += _record_count(row["record_count"])

        own_days = len(employee_volumes[key.employee_id])
        role_id = next(iter(roles_for_day)) if len(roles_for_day) == 1 else ""
        role_day_count = len(role_days[role_id]) if role_id else 0
        cold_start = (
            own_days < MIN_PERSONAL_BASELINE_DAYS and role_day_count < MIN_ROLE_BASELINE_DAYS
        )
        reference_volumes = (
            employee_volumes[key.employee_id]
            if own_days >= MIN_PERSONAL_BASELINE_DAYS
            else role_volumes[role_id]
            if role_day_count >= MIN_ROLE_BASELINE_DAYS
            else []
        )
        baseline_median = median(reference_volumes) if reference_volumes else None
        high_volume = (
            baseline_median is not None
            and baseline_median > 0
            and total_records >= baseline_median * VOLUME_MULTIPLIER
        )
        result[key] = DaySignals(
            key=key,
            event_ids=tuple(sorted(str(row["event_id"]) for row in rows)),
            out_of_role_event_ids=tuple(sorted(out_of_role_ids)),
            off_hours_event_ids=tuple(sorted(off_hours_ids)),
            unseen_device_event_ids=tuple(sorted(unseen_device_ids)),
            unseen_location_event_ids=tuple(sorted(unseen_location_ids)),
            failed_sign_in_count=failed_sign_ins,
            record_count_total=total_records,
            unusually_high_volume=high_volume,
            cold_start=cold_start,
        )
    return result


def _scores(signals: DaySignals) -> tuple[ScoreResult, ScoreResult]:
    simple_points = 0
    simple_reasons: list[str] = []
    simple_evidence: set[str] = set()
    if signals.out_of_role_event_ids:
        simple_points += 50
        simple_reasons.append("out_of_role_access")
        simple_evidence.update(signals.out_of_role_event_ids)
    if signals.unusually_high_volume:
        simple_points += 50
        simple_reasons.append("high_access_volume")
        simple_evidence.update(signals.event_ids)
    if signals.failed_sign_in_count >= 5:
        simple_points += 50
        simple_reasons.append("repeated_failed_sign_ins")
        simple_evidence.update(signals.event_ids)
    simple = _score_result(signals.key, simple_points, simple_reasons, simple_evidence)

    contextual_points = 0
    contextual_reasons: list[str] = []
    contextual_evidence: set[str] = set()
    evidence_signals = (
        (
            bool(signals.out_of_role_event_ids),
            40,
            "out_of_role_access",
            signals.out_of_role_event_ids,
        ),
        (signals.unusually_high_volume, 30, "high_access_volume", signals.event_ids),
        (signals.failed_sign_in_count >= 3, 30, "repeated_failed_sign_ins", signals.event_ids),
        (
            bool(signals.unseen_device_event_ids),
            15,
            "unfamiliar_device",
            signals.unseen_device_event_ids,
        ),
        (
            bool(signals.unseen_location_event_ids),
            15,
            "unfamiliar_location",
            signals.unseen_location_event_ids,
        ),
        (
            bool(signals.off_hours_event_ids),
            10,
            "outside_declared_work_schedule",
            signals.off_hours_event_ids,
        ),
    )
    for present, points, reason, event_ids in evidence_signals:
        if present:
            contextual_points += points
            contextual_reasons.append(reason)
            contextual_evidence.update(event_ids)
    if signals.cold_start:
        contextual_reasons.append("insufficient_baseline_history")
    contextual = _score_result(
        signals.key, contextual_points, contextual_reasons, contextual_evidence
    )
    return simple, contextual


def _score_result(
    key: EmployeeDayKey,
    raw_score: int,
    reason_codes: list[str],
    evidence_event_ids: set[str],
) -> ScoreResult:
    score = min(100, raw_score)
    severity = "high" if score >= HIGH_SEVERITY_THRESHOLD else "medium" if score >= 40 else "low"
    return ScoreResult(
        key=key,
        score=score,
        severity=severity,
        reason_codes=tuple(reason_codes),
        evidence_event_ids=tuple(sorted(evidence_event_ids)),
    )


def _record_count(value: object) -> int:
    return int(value) if isinstance(value, (int, str)) else 0
