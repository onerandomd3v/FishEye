# Development

This document covers local setup, checks, pull requests, CI, and GitHub repository policy. FishEye v1 is synthetic-data-only. Do not add real employee, customer, banking, or production log data.

## Requirements

- Node.js 22.22.0 or newer
- pnpm 11.25.0 (the version recorded in the root `package.json`)
- Python 3.12
- uv 0.13.4 or newer
- Docker with Docker Compose

## Install and run

From the repository root:

```sh
pnpm install --frozen-lockfile
uv sync --locked --all-packages --all-groups
pnpm db:start
```

Start each application in a separate terminal:

```sh
pnpm dev:landing  # Astro at http://localhost:4321
pnpm dev:console  # Next.js at http://127.0.0.1:3000
pnpm dev:api      # FastAPI at http://127.0.0.1:8000
uv run --package fisheye-worker fisheye-worker work  # Polls for durable development runs
```

For the local landing page and console, copy each app's `.env.example` to `.env.local`. The landing app's `PUBLIC_CONSOLE_URL` points its buttons to the separate console origin (`http://127.0.0.1:3000/login`). Set `FISHEYE_DEMO_EMAIL`, `FISHEYE_DEMO_PASSWORD` (at least 12 bytes), and a random `FISHEYE_SESSION_SECRET` of at least 32 bytes in the console environment. Use the same session secret for the API. Set `API_INTERNAL_URL` in the console `.env.local`; the console proxies API requests from its server, so browser code never receives the signing secret, API token, or API's private address.

The same email/password login works in local and shared synthetic-demo deployments. The console checks credentials and issues a short-lived signed analyst token in an HttpOnly cookie; FastAPI verifies the token on protected calls. FastAPI applies shared PostgreSQL-backed rate limits to signed throttle requests; passwords are never sent to the API. Keep all values server-only and keep `.env.local` files untracked. This is one shared demo account, not a multi-user identity system.

On Vercel, the login throttle uses Vercel's `x-vercel-forwarded-for` client IP header. Other hosted deployments must set `FISHEYE_TRUSTED_CLIENT_IP_HEADER` to a single-IP header that their trusted ingress overwrites; sign-in returns 503 if no trusted client IP source is configured. The endpoint never trusts a caller-supplied `x-forwarded-for` value.

Copy `.env.example` to `.env` for local API configuration. Set the same `FISHEYE_SESSION_SECRET` used by the console in the API environment. Enable `FISHEYE_ENABLE_DEV_CSV_VALIDATION`, `FISHEYE_ENABLE_DEV_CSV_IMPORT`, `FISHEYE_ENABLE_DEV_DATASET_READS`, and `FISHEYE_ENABLE_DEV_EVALUATION_RUNS` only for local development. Set an artifact encryption key, run `pnpm db:migrate`, and use the same database, artifact directory, and key for the API and worker. Set `API_INTERNAL_URL=http://127.0.0.1:8000` in the console `.env.local`. Run the worker command above in a separate terminal. These data endpoints remain development-only and must be disabled outside local development. In a shared synthetic demo, configure the same session secret in the console and API. The API checks the signed token and analyst role; missing configuration returns 503, invalid tokens return 401/403, and throttled logins return 429 with `Retry-After`. See [ADR 0002](adr/0002-environment-configured-demo-login.md).

Completed development runs populate the overview and investigation pages from stored API results. Console review actions carry the signed demo email to FastAPI; direct unauthenticated requests in local development retain the explicit label `Local development user (not authenticated)`. The demo login is shared and does not establish individual analyst identity. Do not expose the development API or review writes to shared or production environments.

The Scenario lab offers two bundled synthetic CSV/context pairs for repeatable local demos. Selecting a sample only preloads those files; the console still requires the synthetic-data confirmation and sends them through the same API validation, import, durable-run, and worker processing path as manually selected files. Ground-truth labels are evaluation-only and are not sent to detector feature construction. Both sample pairs are checked against the current CSV and context contracts in backend tests.

