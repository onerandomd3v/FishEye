# FishEye — System Architecture

> **Status:** Proposed architecture for implementation  
> **Version:** 1.0 (initial MVP architecture)  
> **Updated:** 2026-10-21  
> **Repository:** `onerandomd3v/FishEye`  
> **Scope:** First production-minded version built with synthetic data; designed to evolve into a controlled institutional pilot, not a disposable demonstration.

## 1. Purpose and product boundary

**FishEye helps security analysts prioritize potentially risky employee account activity while reducing false-positive alerts.** It combines individual and role-aware context with observable signals, explains why findings were raised, and measures whether contextual triage improves on fixed-rule monitoring **at comparable recall**.

FishEye is **not** a full SIEM, core-banking application, endpoint protection product, DLP system, or autonomous employee-disciplinary decision maker. A high risk score is evidence for investigation, not proof of malicious intent.

**MVP objective:** Reproduce a measurable improvement against defensible fixed-rule baselines using **synthetic employee identities, synthetic access events and labelled test scenarios**. No live banking integration, employee monitoring, automated account suspension or production access-control action is in scope for v1.

The repository and interfaces should nevertheless use maintainable security, versioning, CI, observability and separation practices suitable for later expansion.

### Success criteria

- Same immutable test dataset, detector version, configuration, code revision and random seed produce reproducible results.
- Candidate detector reports precision, recall, false-positive rate, alert rate and detection delay beside simple and tuned rule baselines.
- Any false-positive reduction is assessed at comparable detection recall; missed threats are visible, never hidden by alert suppression.
- Every risk finding has traceable event references, feature values, applicable comparison baseline, scoring-rule version and reason codes.
- Analysts can inspect evidence and record review decisions without overwriting source events or experiment results.
- Public landing, analyst console, API and worker build and deploy independently from one repository.

## 2. Architectural principles

1. **Problem-led simplicity:** Add a service or technology only for an observed workload, isolation or reliability requirement.
2. **Single repository, multiple deployables:** Independently deployable applications are not separate Git repositories.
3. **Backend owns decisions:** The API/worker define scoring and enforce policy; frontend renders results but cannot invent or change scores.
4. **Reproducibility before sophistication:** Fixed rules and contextual statistics precede optional unsupervised ML experiments.
5. **Explicit data provenance:** Source record IDs, versions, time windows and dataset hashes travel with findings and experiments.
6. **Separation of operational and analytical storage:** PostgreSQL manages transactions; immutable Parquet artifacts preserve bulk synthetic events and results.
7. **Secure-by-design:** Least privilege, protected secrets, authentication, authorization, auditability, explicit retention and data minimization.
8. **No hidden AI dependency:** The MVP's explanatory evidence is deterministic. Any future LLM summary must be optional, evidence-grounded and prohibited from changing risk scores.
9. **Honest evaluation:** Never claim simulated performance establishes real-bank effectiveness.

## 3. Logical architecture

```text
Public visitors
    |
    v
apps/web/landing  (Astro, static/CDN)

Authorized analyst
    |
    v
apps/web/console  (Next.js App Router)
    |
    | Typed HTTPS requests / OpenAPI client
    v
apps/backend/api  (FastAPI / Pydantic)
    |                          |
    | transactional reads      | enqueue/inspect jobs
    v                          v
PostgreSQL <------> apps/backend/worker
    |                          |
    | experiment metadata      | read immutable data / write results
    |                          v
    +------------------> Versioned Parquet artifacts
                         (local object-store-compatible dev storage,
                          S3-compatible storage when deployed)

Shared importable Python domain/features/detector/evaluation libraries
(no HTTP hops between internal modules).
```

**Deployable applications, v1:**

| Unit | Responsibility | Independently deploy? |
| --- | --- | --- |
| `apps/web/landing` | Public marketing site, product explanation, research disclaimer | Yes — static |
| `apps/web/console` | Authenticated triage, findings, investigation and experiment UI | Yes — Next.js server runtime |
| `apps/backend/api` | API, access control, transactional state and job submission | Yes — container |
| `apps/backend/worker` | Synthetic generation, features, scoring and evaluation | Yes — separate container/process |

