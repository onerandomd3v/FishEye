# FishEye — Product Requirements Document (PRD)

> **Product:** FishEye  
> **Document:** Product Requirements Document  
> **Version:** 1.0 — Initial MVP  
> **Status:** Approved direction; implementation requirements proposed for engineering review  
> **Updated:** 2026-10-21  
> **Companion:** [ARCHITECTURE.md](./ARCHITECTURE.md)  
> **Repository:** `onerandomd3v/FishEye`

## 1. Product summary

**FishEye is a context-aware insider-risk triage product.** Its first release evaluates whether individual and role-based behavioural context can reduce unnecessary alerts relative to fixed-rule detection, **without materially reducing detection recall**.

The product addresses **one problem**: legitimate but unusual employee activity often resembles suspicious access, creating alerts that consume analyst attention.

The MVP is a genuine first software release with extensible architecture, but its data is **synthetic only**. FishEye does not claim to be deployed at Zenith Bank, connected to any bank, or proven effective against production insider threats.

**Product promise:** *See the signal. Ignore the noise.*

**Primary hypothesis:** On a frozen, labelled synthetic banking-access evaluation set, FishEye's contextual detector will lower false-positive rate and alert burden compared with defensible fixed and tuned rules at a predeclared comparable-recall criterion.

This is a testable hypothesis, **not** an assumption or pre-announced successful result. Negative results must be displayed and documented.

## 2. Problem and why it matters

Security analysts must distinguish potential credential compromise or deliberate misuse from legitimate overnight shifts, travel, replacement devices, changing job roles and unusual but authorized workloads.

A detector that flags everything generates unnecessary work; a detector that suppresses too much misses threats.

**Research context:** Nigerian bank fraud reports document staff involvement, but do not prove the prevalence of behavioural-alert false positives at a particular institution. Zenith Bank publicly discloses security controls, including database activity monitoring and data-loss prevention. Existing UEBA and insider-risk platforms already offer related functionality. FishEye's intended contribution is **a narrowly evaluated contextual-triage implementation**, not invention of the product category.

**Scope boundary:** Detection and evaluation on fake employee identities, authorized roles and access logs. No real employees, customer records, bank credentials, production banking endpoints or real account interventions.

## 3. Users, responsibilities and access

| User | Primary job | MVP permissions |
| --- | --- | --- |
| Security analyst | Review prioritized risk findings, inspect evidence and record a review outcome | View approved synthetic datasets/runs, inspect findings, submit reviews |
| Researcher / evaluator | Run scenarios and compare detection approaches on identical datasets | Create synthetic runs, view metrics and exports |
| Workspace administrator | Configure access and protected environment settings | Manage invited analysts and evaluator roles; no ability to silently edit published results |
| Public visitor | Understand FishEye and its limitations | Read landing page; no access to investigation data |

A single user may hold multiple assigned roles. Backend authorization governs permissions, not hidden UI elements alone.

### Jobs-to-be-done

1. **When a potentially risky account is flagged**, understand *which events and contextual baselines* explain the priority before deciding to investigate.
2. **When legitimate activity looks unusual**, avoid escalating simply because it occurred outside a preset threshold.
3. **When testing a detection change**, evaluate it against fixed and tuned rule baselines using identical, versioned data and clearly reported misses.

## 4. MVP goals and measurable outcomes

### Product goals (P0)

- Generate, validate or import **synthetic-only** employee and access-event datasets with role context.
- Execute a simple fixed-rule detector, a tuned-rule comparator and FishEye's contextual detector over controlled test splits.
- Score events or account-windows with **consistent documented units**, show severity, reason codes, baseline comparisons and source evidence.
- Expose prioritized findings to authenticated analysts; allow human review status and notes.
- Publish reproducible experiment results: precision, recall, false-positive rate, alert rate and detection delay, including denominators and confusion-matrix counts.
- Present the public brand and protected product with **consistent light-only, monochrome UI**.
- Ensure separate deployability of landing, console, API and detection worker from the monorepo.

