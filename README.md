# FishEye

**See the signal. Ignore the noise.**

**FishEye is a cybersecurity platform that helps banks detect suspicious employee activity while reducing false security alerts.**

FishEye learns how employees normally work based on their behaviour and job roles. When something unusual happens, it examines the context to determine whether the activity deserves investigation.

It helps security teams distinguish genuine threats from harmless unusual behaviour, so they can focus on the alerts that actually matter.

**For our first version**, we'll use synthetic banking activity data to build and test the system, measuring whether it reduces false alarms without missing more genuine threats.

> **Research demo:** FishEye does not use real bank or customer data and has not been deployed at a bank. Its results are based on simulated activity, not proven performance in a real banking environment.

## The problem

Banks protect sensitive systems, customer information and other important assets. When an employee account performs unusual activity involving those assets, security systems may generate an alert.

But unusual activity isn't always a threat. It could be legitimate work, a mistake or unauthorized access. Security teams must investigate to establish the facts, and that takes time.

**The challenge is knowing which alerts deserve attention first without overlooking genuine threats.**

Existing tools such as Microsoft Purview, Splunk and Exabeam already help security teams detect and investigate suspicious activity. **FishEye focuses on making alerts easier to understand and prioritize—and testing whether that reduces false alarms without missing more real threats.**

## What FishEye does

1. **Load sample activity:** Use a built-in example or upload simulated bank activity data.
2. **Check the context:** Look at what is normal for the account and what its job role allows.
3. **Prioritize alerts:** Show which activities need attention and explain why.
4. **Help analysts investigate:** Let the security team review the evidence and record their findings.
5. **Test the results:** Compare FishEye with rule-based detection to see how many harmless activities are flagged and how many genuine threats are missed.

**An alert is a reason to investigate, not proof that an employee has done something wrong.**

## For hackathon judges — where to start

Follow these pages in order to explore the demo:

| Step | Page | What to look for |
| --- | --- | --- |
| 1 | **Landing** (`/` on Astro) | Why unusual activity needs context |
| 2 | **Sign in** (`/login` on Next.js) | Research/demo analyst access with environment-configured credentials |
| 3 | **Scenario lab** (`/scenarios`) | Select one of two bundled synthetic samples, confirm synthetic-only input, and submit a development evaluation run |
| 4 | **Risk overview** (`/overview`) | Findings from stored, completed runs—rather than illustrative hardcoded scores |
| 5 | **Investigations** (`/investigations`) | Open a finding, follow event evidence and explanation, and see the review flow |
| 6 | **Evaluation** (`/evaluation`) | Compare simple rules, tuned rules and contextual scoring, including mistakes and misses |

### Suggested live demonstration

**Compare a harmless but unusual activity with one showing multiple warning signs.** Visit Scenario lab → Risk overview → Investigations → Evaluation to show how FishEye prioritizes the findings and explains the evidence.

All examples use **simulated activity**, not real bank records. To see results, the backend API and worker must be running. If there is no hosted demo, follow the local setup below.

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

We test three ways of detecting suspicious activity using the **same simulated bank data**:

- **Simple rules:** Flag activity based on fixed conditions.
- **Improved rules:** Use adjusted conditions to make the comparison fairer.
- **FishEye's contextual approach:** Consider employee behaviour and job roles before deciding which activities need attention.

The Evaluation screen reports **precision, recall, false-positive rate, alerts per 100 employee-days and missed threats**. Detection delay is **not available** in the current version. **Success means fewer unnecessary alerts without missing more genuine threats.** These results come from synthetic data; they do not prove how FishEye would perform inside a real bank.

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
