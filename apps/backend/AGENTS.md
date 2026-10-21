# Backend Agent Instructions — FishEye

Applies to all files under `apps/backend/`. **Also follow the repository root [AGENTS.md](../../AGENTS.md)** and read [ARCHITECTURE.md](../../ARCHITECTURE.md), [PRD.md](../../PRD.md) before changing domain behavior.

## Ownership and boundaries

- `api/`: **FastAPI** HTTP service, request/response validation (Pydantic), authorization, persistence access, and durable job submission.
- `worker/`: **Python background worker** for synthetic generation, feature engineering, contextual scoring, baseline comparison and experiment reporting.
- `packages/`: importable Python packages (`domain`, `features`, `detectors`, `simulation`, `evaluation`, `persistence`). They are **not** separate HTTP microservices.
- Use **uv** for workspace/dependency management. Use PostgreSQL + SQLAlchemy 2 + Alembic for transactional state; Polars, NumPy, DuckDB and immutable Parquet for analytical workflows. Use scikit-learn only for justified experimental challengers.
- Keep FastAPI frameworks outside the pure domain and detector packages. Keep request handlers thin and worker/scoring functions testable independently.

## Scientific integrity — mandatory

1. MVP data is **synthetic only**. Do not ingest genuine bank, employee or customer access records.
2. Ground truth and injected scenario labels must not become scoring features.
3. Evaluate simple-rule, tuned-rule and contextual detectors against identical immutable held-out splits. Tuning must not inspect final test data.
4. Persist dataset hash, seed, config hash, detector version, code revision, split definition, evaluation unit, timestamps, resulting hashes and metrics.
5. Derive TP/FP/TN/FN, precision, recall, FPR, alert burden and delay from genuine run outputs; handle undefined ratios transparently.
6. Risk priority is not proof of malicious intent. Off-hours alone **cannot** yield High; out-of-role access must be **at least Medium** under current v1 policy.
7. A completed experiment is immutable. Analyst reviews do not change scores or event provenance.
8. Never hide false negatives, tune away comparative failures or hardcode historical presentation figures as fresh results.
9. Exact detector formulas, calibration scheme and recall tolerance must be specified and frozen before held-out benchmarking; require a reviewed methodology decision for material changes.

## Operational integrity

- Use versioned schemas, UTC timestamps, stable IDs and explicit role-context definitions.
- Keep large raw synthetic events and feature matrices in versioned Parquet artifacts, with manifest references in PostgreSQL.
- Worker claims jobs transactionally with leases, bounded retries and idempotent output publication. Never hold a DB lock during heavy computation.
- Queue states `queued`, `running`, `completed`, `failed` must reflect actual worker outcomes. Never publish partial results as completed.
- Require Alembic migrations for schema changes, with compatibility and rollback/backfill thought through. Never run destructive migrations without explicit approval.
- Validate inputs and safe synthetic-only uploads; enforce size, type and resource bounds.
- Enforce server-side RBAC, resource ownership, least privilege, secret protection and audit records. Handle file path / artifact access authorization explicitly.
- Never return private credentials or internal stack traces to clients. Keep structured logs free of secrets.

## Testing gates

- Golden fixtures for score guardrails, baseline behavior, benign overtime/travel/role-change and cold-start conditions.
- Confusion matrix arithmetic, zero denominators, held-out leakage prevention, deterministic replays and per-scenario error reporting.
- Concurrency, duplicate job submission, lease recovery, retry/cancellation and atomic artifact publication.
- API contract, error-path and authorization tests, including cross-user resource access attempts.
- Alembic migration and PostgreSQL integration tests.
- An end-to-end synthetic evaluation producing real findings and metrics through API → worker → persistence.

Use existing `pyproject.toml` scripts/CI commands when scaffolded; do not assert success for unrun checks. Explain performance tradeoffs and measure representative data sizes before recommending new processing infrastructure.

## Changes requiring review

A new service boundary, external queue, alternative database, scoring method, severity guardrail, production data support or changed evaluation success threshold requires explicit architectural/product approval and an ADR where appropriate. Never let a frontend convenience request redefine backend truth.