### Success gate

Define **before final testing** a recall tolerance, acceptable comparison procedure, unit of analysis, thresholds, dataset split strategy and confidence/variance reporting. FishEye is successful on its **stated experimental benchmark** only if it lowers false-positive rate or alert burden versus the simple baseline **without breaching the recall tolerance**, and clearly reports comparison with tuned rules.

A lower alert count accompanied by unacceptable missed threats is **not success**.

### Operational quality (non-numeric gates for MVP)

- A deterministic run can be reproduced from a saved dataset/version, configuration, seed and code revision.
- Incomplete or failed jobs cannot appear as successful results.
- An analyst cannot edit model scores or raw evidence through a review action.
- Unauthorized users cannot access protected endpoints or datasets.
- Critical workflows have loading, empty, error and retry states.

Numeric latency, throughput, availability and retention targets should be set **after representative profiling and deployment planning**, not invented in this PRD.

## 5. MVP product scope

### P0 — Must ship

| ID | Capability | User-facing result |
| --- | --- | --- |
| FE-001 | Public landing | Brief FishEye description, honest claim boundary and entry to the product |
| FE-002 | Analyst sign-in/access | Protected console; only authorized users see synthetic findings |
| FE-003 | Overview | Counts and prioritized account findings drawn from actual stored run results |
| FE-004 | Finding investigation | Score, severity, timeline, source event IDs, detected signals and comparison context |
| FE-005 | Analyst review | Record review status, short note, reviewer and timestamp without changing score |
| FE-006 | Scenario library | Named, versioned synthetic scenarios; launch an evaluation run |
| FE-007 | Run status | Queued, running, completed or failed, with understandable retry/error messaging |
| FE-008 | Evaluation | Side-by-side simple rules, tuned rules and contextual model with metrics/denominators |
| FE-009 | Export/provenance | Downloadable/retrievable evaluation manifest, dataset/config/version identifiers |
| FE-010 | Responsive states | Empty, loading, error, confirmation and insufficient-evidence patterns |
| FE-011 | Synthetic CSV validation | Check user-supplied event CSVs against the versioned employee-day schema before import |

### P1 — After P0 is proven

- Additional scenario types and more thorough sensitivity/stress testing.
- Parquet import and durable processing of user-supplied **synthetic** CSV datasets after the CSV contract is proven.
- Extended filter/search functionality and review history.
- Optional visualizations of score distribution and delay by scenario.

### Not in v1

- Real-bank SIEM/DAM/DLP/PAM integrations or employee monitoring.
- Automated MFA, account suspension, privilege changes or disciplinary actions.
- Generative-AI-written case notes as a requirement; model-generated text must never determine severity.
- Continuous real-time streaming, Kafka, feature store or microservices for each Python package.
- Commercial vendor accuracy comparisons without comparable test data.
- A broad security operations center, ticketing platform or multi-tenant customer billing system.

## 6. Core user journeys and acceptance criteria

### Journey A — Inspect and review a finding

**Flow:** Sign in → Overview → Choose finding → Evidence detail → Record review → Return to queue.

**Acceptance:**
- **AC-A1:** Overview lists only findings from an identifiable completed run and clearly labels the dataset synthetic.
- **AC-A2:** Findings show account ID, severity, risk score, run/detector version and short evidence summary.
- **AC-A3:** Details show underlying time-ordered source event IDs and reason codes; source timestamps are shown with an explicit timezone.
- **AC-A4:** The same stored score is visible in queue and detail; frontend does not recalculate it.
- **AC-A5:** Submitting a review stores analyst, decision, note and timestamp; evidence, score and run remain unchanged.
- **AC-A6:** Unauthenticated/unauthorized API requests fail appropriately; empty results and service errors have useful states.

**Allowed review states:** `unreviewed`, `under_review`, `reviewed_benign`, `escalated` (simulated/manual workflow; escalation does not contact a real bank).

