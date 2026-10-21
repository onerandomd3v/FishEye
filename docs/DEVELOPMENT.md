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
pnpm dev:worker   # Logs scaffold status, then exits
```

The API reads `DATABASE_URL` when database-backed behavior is added. Copy `.env.example` to `.env` for local configuration. The worker currently has no job transport or evaluation jobs.

## Checks

```sh
pnpm check:web
pnpm check:backend
pnpm check:database
pnpm check
```

`check:web` runs ESLint, TypeScript/Astro checks, Vitest, and production builds. `check:backend` runs Ruff lint/format checks, strict mypy, API/worker tests, and worker startup checks. `check:database` requires an isolated PostgreSQL database named `fisheye_test`; it applies the Alembic baseline, verifies the revision table, and rolls back to `base`. The baseline is intentionally empty because no product schema has been approved yet.

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
