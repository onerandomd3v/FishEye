# AGENTS.md — FishEye Coding Agent Instructions

> Scope: the entire FishEye Git repository.  
> Audience: Codex and human contributors.  
> Status: binding repository workflow instructions; update alongside architecture/PRD changes.

## Mission and sources of truth

FishEye is a production-minded, synthetic-data-only MVP for **context-aware insider-risk triage and reproducible evaluation**. Its central question is whether contextual scoring reduces false positives **without unacceptable recall loss** versus fair fixed-rule baselines.

Read these files **before** changing behavior, infrastructure or app boundaries:

1. [PRD.md](./PRD.md) — product outcomes, MVP requirements and acceptance criteria (**what**).
2. [ARCHITECTURE.md](./ARCHITECTURE.md) — architecture, boundaries, data flows and constraints (**how**).
3. [BRAND.md](./BRAND.md) — identity, logo assets, brand voice and allowed visual identity.
4. [DESIGN.md](./DESIGN.md) — implementation-grade frontend tokens, layouts, component states, accessibility and Figma-to-code process.
5. Applicable nested `AGENTS.md` — if present, narrower directory guidance.
6. Relevant code, tests, schemas and ADRs — the implementation's current verified behavior.

If documents conflict or a requirement is ambiguous, identify the conflict and choose the least risky reversible step; **ask for a decision before making an irreversible, security-sensitive or methodologically material change**. Never silently change the product hypothesis to match an implementation.

## Mandatory working procedure

1. **Inspect first:** Identify the requested behavior, affected files, related interfaces and tests. Check whether the repo is scaffolded; never assume a command or dependency exists.
2. **Plan proportionally:** For multi-file, cross-app, data-model, schema, security or scoring changes, state a brief plan and verification approach before writing. Keep simple fixes small.
3. **Implement narrowly:** Make the minimum coherent change. Prefer existing packages and shared contracts over duplicate implementations. Do not expand MVP scope or introduce a new service merely because a folder could be one.
4. **Verify honestly:** Run available, relevant tests/type checks/builds, plus focused regression checks for the affected boundary. If tooling is not yet configured or inaccessible, report **not run** with the reason; never say tests passed without execution evidence.
5. **Review the diff:** Look for unexpected files, leaked secrets, unrelated refactors, schema drift, unsupported claims, changed thresholds, and unintended production effects.
6. **Report clearly:** Summarize files changed, behavior affected, tests executed and results, outstanding risks, and any required follow-up. Never claim deployment, merge or production readiness without confirmation.

**Do not** force-push, rewrite history, delete unrelated files, merge branches, rotate credentials, deploy, run destructive migrations or alter protected environment resources unless the current task expressly authorizes it. Do not overwrite concurrent contributor changes.

When suitable, work on a focused branch and submit a reviewable PR; do not claim a branch or PR exists unless created. Preserve human approval for sensitive deployment or infrastructure operations.

## Repository shape — keep it stable

```text
apps/
  web/
    landing/       # Astro; static public site
    console/       # React + Vite; protected analyst SPA
  backend/
    api/           # FastAPI service
    worker/        # Background detection and evaluation service
    packages/      # Importable Python domain/features/detectors/simulation/evaluation/persistence
packages/
  ui/              # Shared React components and monochrome tokens
  api-client/      # Generated OpenAPI TypeScript client
  config/          # Shared web tooling
research/          # Synthetic scenarios, dataset manifests, experiments and reports
infra/             # Compose and deployment configuration
assets/            # FishEye SVG identity
docs/              # ADRs, contracts and supporting documents
```

One **monorepo** means one Git history. The landing, console, API and worker are **independent deployables**. Python packages are **not** network services; keep shared detection logic importable rather than creating a microservice for each package.

When scaffolding, honor the path `apps/backend/worker` exactly. **Do not recreate `detection-worker`.**

## Approved technology boundaries