### Journey B — Evaluate a detection approach

**Flow:** Choose existing synthetic dataset/scenario → Start run → Track job → Read side-by-side results → Inspect false positives and missed threats → Export manifest.

**Acceptance:**
- **AC-B1:** A run records dataset ID/hash, split version, seed, detector versions, parameter/config hash and code revision.
- **AC-B2:** Simple-rule, tuned-rule and contextual models evaluate on the **same frozen held-out test inputs**.
- **AC-B3:** Results include TP, FP, TN, FN, precision, recall, false-positive rate, alert rate and detection delay. Undefined metrics are labeled as such, not fabricated.
- **AC-B4:** Users can see false-positive and false-negative examples; reduced alerts cannot hide missed attacks.
- **AC-B5:** Re-running with identical versions/configuration/seed reproduces identical outputs, within documented deterministic numerical tolerance.
- **AC-B6:** Run status progresses legitimately through `queued`, `running`, then `completed` or `failed`; retries must not duplicate results.
- **AC-B7:** The UI does not claim that synthetic detection performance is real-world accuracy.

### Journey C — Understand FishEye before using it

**Flow:** Public landing → Read focused value proposition → Open protected console → Authenticate.

**Acceptance:**
- **AC-C1:** Landing explains contextual insider-risk triage in plain language, without unsupported superiority claims.
- **AC-C2:** Landing and console use FishEye SVG assets, Inter, white/light-only backgrounds, black text and neutral grays; no purple or dark theme.
- **AC-C3:** Layout is legible and keyboard accessible at desktop and supported smaller viewports; appropriate text alternatives exist.
- **AC-C4:** No protected employee/event/run data is exposed through public landing assets or static generation.

## 7. Synthetic data and scenario requirements

### Minimum dataset properties

Every synthetic access event needs:
- Stable fake employee ID and role/department context.
- UTC event timestamp plus declared display timezone.
- Event type, target system, device identifier, location context and relevant access volume.
- Role permission context for out-of-role signals.
- Dataset/schema version and reproducible generation seed.

**Ground truth is for calibration or evaluation only.** Calibration labels may select thresholds; held-out evaluation labels are joined only after predictions are frozen. Labels must never be available to the scoring model as features.

### Initial scenario families

| Scenario | Expected evaluation challenge |
| --- | --- |
| Normal workday | Avoid needless flagging |
| Legitimate overtime/night shift | Avoid treating unusual hours alone as high severity |
| Legitimate travel or new device | Avoid overreacting to a single new signal |
| Legitimate role change | Handle shifted permissions/baselines |
| Stolen-credential indicators | Combine unfamiliar device, origin and unusual time |
| Out-of-role access | Respect minimum Medium triage policy |
| Unusual bulk reads | Evaluate abnormal volume in role context |
| Slow repeated access | Expose model limitations on subtle activity |

These are scenario requirements, **not assumptions that every unusual record is malicious**. Preserve realistic benign counterexamples.

### Scoring contract

- Risk score: `0–100`; severity tier and thresholds versioned with detector.
- Explain each finding using observable, reproducible reason codes.
- Working outside normal hours **alone cannot yield High**.
- Access outside an authorized role is **at least Medium** under the MVP policy.
- Severity is a triage priority, not a judgment of intent.
- Cold-start baselines and legitimate role changes must be explicitly handled rather than silently treated as malicious.

**Important:** Exact algorithm, weights and thresholds remain engineering decisions to validate and freeze before final evaluation. Do not hardcode figures from the original presentation.

## 8. Information architecture and UI requirements

### Public web

- `/` — FishEye landing: short headline, explanation, how it works, direct product CTA and prototype disclaimer.
- Optional `/research` — methodology/limitations summary, only if necessary.

### Protected console

- `/login` — analyst authentication.
- `/overview` — key counts and prioritized findings.
- `/investigations` — findings list/filter.
- `/investigations/:id` — evidence-led investigation and human review.
- `/scenarios` — synthetic scenarios and run initiation.
- `/evaluation` — clear comparator metrics, selected run and failure analysis.

