# FishEye

**See the signal. Ignore the noise.**

FishEye is a cybersecurity research MVP that helps security teams **understand, prioritize and investigate unusual access to protected systems and data**. Instead of treating every unusual employee-account action as equally risky, it examines the activity in context—such as the account's normal patterns, permitted job role, device and access volume—and explains why a finding deserves attention.

> **Hackathon scope:** FishEye v1 uses **synthetic banking-style access events only**. It is not deployed at a bank, does not access real customer records, and does not prove production accuracy. Its purpose is to demonstrate and evaluate an approach to reducing unnecessary alerts **without losing detection of meaningful threats**.

## The problem

At 11 PM, an account accesses customer records outside its usual working hours. That could be legitimate overtime—or misuse of a compromised account. A simple rule can flag the activity, but the analyst still needs to understand **what happened, whether the account was authorized, and which alerts deserve attention first**.

Banks already use security monitoring technologies, and products such as Microsoft Purview, Splunk and Exabeam provide relevant detection and investigation capabilities. FishEye is **not claiming to invent behavioural security analytics**. We are testing a narrower question: *can explainable, context-aware prioritization lower false alarms compared with fixed rules while preserving detection recall?*

## What FishEye does

1. **Ingest synthetic events:** Load a bundled demonstration scenario or a correctly formatted synthetic dataset.
2. **Analyze context:** Compare events with role permissions and relevant behavioural patterns.
3. **Prioritize findings:** Assign an investigation priority and show the supporting reasons and evidence.
4. **Support analyst review:** Let an analyst inspect and record a disposition without rewriting the original evidence or detector output.
5. **Evaluate the approach:** Compare contextual scoring with simple-rule and tuned-rule baselines using the same test data. Report false positives, missed threats and other evaluation metrics.

**A high-priority finding is a request to investigate, not proof that an employee committed wrongdoing.**

## For hackathon judges — where to start

The shortest path through the project:

| Step | Page | What to look for |
| --- | --- | --- |
| 1 | **Landing** (`/` on Astro) | Why unusual activity needs context |
| 2 | **Sign in** (`/login` on Next.js) | Research/demo analyst access with environment-configured credentials |
| 3 | **Scenario lab** (`/scenarios`) | Select one of two bundled synthetic samples, confirm synthetic-only input, and submit a development evaluation run |
| 4 | **Risk overview** (`/overview`) | Findings from stored, completed runs—rather than illustrative hardcoded scores |
| 5 | **Investigations** (`/investigations`) | Open a finding, follow event evidence and explanation, and see the review flow |
| 6 | **Evaluation** (`/evaluation`) | Compare simple rules, tuned rules and contextual scoring, including mistakes and misses |

### Suggested live demonstration

**Start with a benign unusual-access scenario, then compare it with an account showing several warning signs.** Walk through the Scenario lab → completed run → Risk overview → finding details → Evaluation. Explain why one abnormal signal alone may not justify the same priority as multiple corroborating signals.

The bundled examples and results are **synthetic**, and a completed run requires the **API and worker to execute**. The system must never present fixture values as production security findings. If a shared demo has not been configured, use the local setup below instead of assuming a public demo URL exists.

**Demo links:** No public landing or console URL is established in this README. Add verified deployed links here once they exist. Login credentials must be provided securely by the team; they are **not stored in this repository**.

## Run FishEye locally

### Prerequisites

- Node.js **22.22.0+**
- **pnpm 11.25.0**
- Python **3.12**, **uv 0.13.4+**
- Docker and Docker Compose

### Option A — Full local synthetic demo (recommended for judges)

From the repository root:

1. Install locked dependencies:

   ```bash
   pnpm install --frozen-lockfile
   uv sync --locked --all-packages --all-groups
   ```

2. Create local environment configuration:

   ```bash
   cp .env.example .env
   ```

   Set a unique `FISHEYE_DEMO_EMAIL`, a `FISHEYE_DEMO_PASSWORD` of at least 12 bytes, and `FISHEYE_SESSION_SECRET` (generate a strong random value, e.g. `openssl rand -base64 32`). For synthetic artifact encryption, generate a local Fernet key:

   ```bash
   uv run --package fisheye-persistence python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())'
   ```

   Set the printed key as `FISHEYE_ARTIFACT_ENCRYPTION_KEY` in `.env`. **Never commit local secrets.**

3. Enable the **development-only** synthetic CSV validation, import, dataset reads and evaluation-run flags in `.env`:

   ```dotenv
   FISHEYE_ENABLE_DEV_CSV_VALIDATION=1
   FISHEYE_ENABLE_DEV_CSV_IMPORT=1
   FISHEYE_ENABLE_DEV_DATASET_READS=1
   FISHEYE_ENABLE_DEV_EVALUATION_RUNS=1
   ```