- Web: TypeScript, Astro for landing, React + Vite + React Router for console; Tailwind and shared UI components.
- Web state: TanStack Query for remote state; TanStack Table for investigative tables; Recharts for evaluation visualizations where needed.
- Backend: Python, FastAPI, Pydantic, SQLAlchemy 2, Alembic.
- Detection/analytics: NumPy, Polars; scikit-learn for explicitly benchmarked candidate methods; DuckDB and immutable Parquet for experiment artifacts.
- Persistence: PostgreSQL for transactional data and durable job metadata.
- Build tooling: pnpm/Turborepo for web workspaces, uv for Python workspaces, Docker Compose for local integration, GitHub Actions for CI.
- Contracts: versioned OpenAPI schemas; generate the TypeScript client rather than hand-copying Python response interfaces.

Do not add Kafka, Redis, Temporal, Kubernetes, a vector database, an LLM provider, a second API gateway or a new standalone database without documenting the concrete unmet requirement and securing approval. Avoid dependencies whose function is already provided by an existing package.

**Commands:** Do not invent scripts. Inspect `package.json`, `pyproject.toml`, lockfiles, `Makefile` and CI first. Use the commands actually declared there. If a required test/build command is missing, add it as part of an explicitly scoped foundation task and document it.

## Product and design invariants

- **FishEye**, never Sentinel or another former working name, is the current product.
- Always use the committed brand assets under `assets/`. Implement the approved Figma design according to BRAND.md and DESIGN.md, then check responsive layouts and accessibility.
- **Inter** everywhere; **light mode only**; white surfaces with black and neutral-gray text/borders. **No purple, decorative color themes or dark-mode switch.**
- Use the canonical aligned combined SVG in assets/fisheye-logo.svg and shared tokens/components; do not duplicate unrelated landing and console component implementations where shared patterns suffice.
- The console's principal activities are **prioritize**, **investigate** and **evaluate**; scenario execution exists to support evaluation.
- Always label synthetic/demo results. Severity must be explicit text, not conveyed only by color.
- Loading, empty, failed, unauthorized, disabled and retry states are real product requirements; do not simulate successful results in production UI.

## Non-negotiable scientific and scoring invariants

1. **Synthetic-only v1:** Never introduce actual employee, customer, bank, credential or production log data. Rejection and safe validation are required for imports.
2. **Ground-truth separation:** Scenario labels and injected-attack answers are for evaluation only; never expose them as detector features.
3. **Frozen comparators:** Simple rules, tuned rules and contextual scorer must process the same held-out data, with thresholds tuned only on authorized development/calibration splits. Do not weaken baselines artificially.
4. **Reproducibility:** Persist dataset checksum/version, schema version, seed, code commit, detector and configuration versions, splits, run timestamps and produced artifact hashes. Completed experiment results are immutable.
5. **No metric manipulation:** Derive TP/FP/TN/FN and precision, recall, FPR, alert rate and delay from real run outputs. Declare the unit of analysis and denominator; represent undefined ratios explicitly.
6. **No hidden tradeoff:** False-positive improvement is not success if recall breaches the *pre-registered* tolerance. Show missed threats, per-scenario weaknesses and uncertainty.
7. **Explainability:** Every finding references real synthetic event IDs, compared feature values, baseline windows, reason codes, detector version and scoring policy.
8. **Risk isn't guilt:** Scores `0..100` and tiers indicate **investigation priority** only; never infer malicious intent or automate punishment.
9. **Guardrails:** Off-hours activity alone cannot be High; out-of-role access has at least Medium priority under the current research policy. Both require regression tests.
10. **No LLM scoring:** Generative AI is not required for v1 and must not alter scores, evidence, thresholds or evaluation outcomes.
11. **No hardcoded success:** Old slides' numerical results may appear in explicitly labelled historical research content, never as fabricated output from a newly completed run.
12. **Source-of-truth integrity:** UI displays backend-stored score and metrics, never independent browser-side calculations that drift from the engine.

Any change to scoring methods, success criteria, ground truth generation, evaluation splits or alert aggregation requires an explicit reviewed specification change and appropriate tests **before** the final held-out benchmark is rerun.

## Data and operational integrity