The main product experience should emphasize **three jobs**: prioritize, investigate and evaluate. The scenario runner supports evaluation, rather than becoming a separate feature-heavy product.

### Design contract

- Brand: **FishEye**.
- Typography: **Inter**.
- Appearance: **light mode only**; black, white and neutral gray; no purple or colored-dark UI.
- Assets: `assets/fisheye-mark.svg`, `assets/fisheye-wordmark.svg`, `assets/fisheye-logo.svg`.
- Use the connected FishEye Figma designs as the current visual reference; validate responsiveness, contrast, keyboard navigation, and state consistency during implementation.
- Distinguish measured result, simulation setup, detector inference and human judgment in interface copy.
- Never use attention-grabbing red/green alone to communicate risk; explicit severity labels are required.

## 9. Data, privacy, safety and quality requirements

- All v1 employee/access data must be synthetic; reject uploads that purport to contain real personal/banking records until a separate reviewed policy permits them.
- Analyst identities and authorization are real application security concerns even while event content is synthetic.
- No credentials or raw tokens committed to repository or exposed in UI.
- Backend authorization applies to every protected read and write.
- Dataset imports, if enabled, enforce format/schema/size constraints and safe error handling.
- Raw synthetic events and completed experiment artifacts are immutable; revisions create new versions.
- Every review is auditable; model output and analyst assessment stay separate.
- A run can fail; users must receive accurate status and recoverable instructions, not silent fallback to fake success.
- API and worker must use idempotent job/result publication and bounded retry behavior.
- Avoid promising legal compliance or banking readiness from a synthetic-data MVP.

## 10. Measurement and research integrity

**Primary comparison:** contextual model vs defensible simple rules at a predefined comparable-recall constraint, plus a tuned-rules comparator.

**Required measures:**
- Precision = TP / (TP + FP)
- Recall = TP / (TP + FN)
- FPR = FP / (FP + TN)
- Alert rate = alerts per 100 employee-days (define aggregation)
- Detection delay = first qualifying alert time minus injected onset

Metrics must use the **same unit of analysis**. The agreed initial unit is an employee-day, grouped by employee ID and UTC calendar date, with multiple events aggregated into at most one finding per employee-day per detector. User-level correlations and time windows must not artificially inflate the number of independent samples.

An evaluation report must include:
- Dataset composition (benign/malicious counts; key scenarios).
- Data generation assumptions and ground-truth construction.
- Training/calibration/test split method and leakage safeguards.
- Thresholds fixed before final tests.
- Per-scenario and aggregate errors, confusion matrices, alert counts and detection delays.
- Repeat-run variation/uncertainty and known synthetic-world limitations.
- Exact provenance to reproduce each result.

**No predetermined claimed improvement:** Prior presentation values (including 6.0 vs 16.9 false alarms and 0.80 precision) are historical claims to reproduce, not acceptance criteria or default UI values treated as factual new experiments.

## 11. Delivery architecture constraints

Implementation must follow [ARCHITECTURE.md](./ARCHITECTURE.md):

```text
apps/
  web/
    landing/           Astro public site
    console/           Next.js App Router analyst console
  backend/
    api/               FastAPI HTTP service
    worker/  Python evaluation/scoring worker
    packages/          shared importable Python domain/features/detectors/etc.
packages/
  ui/                  shared frontend components
  api-client/          generated typed client
  config/
research/              synthetic scenarios and versioned experiment manifests
infra/                 Docker Compose / deployment templates
assets/                SVG brand identity
```

No nested Git repositories. All four deployables can release independently. Web dependencies use pnpm/Turborepo, Python uses uv, and local development uses Compose. PostgreSQL stores transactional state and job metadata; immutable Parquet artifacts store bulk generated events and outputs.