4. Start the application and web profiles:

   ```bash
   docker compose -f infra/compose.yaml --profile application --profile web up --build -d
   ```

5. Open the **landing page** at [http://127.0.0.1:4321](http://127.0.0.1:4321) and the **console** at [http://127.0.0.1:3000/login](http://127.0.0.1:3000/login). Use the demo email/password from your local configuration.

6. Navigate to **Scenario lab**, choose a bundled sample and run the evaluation. Then inspect the results in **Risk overview**, **Investigations** and **Evaluation**.

Stop the local stack:

```bash
docker compose -f infra/compose.yaml --profile application --profile web down
```

**Important:** The Compose demo is for loopback/local development only. Do **not** publicly expose it or upload real employee or banking data. For complete startup options, troubleshooting and manual per-service commands, see [Development guide](docs/DEVELOPMENT.md#local-compose-stack).

### Option B — Run individual services

The repository also supports running the applications separately:

```bash
pnpm db:start
pnpm dev:landing        # Astro: http://localhost:4321
pnpm dev:console        # Next.js: http://127.0.0.1:3000
pnpm dev:api            # FastAPI: http://127.0.0.1:8000
uv run --package fisheye-worker fisheye-worker work
```

For this approach, first configure app-specific `.env.local` files, shared session secret, database migrations, artifact encryption, and local-only feature flags exactly as described in the [Development guide](docs/DEVELOPMENT.md). The commands above **are not sufficient by themselves** for a functioning demo.

## Architecture at a glance

```text
Astro landing site          Next.js analyst console
                                     |
                              authenticated requests
                                     v
                               FastAPI API
                                     |
                          PostgreSQL / durable jobs
                                     |
                               Python worker
                                     |
                      synthetic evidence and metrics
```

| Area | Technology | Location |
| --- | --- | --- |
| Public website | Astro, TypeScript | [`apps/web/landing`](apps/web/landing) |
| Analyst workspace | Next.js App Router, React, TypeScript | [`apps/web/console`](apps/web/console) |
| Backend and access control | FastAPI, Pydantic, SQLAlchemy/Alembic | [`apps/backend/api`](apps/backend/api) |
| Evaluation processing | Python worker | [`apps/backend/worker`](apps/backend/worker) |
| Shared packages | UI, API client and Python domain/evaluation/persistence libraries | [`packages`](packages), [`apps/backend/packages`](apps/backend/packages) |
| Storage and local setup | PostgreSQL, versioned synthetic artifacts, Docker Compose | [`infra`](infra) |

The API and worker own scoring and metrics; the console displays the results. This is one monorepo with independently runnable applications. For the detailed design, see [Architecture](docs/ARCHITECTURE.md).

## How we evaluate FishEye

We compare three approaches on the **same synthetic evaluation inputs**:

- **Simple rules:** A fixed-rule reference.
- **Tuned rules:** A stronger rule-based comparison.
- **Contextual scoring:** FishEye's behavioural/role-aware approach.

The Evaluation screen reports outcomes that can include precision, recall, false-positive rate, alert rate, detection delay and missed threats. **Lower alert volume by itself is not success:** the comparison must also account for genuine threats missed. Results are only claims about the documented synthetic test conditions, **not a bank deployment**.

## Project status and limitations

The repository includes a working research-oriented frontend and development API/worker evaluation flow. **Do not assume every feature is deployed or that every route is available in shared environments.**

- The research workflow uses **synthetic inputs only**.
- CSV import, dataset reads and evaluation-run endpoints are **development-only** and must not be enabled in public production environments.
- The demo login uses **one environment-configured account**, not enterprise SSO or individually attributable analyst accounts.
- There is no integration with a live bank, its SIEM or its customer data.
- Synthetic benchmarks do not validate detection accuracy in real financial institutions.

These boundaries are intentional; they allow the team to test the idea without making unsupported operational claims.

## Repository navigation

| Document | Purpose |
| --- | --- |
| [Product requirements](docs/PRD.md) | What FishEye is intended to solve and the MVP acceptance criteria |
| [Architecture](docs/ARCHITECTURE.md) | System boundaries and engineering decisions |
| [Development](docs/DEVELOPMENT.md) | Full setup, environment variables, tests, CI and troubleshooting |
| [Brand](docs/BRAND.md) | Logo, voice, typography and monochrome visual identity |
| [Design](docs/DESIGN.md) | Frontend components, layout, interaction and accessibility rules |
| [Root agent instructions](AGENTS.md) | Coding conventions and product integrity safeguards |

### Tests and CI

```bash
pnpm check:web
pnpm check:backend
pnpm check:database  # requires a disposable fisheye_test database
```

Pull requests are validated by web, backend, database and security workflows. See [Development](docs/DEVELOPMENT.md) for details. Do not run migration tests against production data.

---

**FishEye — See the signal. Ignore the noise.**