**Not separate microservices in v1:** detectors, feature engineering, simulation, evaluation and persistence are importable Python packages. Keeping them local avoids unnecessary distributed transactions, network dependencies and duplicated schema logic.

## 4. Repository layout

```text
FishEye/
├── apps/
│   ├── web/
│   │   ├── landing/                 # Astro; static, SEO and accessibility
│   │   └── console/                 # Next.js App Router, React, TypeScript
│   └── backend/
│       ├── api/                     # FastAPI application entrypoint
│       ├── worker/        # Worker application entrypoint
│       └── packages/                # uv workspace members
│           ├── domain/              # Identities, events, findings, decisions
│           ├── features/            # Time/device/role/volume feature extraction
│           ├── detectors/           # Fixed rules, contextual scorer, optional challengers
│           ├── simulation/          # Synthetic population and event generators
│           ├── evaluation/          # Metrics, splits, validation, reports
│           └── persistence/         # SQLAlchemy, repositories, artifacts
├── packages/
│   ├── ui/                          # Shared React components/design tokens
│   ├── api-client/                  # Generated OpenAPI TypeScript client
│   └── config/                      # Shared TypeScript, lint and build config
├── research/
│   ├── scenarios/                   # Reviewed scenario specifications
│   ├── datasets/                    # Manifests, not large untracked datasets
│   ├── experiments/                 # Frozen evaluation configurations
│   └── reports/                     # Result manifests and reproducible summaries
├── infra/
│   ├── compose.yaml                 # Local integration stack
│   └── docker/                      # API/worker images
├── docs/                            # Product, architecture, brand, design and development documents
├── assets/                          # Brand SVGs (already in repository)
├── .github/workflows/
├── pnpm-workspace.yaml
├── turbo.json
├── pyproject.toml                    # uv workspace root (once scaffolded)
├── uv.lock                          # Committed once generated
├── .env.example
├── README.md
```

The root should be one Git repository. `apps/web` and `apps/backend` are organizational divisions, **not Git submodules or nested repos**. Each deployable has its own build/runtime configuration and release target.

## 5. Technology decisions and rationale

| Layer | Initial decision | Why | Deliberately rejected for v1 |
| --- | --- | --- | --- |
| Landing | Astro + optional React islands | Mostly static content, minimal JS | Always-on SSR server |
| Analyst console | Next.js App Router, React, TypeScript | API-driven, interaction-heavy SPA | SSR as a default requirement |
| UI | Tailwind CSS + shared tokens/components | Consistent system across web apps | Separate design systems |
| API state | TanStack Query | Server-state caching, error/loading, invalidation | Generic global state store for server data |
| Event tables | TanStack Table | Explicit pagination/sort/filter | Rendering all rows client-side |
| Charts | Recharts | Sufficient research metrics visualizations | Full BI platform |
| Backend/API | Python + FastAPI + Pydantic | Close to scientific detector code, typed schema and OpenAPI | NestJS gateway without proven extra work |
| Persistence | PostgreSQL, SQLAlchemy 2, Alembic | Relational transactional records/migrations | Event lake embedded in app tables |
| Data transformation | Polars and NumPy | Columnar feature extraction and numeric routines | Streaming cluster |
| Detectors | Explicit rules/statistics, scikit-learn only when validated | Interpretable baselines and swappable challenger models | LLM as risk-score generator |
| Analytics/artifacts | DuckDB + immutable Parquet | Local/offline analytical queries, efficient experimental artifacts | Standalone data warehouse |
| Background work | Separate Python worker + PostgreSQL job table | Durable jobs with minimal infrastructure | Redis/Kafka/Temporal from day one |
| Tooling | pnpm + Turborepo (web), uv (Python) | Independent language-native dependency systems | Forcing Python into JS task/dependency semantics |
| Local runtime | Docker Compose | Reproducible integration testing | Kubernetes before demand |
| CI | GitHub Actions | Verify changed apps, migrations and experiment checks | Deployment without automated validation |