- PostgreSQL owns users, authorization, dataset/run metadata, reviews, findings and durable job state; large event/result artifacts belong in immutable Parquet with manifests.
- Schema changes require Alembic migrations, data/backfill and rollback considerations. No direct untracked production schema changes.
- No silent destructive migration or schema reset. Never point tests at production databases.
- Worker must claim jobs transactionally, use leases/timeouts and bounded retries, and make artifact publication idempotent. A failed run must never become `completed` by fallback.
- Do not hold DB locks while running lengthy analyses. Ensure concurrent workers cannot publish competing results for one job.
- Stable IDs, UTC timestamps, explicit display timezone, pagination and validated contracts are mandatory.
- Never save tokens/passwords/API credentials in source, datasets, screenshots, logs or UI fixtures.
- Enforce authorization server-side; apply least privilege to users, API, worker and storage access.
- Validate payloads and uploads at trust boundaries; bound file sizes, processing memory and query work.
- Record audit events for review and other protected actions. Keep raw evidence and analyst opinions separate.
- Distinguish local, staging and production settings; **no real-bank connectivity in v1**.

## Testing and review requirements

For each feature, test the boundaries it changes:

- **Detectors:** golden fixtures, benign counterexamples, cold-start/role-change behavior, thresholds and both scoring guardrails.
- **Evaluation:** confusion-matrix arithmetic, zero-denominator behavior, seed reproducibility, held-out label isolation, matching splits and detection delay.
- **Worker:** claim races, lease expiration, retries, idempotency, recovery and atomic run results.
- **API:** schema/authorization/invalid input/pagination/error contracts, persistence and migration tests.
- **Web:** primary flows, contract compatibility, keyboard interaction, responsiveness and honest loading/empty/error states.
- **Cross-app:** at least one synthetic scenario executed end-to-end through API → worker → stored findings → UI metrics before release.

Prefer small, deterministic tests and targeted integration coverage. Do not mark a task complete if its applicable acceptance criterion remains unverified. Do not fabricate screenshots, test logs, benchmarks or evidence.

## Code Review Rules

Flag these as **high-severity** in review and describe the safe correction:

- **Evaluation leakage:** Detector uses scenario truth or held-out examples for tuning. **Safe path:** separate generation metadata and freeze independent train/calibration/test inputs.
- **Misleading claims:** Hardcoded scores or research metrics shown as fresh run results. **Safe path:** bind UI only to versioned completed backend runs and label historical figures.
- **Silent recall regression:** Change suppresses alerts without rechecking recall and FPR on identical data. **Safe path:** compare both detectors with the frozen protocol and report misses.
- **Authorization bypass:** Console or API exposes events, runs, reviews or artifacts without server-side permission checks. **Safe path:** enforce access checks on every protected resource.
- **Mutable experiment:** A published result, manifest or source artifact is modified in place. **Safe path:** create a new immutable version with lineage.
- **Job duplication/data loss:** Concurrent or restarted worker publishes duplicated/incomplete results. **Safe path:** transactional claiming, leases, idempotency and atomic promotion.
- **Cross-service shortcut:** Business/scoring logic duplicated in frontend or a new network service is added without justified boundary. **Safe path:** reuse shared contracts and importable backend packages.
- **Brand regression:** Dark mode, purple, legacy name or inconsistent type appears in FishEye surfaces. **Safe path:** use shared monochrome tokens, Inter and committed SVG assets.

Do not turn stylistic preferences into high-severity review findings if a configured formatter/linter already enforces them.

## Architecture changes, decisions and completion

- `PRD.md` is authoritative for **requirements**; `ARCHITECTURE.md` for **system design**. Code and tests establish what actually exists, but not permission to silently change either document.
- Material architecture changes need a concise ADR under `docs/adr/` describing context, alternatives, tradeoffs, rollout and reversibility.
- Reject unrequested feature expansion. Keep the initial MVP deliberate and maintainable; "future bank pilot" is an architectural possibility, not authorization to handle personal banking data.
- If a request cannot be completed safely with available data/tools, implement the supported portion, explain the blocker and leave no fabricated completion state.
- Final task report: **what changed; how verified; what was not verified; decisions/risks that remain**.

## Codex guidance basis

OpenAI's AGENTS.md discovery guidance: https://developers.openai.com/codex/guides/agents-md  
OpenAI's scoped code-review rules: https://developers.openai.com/blog/custom-code-review-rules-for-codex  
OpenAI's Codex development workflow example: https://github.com/openai/openai-cookbook/blob/main/examples/codex/iterating-development-workflows-with-codex.md

These links explain the instruction-file convention; **FishEye-specific engineering rules above are our own project requirements**, not rules mandated by OpenAI.
