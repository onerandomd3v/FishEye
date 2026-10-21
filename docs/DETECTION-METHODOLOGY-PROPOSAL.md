# FishEye v1 detection and evaluation proposal

> **Status: proposal for product/research review.** This document does not
> authorize detector behavior, thresholds, a held-out benchmark, or performance
> claims. Resolve the open decisions below before implementing the scoring
> method or freezing test results.

## Purpose

Define the smallest reproducible synthetic-data experiment that can test the
FishEye hypothesis: contextual employee behavior can reduce false alerts
against fair fixed-rule baselines without an unacceptable loss of threat
recall.

## Decisions already reflected in repository contracts

- MVP evaluation data is synthetic only.
- CSV rows represent events. Evaluation labels apply to an **employee-day**,
  grouped by employee ID and UTC calendar date.
- An employee-day belongs to exactly one partition; baseline activity precedes
  evaluation activity.
- Baseline rows have no labels. Evaluation employee-days have one consistent
  `threat_scenario` or `benign_scenario` label.
- Ground truth is held separately from detector inputs and may only be joined
  after predictions are produced.
- Every detector comparator must receive identical data and splits.
- Any result must report errors, denominators, provenance and synthetic-world
  limitations. No prior presentation metrics are defaults or acceptance goals.

## Proposed first evaluation protocol

| Topic | Proposal | Reason |
| --- | --- | --- |
| Evaluation unit | One employee-day | Matches the agreed CSV label unit and avoids counting correlated events as independent samples. |
| Decision window | UTC calendar day | Aligns the scoring window with ground truth and makes cross-run grouping deterministic. |
| Finding aggregation | At most one finding per employee-day per detector; preserve all supporting event IDs and reason codes | Allows direct comparison against one employee-day label while retaining event-level evidence. |
| Positive prediction | An employee-day is predicted positive if its detector output reaches that detector's frozen alert threshold | Makes the confusion matrix unit explicit; the threshold itself remains to be decided. |
| Baseline history | Use only rows in the baseline partition and never evaluation labels; record the exact history range used by each run | Enforces temporal separation and makes baseline provenance inspectable. |
| Initial baseline comparator | A simple, documented ruleset using only fields present in the CSV; add the tuned-rules comparator only after a calibration split is specified | Establishes a transparent first benchmark without implying that a detector has already been selected. |
| Metrics | Employee-day TP/FP/TN/FN; precision, recall, FPR; alerts per 100 evaluation employee-days; detection delay only if synthetic onset timestamps are added to the contract | Defines denominators and avoids fabricating delay from fields not currently supplied. |
| Undefined ratios | Return `null` plus an explanatory status when the denominator is zero | Avoids substituting misleading perfect scores. |

This protocol is intended for review. In particular, the employee-day decision
window is a proposal: the PRD mentions account-time windows as a likely initial
unit, so product/research should explicitly accept or replace this choice.

## Decisions still required before detector implementation

1. **Decision window and aggregation:** accept employee-day / UTC day, or choose
   a different window and explain how employee-day labels map to it.
2. **Baseline history:** define the history span and minimum data needed for an
   employee-specific baseline; specify the role-level cold-start behavior.
3. **Simple-rule baseline:** approve its signals and rule behavior, including
   the off-hours and out-of-role guardrails.
4. **Scoring and calibration:** define the contextual signals, weights or
   formula, calibration split, severity thresholds, and detector alert
   thresholds. Fit/tune only on development or calibration data.
5. **Success gate:** choose the primary metric and maximum acceptable recall
   loss before viewing held-out results. Report FPR and alert burden alongside
   recall, not in place of it.
6. **Benchmark dataset:** choose total size, scenario balance, generation
   assumptions and independent seeds before benchmarking.
7. **Detection delay:** decide whether to add an explicit scenario onset time
   to a future dataset schema. The current CSV cannot support a reliable delay
   metric by itself.

## Implementation sequence after review

1. Record approved choices in a versioned methodology/config contract.
2. Implement typed domain events and labels with a hard boundary preventing
   labels from entering detector inputs; add employee-day grouping tests.
3. Build deterministic synthetic generation and immutable manifests.
4. Implement the simple-rule comparator and evaluation arithmetic with golden
   tests; verify same-input, same-split behavior.
5. Add calibrated/tuned rules and the contextual scorer only under the reviewed
   specification, then freeze and run held-out evaluation.
6. Persist dataset/run provenance and job state, expose actual results through
   the API, and connect the console to stored outputs.

Until these steps are complete, CSV validation is only schema validation. It
does not import a dataset, execute detection, or establish effectiveness.