**Package boundaries:** `packages/ui` must not import backend internals; Python domain logic must not import FastAPI. The worker and API import shared Python libraries. Generate `packages/api-client` from version-controlled OpenAPI contracts and check schema compatibility in CI.

## 6. MVP modules and API responsibilities

### Web routes (subject to product review)
- Landing: `/`, `/research` (optional).
- Console: `/login`, `/overview`, `/investigations`, `/investigations/:id`, `/evaluation`, `/scenarios`.

### API resources (suggested `/api/v1` contract)
- `GET /health/live` and `GET /health/ready`
- `GET /findings`, `GET /findings/{id}`, `POST /findings/{id}/reviews`
- `GET /events` (server-paginated, authorized)
- `GET /scenarios`, `POST /runs`, `GET /runs/{id}`
- `GET /runs/{id}/metrics`, `GET /runs/{id}/findings`
- `GET /datasets` and `GET /datasets/{id}` (development-only, paginated metadata reads), `POST /datasets/imports/validate` (development-only schema validation), and `POST /datasets/imports` (development-only import of validated synthetic CSV into an immutable source artifact). `POST /runs` queues an idempotent development-only run using an encrypted context sidecar; `GET /runs`, `GET /runs/{id}`, and `GET /runs/{id}/findings` expose worker status and persisted outputs. `GET /runs/{id}/findings/{finding_id}` returns a stored finding and only its referenced source events; `POST /runs/{id}/findings/{finding_id}/reviews` appends a review record. The worker claims runs with expiring database leases, retries failures within a bound, prepares encrypted Parquet artifacts, evaluates the provisional policy, and publishes immutable encrypted results. API routes require OIDC bearer tokens with verified issuer, audience, signature, expiry and an analyst/admin role outside local development. The CSV, dataset and evaluation routes remain development-only and disabled outside local development; adding authentication does not enable them in a shared deployment. Local development review records explicitly identify the actor as unauthenticated local development. See [DATASET-CSV.md](./DATASET-CSV.md) and [ADR 0001](./adr/0001-provider-neutral-oidc.md).

Requests and responses require stable IDs, explicit timestamps/timezones, pagination contracts, error codes and a `schema_version` where appropriate. Document authorization rules per endpoint. Never let the browser trigger an arbitrary shell/script execution.

### Application responsibilities
- **API:** Authorize actors, validate schemas, manage uploaded dataset references, persist experiment/job state, expose findings and immutable result links.
- **Worker:** Prepare imported CSVs as encrypted, immutable Parquet artifacts with ground truth stored separately from detector event inputs. The development worker claims durable runs, loads versioned artifacts, executes provisional comparators on identical splits, atomically publishes outcomes, and records failure metadata.
- **UI:** Render honest simulation provenance and investigation evidence; distinguish observed event, anomaly reason and inferred severity.

## 7. Data contracts and provenance

Core entities (conceptual, not finalized SQL schema):

| Entity | Representative fields |
| --- | --- |
| `analyst_user` | id, organization_id, auth_subject, role, status |
| `synthetic_employee` | id, dataset_id, role_id, department_id, baseline metadata |
| `synthetic_event` | id, dataset_id, employee_id, event_time_utc, event_type, system, device_id, location_label, volume |
| `scenario` | id, version, description, ground_truth_conditions |
| `dataset` | id, version, sha256, schema_version, seed, created_at, artifact_uri |
| `detector_version` | id, method, config_hash, code_revision, parameters |
| `experiment_run` | id, dataset_id, detector_version, baseline_versions, seed, status, timestamps, manifest |
| `finding` | id, run_id, employee_id, score, tier, reason_codes, evidence_event_ids |
| `review` | id, finding_id, analyst_id, decision, note, timestamp |
| `job` | id, type, status, lease_owner, lease_until, attempts, idempotency_key |
| `audit_record` | id, actor, action, target, time, result |