**Out of scope:** Real-time enterprise SIEM integrations and operational banking controls. A future pilot is conditional on legal/privacy assessment, partner requirements, independent validation and new architecture decisions.

## 12. Delivery phases (dependency order)

| Phase | Objective | Exit criterion |
| --- | --- | --- |
| 0. Foundations | Monorepo, assets, locked tooling, CI, containers, API skeleton | Clean install/build/tests from fresh checkout |
| 1. Research engine | Synthetic generator, domain contracts, simple and tuned rules | Baseline datasets and metrics reproducible |
| 2. Contextual model | Role/personal baselines, traceable scores and guardrails | Golden-fixture tests and frozen comparison protocol |
| 3. Platform workflow | API, job queue, persistence, protected console | Can run experiment and inspect true stored findings end-to-end |
| 4. Product polish | Landing, consistent UI states, accessibility, audit reviews | Complete P0 flows pass end-to-end |
| 5. Evaluation and MVP release | Frozen tests, error analysis, security review and documentation | Reproducible evaluation; no unsupported claims; deployable v1 |

The phase order prevents polished mockups from being mistaken for a functioning detection system. Features may be worked on in parallel as long as contracts and evaluation rules are stable.

## 13. Release acceptance checklist

The MVP is release-ready when all are true:

- [ ] The four applications build and deploy independently from the monorepo.
- [ ] Full sign-in/authorization, synthetic scenario execution, findings, review and evaluation journeys pass.
- [ ] All displayed scores and summary metrics derive from actual completed backend runs, not hardcoded demos.
- [ ] All detectors use identical held-out evaluation data and expose their misses.
- [ ] Every finding has inspectable reason codes and evidence event references.
- [ ] Runs are versioned, immutable, reproducible and report failure accurately.
- [ ] Precision, recall, FPR, alert rate and delay are defined, computed correctly and validated against fixtures.
- [ ] Monochrome/light-only Inter UI, logo assets and responsive/error states are implemented.
- [ ] CI tests, migration checks, deployment instructions, security/access review and rollback notes exist.
- [ ] The product does not assert real-bank validation, legal certification or vendor superiority.

**A release may ship with neutral or negative experimental findings**, provided the system works correctly, reports them honestly and clearly states that the optimization hypothesis is not yet supported.

## 14. Decisions still requiring sign-off

| Question | Owner / timing |
| --- | --- |
| Final definitions for observation window and alert aggregation | Detection/research lead — before algorithm implementation |
| Scoring weights, calibration and tier thresholds | Detection/research lead — before held-out evaluation |
| Comparable-recall tolerance and primary success metric | Product + research — before test freeze |
| Final synthetic dataset sizes and scenario balance | Research — before benchmarks |
| Shared demo email/password and session-signing secret | Engineering — configure in console and API secret stores before shared deployment |
| Published retention and artifact expiration rules | Engineering/product — before release |
| Formal Figma implementation QA and responsive breakpoints | Design + frontend — during product polish |

Changes in scope or success criteria should be documented and reviewed. Architectural changes should be recorded as ADRs under `docs/adr/`.

---

## 15. References and source of truth

- [ARCHITECTURE.md](./ARCHITECTURE.md) — selected stack, boundaries, data flow, security and technical decisions.
- [FishEye GitHub repository](https://github.com/onerandomd3v/FishEye) — implementation and brand assets.
- [FishEye Figma product designs](https://www.figma.com/design/6ltsfIACCq14P4GQMbssi6) — design direction, subject to implementation validation.
- Research evidence: [Zenith Bank Annual Report 2025](https://www.digital.zenithbank.com/pdfs/annualreport2025.pdf) and [FITC Q2 2024 report](https://fitc-ng.com/wp-content/uploads/2024/09/Fraud-and-Forgery-2024-2nd-Quarter.pdf).

**Document rule:** The PRD specifies *what the product must achieve*. [ARCHITECTURE.md](./ARCHITECTURE.md) specifies *how the system is structured*. Neither is evidence that the described features are already implemented.