## Local Compose stack

The default Compose command still starts only PostgreSQL. The `application` profile adds the API, worker and an explicit migration job. The backend image contains both Python entry points, while Compose runs them as separate containers. Dataset and result artifacts share a named volume and remain encrypted with the configured Fernet key.

Create a local `.env` file and generate a development-only artifact key:

```sh
cp .env.example .env
uv run --package fisheye-persistence python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())'
```

Put the generated value in `.env` as `FISHEYE_ARTIFACT_ENCRYPTION_KEY`. Keep this file local and do not reuse this key in another environment. Then start the API and worker with database migrations:

Before starting the application profile, generate a session secret with `openssl rand -base64 32` and set it as `FISHEYE_SESSION_SECRET` in `.env`. Compose passes this same secret to the console and API; configure the demo email and password for the console in the same file.

```sh
docker compose -f infra/compose.yaml --profile application up --build -d
```

The API is available at `http://127.0.0.1:8000/health/live`. API and worker use the same database URL, artifact volume and encryption key. The console receives the demo credentials; the API receives only the shared session secret and uses the database for throttle state. Stop the stack with:

```sh
docker compose -f infra/compose.yaml --profile application down
```

This stack sets `FISHEYE_ENV=development`; development-only CSV and run routes remain disabled unless their flags are explicitly enabled in `.env`. The web profile configures the console demo login and the API token verification secret. Do not expose this development stack to a shared network.

The backend image is a local runtime build, not a hosted deployment recipe. Shared deployment still requires a hosting provider, production secret management, managed PostgreSQL and durable object storage. Do not copy local Compose credentials or use local filesystem artifact storage in a shared environment.

The landing and console also have independent container builds: `infra/docker/landing.Dockerfile` produces a static Nginx image, and `infra/docker/console.Dockerfile` produces a standalone Next.js server image. Build either from the repository root; set the landing build argument `PUBLIC_CONSOLE_URL` for its product link:

```sh
docker build -f infra/docker/landing.Dockerfile \
  --build-arg PUBLIC_CONSOLE_URL=https://console.example.invalid/login .
docker build -f infra/docker/console.Dockerfile .
```

To run the full local demo, copy the root `.env.example` to `.env`. Generate a local artifact encryption key using the command above, set a unique `FISHEYE_DEMO_PASSWORD`, and generate a random `FISHEYE_SESSION_SECRET` (for example, with `openssl rand -base64 32`). Set `FISHEYE_ENABLE_DEV_CSV_VALIDATION`, `FISHEYE_ENABLE_DEV_CSV_IMPORT`, `FISHEYE_ENABLE_DEV_DATASET_READS` and `FISHEYE_ENABLE_DEV_EVALUATION_RUNS` to `1` in `.env`, then enable both profiles:

```sh
docker compose -f infra/compose.yaml --profile application --profile web up --build -d
```

The landing page is at `http://127.0.0.1:4321` and the console at `http://127.0.0.1:3000`. Compose runs the console in Next.js development mode for demo sign-in, enables only the development API import/run routes, and keeps all published ports bound to loopback. The same environment-configured demo credentials can be used by the standalone production console for synthetic demos. Do not expose the local Compose demo stack to a network.

## Checks

```sh
pnpm check:web
pnpm check:backend
pnpm check:database
pnpm check
```

`check:web` runs ESLint, TypeScript/Astro checks, Vitest, and production builds. Set `PUBLIC_CONSOLE_URL` for the Astro build. `check:backend` runs Ruff lint/format checks, strict mypy, API/worker tests, and worker startup checks. `check:database` requires an isolated PostgreSQL database named `fisheye_test`; it applies the Alembic migrations through the current head, verifies the schema, and rolls back to `base`.

For a disposable local database, run this in PowerShell:

```powershell
docker run --rm --detach --name fisheye-pg-test `
  --env POSTGRES_DB=fisheye_test `
  --env POSTGRES_USER=fisheye `
  --env POSTGRES_PASSWORD=fisheye_ci_only `
  --publish 127.0.0.1:55432:5432 postgres:17-alpine
$postgresReady = $false
foreach ($attempt in 1..30) {
  docker exec fisheye-pg-test pg_isready -U fisheye -d fisheye_test *> $null
  if ($LASTEXITCODE -eq 0) {
    $postgresReady = $true
    break
  }
  Start-Sleep -Seconds 1
}
if (-not $postgresReady) {
  docker logs fisheye-pg-test
  docker stop fisheye-pg-test
  throw 'PostgreSQL did not become ready within 30 seconds.'
}
$env:FISHEYE_TEST_DATABASE_URL = 'postgresql+psycopg://fisheye:fisheye_ci_only@127.0.0.1:55432/fisheye_test'
pnpm check:database
docker stop fisheye-pg-test
```

The database checks reject hostnames other than localhost/127.0.0.1 or the GitHub Actions service host `postgres`, database names other than `fisheye_test`, and connection-string parameters that override the target host or database. This keeps migration tests away from developer or production databases.

## Pull requests

Use a short-lived branch from `main` and open a pull request to `main`. Describe the change, link an issue or task when available, list the checks run, and call out material risks. Keep product, architecture, brand, and scientific boundaries in [AGENTS.md](../AGENTS.md), [Architecture](ARCHITECTURE.md), and [PRD](PRD.md).

Pull requests must pass the four required check contexts before merge. This is an owner-led project: no external or independent review is required. Keep the branch current with `main`; squash merge is the preferred strategy.

## CI and security

The required GitHub Actions contexts are `web-checks`, `backend-checks`, `database-checks`, and `security-checks`. Each workflow runs on pull requests to `main` and pushes to `main`. FishEye uses strict branch-up-to-date checks, not a merge queue. Do not use workflow-level path filters that can leave a required context unreported.

- Web CI installs with `pnpm install --frozen-lockfile`, using the pnpm lockfile for dependency caching.
- Backend and database CI use the committed `uv.lock` with `uv sync --locked` and Python 3.12.
- Security CI scans the full Git history with Gitleaks, audits production pnpm dependencies and the installed Python environment, and runs CodeQL over TypeScript/JavaScript and Python.
- Dependabot checks npm, pip/uv, and GitHub Actions weekly.
- Workflow permissions are read-only except `security-events: write` for Gitleaks SARIF reporting.

Action updates are reviewed through Dependabot pull requests. Keep actions on supported release tags unless an immutable commit SHA can be verified against the upstream release and exercised in CI; update the pinned reference and Dependabot policy together. Do not suppress a finding or disable a check to obtain a green run.

## GitHub repository policy

The intended `main` policy is: pull requests required, no direct pushes, no approval requirement, all four checks required, the branch current with `main`, force pushes and deletion blocked, squash merging preferred, and merged feature branches automatically deleted. Do not add administrator bypasses without a documented emergency policy.

Enable the ruleset only after all required checks have completed successfully on a real pull request. Verify the named checks and their GitHub Actions source. Confirm that failed checks and an out-of-date branch prevent merging before treating enforcement as verified. Choose branch-up-to-date enforcement or merge queue; do not enable both without a demonstrated need.

`CODEOWNERS` names `@onerandomd3v` as the code owner. Repository visibility, plan capabilities, collaborators, active rulesets, and environment protection are external GitHub settings and must be checked live. Do not claim a protection is active based only on this document.

## Deployment

The Astro landing app, Next.js console, FastAPI API, and Python worker are separate deployables. Hosting has not been selected. The manual release workflow reports the current release state; it does not approve or deploy anything. Do not add domains, provider credentials, deployment environments, or paid infrastructure until they are selected and authorized.