Only necessary metadata and indexable views need PostgreSQL rows. Large event collections, feature matrices and scored outputs are immutable Parquet artifacts referenced via manifests.

**Artifact integrity:** Hash bytes (SHA-256), include schema and dataset versions, freeze experiment splits, and preserve code commit, random seed, algorithm configuration, library versions and scoring time window. Do not silently overwrite published run artifacts.

**Identity separation:** Synthetic employee IDs are not login accounts. `analyst_user` represents the authenticated application operator and must be modeled independently.

The current local development review table is append-only and records decision, note, finding/run IDs, timestamp, and the explicit label `Local development user (not authenticated)`. It does not establish reviewer identity or satisfy production audit requirements.

## 8. Detection and scoring design

The engine uses a stable interface:

```python
class Detector(Protocol):
    def fit(self, baseline_events, role_context) -> None: ...
    def score(self, candidate_events) -> list[RiskFinding]: ...
```

The exact typed signatures will be specified in code. Every emitted finding must provide:
- score `0..100`, tier, rule/model version and thresholds;
- relevant signals (e.g., unseen device, unusual location, out-of-role system, changed access volume);
- baseline context used, with a reference to its training window;
- evidence event IDs; and
- guardrail decisions.

**Initially implement:**
1. **Simple-rule baseline** (clear and defensible thresholds).
2. **Tuned-rule baseline** (calibrated using development data only).
3. **FishEye contextual scorer** (individual/role baselines and interpretable signal combinations).
4. **Optional challenger** such as Isolation Forest **only if** data and evaluation justify it.

**Safeguards:** Unusual hours alone must not produce a High tier; out-of-role access cannot rank below Medium in the research policy. Treat these as *product research policies*, not universal regulatory mandates. Train reference behaviour only on approved history; evaluate separately on held-out data to avoid leakage. Newly hired employees and changed roles need explicit cold-start behavior.

**Response policy for v1:** Observe → Flag → Recommend verification → Escalate to analyst. The console simulates verification/escalation and records review decisions; it does not reset passwords, suspend accounts, send real MFA challenges or contact actual employees.

## 9. Experimental design and acceptance gates

Ground truth is defined by scenario metadata and never exposed to scoring logic.

**Required scenario families:**
- Routine working-hour activity.
- Legitimate overnight shift/overtime.
- Legitimate travel and newly assigned equipment.
- Legitimate role change.
- Suspicious new device + foreign-origin login + off-hours access.
- Out-of-role access and unusual high-volume reads.
- Low-volume repeated anomalous access (challenge case).

**Evaluation rules:**
- Use the same immutable dataset and splits for all compared detectors.
- Separate data generation, tuning/calibration and final held-out testing.
- Use distinct seeds and, where appropriate, temporal splits; document dependence among repeated events from a user.
- Do not change thresholds after observing final test results.
- Report per-scenario and aggregate metrics with denominators and the alert threshold.
- Include failures, negative results and uncertainty; repeated simulations do not equal independent real incidents.

**Metrics:**

```text
precision            = TP / (TP + FP)
recall               = TP / (TP + FN)
false_positive_rate  = FP / (FP + TN)
alert_rate           = alerts / employee-days * 100
detection_delay      = first qualifying alert time - injected onset time
```

Handle zero denominators explicitly; do not substitute arbitrary 100% scores. Define the unit of analysis (**event**, **session** or **employee-window**) before computing confusion matrices to avoid inflated sample counts.

**Primary gate:** At a predefined recall tolerance, candidate FPR and alert burden must beat the simple baseline, with comparison against tuned rules. Do not ship superiority language if the evidence fails this gate.

The original presentation's 20 simulated runs, 50 employees, four injected attackers, 6.0 versus 16.9 false alarms and 0.80 precision are **historical claims to reproduce**, not hardcoded application success data or independently validated production results.

## 10. Background job reliability

A PostgreSQL-backed queue is sufficient initially **if** implemented carefully:

- API inserts a job and run record transactionally and returns `202 Accepted` + `run_id`.
- Worker claims an available row using transactional locking (`FOR UPDATE SKIP LOCKED`), marks a lease, and commits.
- Long jobs extend lease/heartbeat and can be reclaimed after worker failure.
- Each job carries a stable idempotency key; retries must not produce duplicate published artifacts/findings.
- Attempt limits, bounded retries, backoff, cancellation intent and terminal failure states are explicit.
- Artifacts are written to a temporary path then atomically promoted/manifested on successful completion.
- Worker startup/shutdown and migration compatibility are tested.

**Upgrade trigger:** Introduce a dedicated task broker (e.g., Celery plus suitable broker) only if measured throughput, scheduling, operational support or failure-recovery requirements outgrow this mechanism.

## 11. Security, privacy and governance

Although v1 contains synthetic events, build the platform with future sensitivity in mind.

- Authenticated analyst console and backend-enforced role-based access control; use the provider-neutral OIDC authorization-code flow for shared deployments.
- Distinguish public landing content from protected API/console resources.
- HTTPS in deployed environments, strict CORS origins, secure sessions/tokens, rate limits, input limits and vulnerability scanning.
- Separate runtime identities for API, worker and migrations; minimum required database/object-store permissions.
- Database credentials, signing keys and tokens live in secrets management/environment; never in source control or screenshots.
- Upload restrictions: allowed schemas/formats, byte limits, streaming validation, safe filenames and rejection of unexpected personal data.
- Structured audit records for analyst access and review actions; immutable score provenance.
- Pseudonymized/synthetic employee views; define retention/deletion rules per dataset and run.
- Development, staging and production must isolate credentials, databases, storage and allowed origins.
- Do not represent the prototype as legally compliant or technically suitable for real employee monitoring without a Nigerian legal/privacy review, DPIA where applicable, threat modelling, independent testing and a bank-controlled pilot plan.

**Threat model targets:** unauthorized dataset viewing, forged synthetic events, score manipulation, malicious uploads, job replay/duplication, training/test contamination, data exfiltration and privilege escalation.

## 12. User experience and visual contract

The source-of-truth brand is **FishEye** (not the previous Sentinel concepts):
- Inter typeface throughout.
- White/light mode only; black, white and neutral grays. No purple and no dark mode.
- Maintain one shared design token set and reusable UI primitives across landing and console.
- Prioritize overview, evidence-led investigation, scenario execution and evaluation. Avoid a feature-heavy fake SOC.
- Prominently label synthetic/demo results and differentiate fact, computed anomaly and analyst judgement.
- Empty/loading/error/retry states must work and explain what happened.

Use the connected Figma FishEye MVP frames for implementation reference, followed by an accessibility and responsiveness pass before production release. Keep SVG brand assets under `assets/`.

## 13. Local environment and delivery

- **JavaScript:** pin Node and pnpm versions; commit `pnpm-lock.yaml`.
- **Python:** use uv workspaces; pin interpreter compatibility and commit `uv.lock`.
- **Containers:** Docker Compose for PostgreSQL, API and worker; deterministic local artifact volume.
- **Migrations:** Alembic migrations run as an explicit deployment step, not implicitly in every application instance.
- **Frontend:** statically deploy the Astro landing; run the Next.js console with its request-time server runtime. Deploy landing and console independently.
- **Backend:** separate API and worker container images; managed PostgreSQL and object storage for hosted environments.
- **Configuration:** documented `.env.example`; no implicit unsafe production fallbacks.
- **Health:** distinguish liveness from readiness (DB/required dependencies) and expose no sensitive diagnostics publicly.
- **Observability:** request/correlation IDs, job/run IDs, structured logs, basic duration/error metrics; no sensitive payload logging.

## 14. Testing and CI gates

**Each pull request should run, as relevant:**
1. Web lint/type-check, UI tests and production builds.
2. Python format/lint/type checks, unit tests for score guardrails and contract schemas.
3. PostgreSQL integration tests for migrations, data authorization and job lease/recovery logic.
4. Golden-fixture tests for deterministic detection decisions.
5. Experiment smoke test: fixed seed produces expected manifest and correctly recomputed metrics.
6. OpenAPI client generation/contract compatibility check.
7. Dependency/security scans and secret detection.

