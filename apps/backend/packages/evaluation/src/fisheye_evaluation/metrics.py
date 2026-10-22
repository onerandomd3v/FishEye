"""Confusion-matrix metrics and the approved recall comparison gate."""

from collections.abc import Mapping
from dataclasses import dataclass
from math import isclose

from fisheye_domain.evaluation import EmployeeDayKey, EmployeeDayTruth, GroundTruthLabel

MAX_RECALL_DROP = 0.05


@dataclass(frozen=True)
class Ratio:
    """A metric value and its denominator, or an explicit undefined reason."""

    value: float | None
    numerator: int
    denominator: int
    undefined_reason: str | None = None


@dataclass(frozen=True)
class ConfusionCounts:
    true_positive: int
    false_positive: int
    true_negative: int
    false_negative: int


@dataclass(frozen=True)
class EvaluationMetrics:
    unit_count: int
    alert_count: int
    confusion: ConfusionCounts
    precision: Ratio
    recall: Ratio
    false_positive_rate: Ratio
    alerts_per_100_employee_days: Ratio


@dataclass(frozen=True)
class ScenarioEvaluation:
    scenario_id: str
    metrics: EvaluationMetrics


@dataclass(frozen=True)
class EvaluationReport:
    metrics: EvaluationMetrics
    by_scenario: tuple[ScenarioEvaluation, ...]


@dataclass(frozen=True)
class RecallGate:
    passed: bool
    baseline_recall: Ratio
    candidate_recall: Ratio
    maximum_drop: float
    observed_drop: float | None
    reason: str | None = None


def evaluate_employee_days(
    predictions: Mapping[EmployeeDayKey, bool],
    truth: Mapping[EmployeeDayKey, EmployeeDayTruth],
) -> EvaluationReport:
    """Compute employee-day metrics after detector output has been frozen."""
    if set(predictions) != set(truth):
        raise ValueError(
            "Predictions and evaluation truth must cover the exact same employee-days."
        )
    if not predictions:
        raise ValueError("Evaluation requires at least one employee-day.")
    if any(key != row.key for key, row in truth.items()):
        raise ValueError("Truth mapping keys must match their employee-day records.")

    metrics = _metrics(predictions, truth)
    scenario_ids = sorted(
        {row.scenario_id for row in truth.values() if row.scenario_id is not None}
    )
    by_scenario = tuple(
        ScenarioEvaluation(
            scenario_id=scenario_id,
            metrics=_metrics(
                {
                    key: prediction
                    for key, prediction in predictions.items()
                    if truth[key].scenario_id == scenario_id
                },
                {key: row for key, row in truth.items() if row.scenario_id == scenario_id},
            ),
        )
        for scenario_id in scenario_ids
    )
    return EvaluationReport(metrics=metrics, by_scenario=by_scenario)


def calibrate_threshold(
    scores: Mapping[EmployeeDayKey, float],
    truth: Mapping[EmployeeDayKey, EmployeeDayTruth],
    *,
    minimum_recall: float,
) -> tuple[float, EvaluationReport]:
    """Choose the strictest calibration threshold that meets a recall floor.

    This function is intended for the calibration partition only. It does not
    accept evaluation data and therefore cannot tune against held-out labels.
    """
    if set(scores) != set(truth):
        raise ValueError("Calibration scores and labels must cover the exact same employee-days.")
    if not scores:
        raise ValueError("Calibration requires at least one employee-day.")
    if not 0 <= minimum_recall <= 1:
        raise ValueError("minimum_recall must be between 0 and 1.")
    if any(not 0 <= score <= 100 for score in scores.values()):
        raise ValueError("Detector scores must be between 0 and 100.")
    if not any(row.label is GroundTruthLabel.THREAT for row in truth.values()):
        raise ValueError("Calibration requires at least one threat employee-day.")

    candidates = sorted(set(scores.values()), reverse=True)
    selected_report: EvaluationReport | None = None
    selected_threshold: float | None = None
    for threshold in candidates:
        report = evaluate_employee_days(
            {key: score >= threshold for key, score in scores.items()}, truth
        )
        recall = report.metrics.recall.value
        if recall is not None and recall >= minimum_recall:
            selected_threshold = threshold
            selected_report = report
            break
    if selected_threshold is None or selected_report is None:
        raise ValueError("No calibration threshold meets the requested recall floor.")
    return selected_threshold, selected_report


def compare_recall(
    baseline: EvaluationMetrics,
    candidate: EvaluationMetrics,
    *,
    maximum_drop: float = MAX_RECALL_DROP,
) -> RecallGate:
    """Apply the approved absolute recall-drop limit in percentage-point units."""
    if not 0 <= maximum_drop <= 1:
        raise ValueError("maximum_drop must be between 0 and 1.")
    if baseline.recall.value is None or candidate.recall.value is None:
        return RecallGate(
            passed=False,
            baseline_recall=baseline.recall,
            candidate_recall=candidate.recall,
            maximum_drop=maximum_drop,
            observed_drop=None,
            reason="Recall is undefined for at least one detector.",
        )
    drop = baseline.recall.value - candidate.recall.value
    passed = drop <= maximum_drop or isclose(drop, maximum_drop, abs_tol=1e-12)
    return RecallGate(
        passed=passed,
        baseline_recall=baseline.recall,
        candidate_recall=candidate.recall,
        maximum_drop=maximum_drop,
        observed_drop=drop,
        reason=None if passed else "Candidate recall fell beyond the approved limit.",
    )


def _metrics(
    predictions: Mapping[EmployeeDayKey, bool],
    truth: Mapping[EmployeeDayKey, EmployeeDayTruth],
) -> EvaluationMetrics:
    tp = fp = tn = fn = 0
    for key, is_alert in predictions.items():
        is_threat = truth[key].label is GroundTruthLabel.THREAT
        if is_threat and is_alert:
            tp += 1
        elif not is_threat and is_alert:
            fp += 1
        elif not is_threat:
            tn += 1
        else:
            fn += 1
    counts = ConfusionCounts(tp, fp, tn, fn)
    total = len(predictions)
    return EvaluationMetrics(
        unit_count=total,
        alert_count=tp + fp,
        confusion=counts,
        precision=_ratio(tp, tp + fp, "No employee-days were predicted positive."),
        recall=_ratio(tp, tp + fn, "No threat employee-days were present."),
        false_positive_rate=_ratio(fp, fp + tn, "No benign employee-days were present."),
        alerts_per_100_employee_days=Ratio(
            value=(tp + fp) / total * 100,
            numerator=tp + fp,
            denominator=total,
        ),
    )


def _ratio(numerator: int, denominator: int, reason: str) -> Ratio:
    return Ratio(
        value=numerator / denominator if denominator else None,
        numerator=numerator,
        denominator=denominator,
        undefined_reason=None if denominator else reason,
    )
