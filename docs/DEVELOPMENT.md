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
pnpm dev:console  # Next.js at http://localhost:3000
pnpm dev:api      # FastAPI at http://127.0.0.1:8000
uv run --package fisheye-worker fisheye-worker work  # Polls for durable development runs
```

For the local landing page and console, copy each app's `.env.example` to `.env.local`. The landing app's `PUBLIC_CONSOLE_URL` points its buttons to the separate console origin (`http://localhost:3000/login`). For the local-only console demo, set `FISHEYE_DEMO_EMAIL` and `FISHEYE_DEMO_PASSWORD` and `FISHEYE_SESSION_SECRET` to a random secret of at least 32 characters. Restart both dev servers after changing environment files. The console proxies API requests from its server, so configure `API_INTERNAL_URL` there; browser code never receives API tokens or the API's private address.

The console's demo login and signed session are enabled only by the Next.js development server. They provide a local UI gate for synthetic fixtures; they are not an identity provider, do not authorize FastAPI requests, and must not be used in a shared or production deployment. Keep `.env.local` files untracked.

Copy `.env.example` to `.env` for local API configuration. Enable `FISHEYE_ENABLE_DEV_CSV_VALIDATION`, `FISHEYE_ENABLE_DEV_CSV_IMPORT`, `FISHEYE_ENABLE_DEV_DATASET_READS`, and `FISHEYE_ENABLE_DEV_EVALUATION_RUNS` only for local development. Set an artifact encryption key, run `pnpm db:migrate`, and use the same database, artifact directory, and key for the API and worker. Set `API_INTERNAL_URL=http://127.0.0.1:8000` in the console `.env.local`. Run the worker command above in a separate terminal. These data endpoints remain development-only and must be disabled outside local development. In shared deployments, configure the console's OIDC issuer/client credentials and session secret, plus the API's OIDC issuer and audience. The API discovers signing keys from issuer metadata (or accepts an explicitly configured JWKS URL), verifies analyst/admin roles from the configured role claim, and returns 401/403 when the token or role is invalid. The concrete provider and its role mapping must be selected before shared deployment.

Completed development runs populate the overview and investigation pages from stored API results. Finding review actions append local development records labeled `Local development user (not authenticated)`; the signed console preview does not authenticate requests to FastAPI. Do not expose the development API or review writes to shared or production environments.

The Scenario lab offers two bundled synthetic CSV/context pairs for repeatable local demos. Selecting a sample only preloads those files; the console still requires the synthetic-data confirmation and sends them through the same API validation, import, durable-run, and worker processing path as manually selected files. Ground-truth labels are evaluation-only and are not sent to detector feature construction. Both sample pairs are checked against the current CSV and context contracts in backend tests.

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