**Pre-release gates:** full end-to-end synthetic scenario flow, review of authorization, backup/restore validation, reproducible clean deployment and documented rollback.

## 15. Nonfunctional targets and scale strategy

Do **not** invent SLA, throughput or latency numbers before benchmarking. Instead instrument:
- API p50/p95 latency at expected request sizes.
- worker runtime and peak memory by dataset size;
- queue age, completion/failure/retry rates;
- artifact storage growth and query costs;
- user-observed dashboard and table responsiveness.

For growth, consider database partitioning and higher-volume ingestion only after profiling; adopt a broker/streaming platform only for concrete sustained event rates or integration demands. Scale API and worker independently and retain immutable experiments across releases.

## 16. Roadmap

**MVP v1 — now**
1. Set up monorepo, pinned tooling, CI and Docker Compose.
2. Implement schemas, PostgreSQL migrations and secure analyst access.
3. Build synthetic scenario/data generation and immutable artifact manifests.
4. Implement baseline detectors, contextual scoring, reason codes and policy guards.
5. Implement durable evaluation jobs, metrics, tests and compare runs.
6. Build FishEye console and landing from the approved Figma direction.
7. Document experimental results, limitations and failure cases.

**Pilot readiness — conditional, not MVP scope**
- Expert interviews and written pilot success criteria.
- Legal/privacy assessment and documented monitoring safeguards.
- A bank-approved log/data contract, permission model and threat model.
- Shadow/read-only ingestion in an isolated environment.
- Comparison with the bank's existing tooling, using bank-controlled measures.
- Measured costs, scalability, auditability and incident-response integration.

**Future — only with evidence**
- Broader correlation, additional supervised/unsupervised challengers, optional evidence-linked AI summaries, real-time queues or SIEM/DAM connectors. None is a prerequisite to proving the v1 hypothesis.

## 17. Explicit decisions and open questions

| Decision | State |
| --- | --- |
| One Git monorepo with `apps/web` and `apps/backend` | **Accepted** |
| Landing, console, API and worker separately deployable | **Accepted** |
| Python scoring stack and independently versioned experiment artifacts | **Accepted** |
| No LLM required for the core score or evaluation | **Accepted** |
| Synthetic data only for MVP v1 | **Accepted** |
| Exact scoring formula, thresholds and calibration protocol | **Open — define before experiment freeze** |
| Provider-neutral OIDC protocol and analyst/admin API roles | **Accepted; Auth0 selected for the first shared demo; hosting remains open** |
| Object storage vendor and hosting provider | **Open — choose by constraints, not brand** |
| Final API schemas and PostgreSQL tables | **Open — establish with implementation PRs** |
| Whether a bank will sponsor a future pilot | **Unverified — never assume** |

**Architecture evolution rule:** Changes to deployable boundaries, detection methodology, data provenance or security assumptions require a dated Architecture Decision Record (ADR) in `docs/adr/`, including alternatives considered and migration impact.

---

**References for engineering implementation:** [FastAPI](https://fastapi.tiangolo.com/), [Pydantic](https://docs.pydantic.dev/), [SQLAlchemy](https://docs.sqlalchemy.org/), [PostgreSQL locking](https://www.postgresql.org/docs/current/sql-select.html), [Polars](https://docs.pola.rs/), [DuckDB Parquet](https://duckdb.org/docs/stable/data/parquet/overview), [scikit-learn](https://scikit-learn.org/stable/), [Astro](https://docs.astro.build/), [Next.js](https://nextjs.org/docs/app), [uv workspaces](https://docs.astral.sh/uv/concepts/projects/workspaces/), [pnpm workspaces](https://pnpm.io/workspaces), [Turborepo](https://turborepo.com/docs), [OpenAPI](https://spec.openapis.org/oas/latest.html).

This document specifies intended architecture; it is **not** a statement that application services or infrastructure have already been implemented.
