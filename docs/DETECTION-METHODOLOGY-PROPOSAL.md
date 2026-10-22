# FishEye v1 detection and evaluation proposal

> **Status: v1 experimental policy approved provisionally.**
> The employee-day unit, separate calibration partition, 5 percentage-point
> recall tolerance, baseline rules, detector weights, thresholds, and calibration
> procedure are approved for implementation and synthetic demos. These choices
> are not scientifically validated. No held-out benchmark or effectiveness claim
> is authorized until its dataset and protocol are frozen and reviewed.

## Purpose

Define the smallest reproducible synthetic-data experiment that can test the
FishEye hypothesis: contextual employee behavior can reduce false alerts
against fair fixed-rule baselines without an unacceptable loss of threat
recall.

## Agreed decisions reflected in contracts

- MVP evaluation data is synthetic only.
- CSV rows represent events. Labels apply to an **employee-day**,
  grouped by employee ID and UTC calendar date.
- An employee-day belongs to exactly one partition; baseline activity precedes
  calibration activity, which precedes held-out evaluation activity.
- Baseline rows have no labels. Calibration/evaluation employee-days have one
  consistent `threat_scenario` or `benign_scenario` label.
- Ground truth is held separately from detector inputs and may only be joined
  after predictions are produced.
- Every detector comparator must receive identical data and splits.
- Candidate recall may be no more than **5 percentage points below** simple
  baseline recall. This is an absolute difference, not a relative percent drop.
- Any result must report errors, denominators, provenance and synthetic-world
  limitations. No prior presentation metrics are defaults or acceptance goals.

## Approved provisional v1 evaluation protocol

| Topic | Proposal | Reason |
| --- | --- | --- |
| Evaluation unit | One employee-day | Agreed CSV label unit; avoids counting correlated events as independent samples. |
| Decision window | UTC calendar day | Aligns scoring with ground truth and makes grouping deterministic. |
| Finding aggregation | At most one finding per employee-day per detector; preserve supporting event IDs and reason codes | Allows direct comparison against one employee-day label while retaining event-level evidence. |
| Positive prediction | An employee-day is positive if output reaches a detector's frozen alert threshold | Makes the confusion-matrix unit explicit. |
| Baseline history | Use only baseline rows and record the exact history range; calibration/evaluation rows cannot affect baseline features | Enforces temporal separation. |
| Calibration | Separate labeled `calibration` partition; tune thresholds there only | Keeps held-out labels out of threshold selection. This requires CSV v2. |
| Recall gate | Candidate recall at most 0.05 below simple-rule baseline recall | Agreed maximum absolute drop; report FPR and alert burden alongside recall. |
| Metrics | Employee-day TP/FP/TN/FN; precision, recall, FPR; alerts per 100 evaluation employee-days; detection delay only if onset timestamps are added | Avoids fabricating delay from fields not supplied. |
| Undefined ratios | Return `null` plus an explanatory status when the denominator is zero | Avoids substituting misleading perfect scores. |

Use every available employee-day in the baseline partition as history; do not
apply an invented calendar lookback. Personal volume history requires at least
three baseline employee-days. If that is unavailable, use the role median only
when the role has at least three baseline employee-days. If neither baseline is
available, do not flag high volume and include an insufficient-history reason.
Calibration and evaluation rows never contribute to these histories.

The v1 implementation follows this provisional policy for synthetic demos. It
does not produce a validated benchmark result. Current labels distinguish threat
from benign outcomes, but the CSV does not identify scenario families;
per-scenario reporting requires a future versioned scenario identifier rather
than treating the threat/benign label as a scenario ID.

## Approved provisional v1 scoring policy (experimental only)

The following values are approved for implementation and synthetic demos. They
remain experimental and must not be presented as scientifically validated or
used for a final held-out benchmark until a benchmark protocol and dataset are
frozen and reviewed.

| Candidate | Proposed score behavior |
| --- | --- |
| Simple rules | Add 50 points for any out-of-role access, 50 for unusually high volume, and 50 for at least five failed sign-ins; cap at 100. Alert threshold: 40. |
| Contextual | Add 40 for out-of-role access; 30 for high volume; 30 for at least three failed sign-ins; 15 each for an unseen device and unseen location; 10 for activity outside the declared schedule; cap at 100. |
| Severity | Low below 40, Medium from 40 through 69, High at 70 or above. Off-hours alone is 10 points; out-of-role access is at least 40. |
| High volume | Compare employee-day total against 3x the personal baseline median when at least three employee baseline days exist; otherwise use role median with at least three role baseline days. A zero/absent median does not trigger high volume. |
| Novelty | Device and location familiarity use only that employee's baseline observations. With no such history, nonempty devices/locations are marked unseen and the employee-day carries an insufficient-history reason. |
| Calibration | For tuned simple and contextual candidates, choose the strictest observed calibration-score threshold meeting simple-rule calibration recall minus 0.05. Calibration labels never tune on held-out evaluation. |

Scores are review priority, not proof of malicious intent. The provisional
thresholds, feature definitions, baseline selection and score aggregation are
versioned for synthetic experiments and still require validation before any
benchmark or effectiveness claim.

## Decisions still required before held-out benchmarking or release

1. **Benchmark dataset:** choose total size, scenario balance, generation
   assumptions and independent seeds before benchmarking.
2. **Scenario identity:** add a versioned scenario-family identifier if
   per-scenario metrics are required; current labels only encode threat/benign.
3. **Detection delay:** decide whether to add an explicit scenario onset time
   to a future dataset schema. The current CSV cannot support a reliable delay
   metric by itself.
4. **Authentication provider and roles:** decide before enabling protected
   console access outside the development-only workflow.

## Implementation sequence

1. Store this approved experimental policy version and its configuration hash
   with every run. **Implemented for development runs.**
2. Wire artifact loading and evaluation into a durable worker run with immutable
   provenance; expose actual stored results through the API and console.
   **Implemented for development runs.**
3. Decide whether scenario-family IDs or onset timestamps are needed before
   extending the dataset schema.
4. Freeze a benchmark dataset and protocol, then run held-out evaluation only
   after that review.

The development console can validate and import synthetic v2 CSV, queue a
durable run with a context sidecar, and display worker-produced metrics and
findings. This workflow is unauthenticated and must stay development-only. The
provisional method does not establish effectiveness.
