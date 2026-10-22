# FishEye

FishEye is a context-aware insider-risk triage research MVP. Version 1 uses synthetic data only. The repository contains the Astro landing site, Next.js console shell, FastAPI API, Python worker scaffold, and local PostgreSQL configuration.

## Quick start

Install Node.js 22.22.0 or newer, pnpm 11.25.0, Python 3.12, uv, and Docker Compose. Then run:

```sh
pnpm install --frozen-lockfile
uv sync --locked --all-packages --all-groups
pnpm db:start
pnpm dev:landing
```

In separate terminals, start the console and API with `pnpm dev:console` and `pnpm dev:api`. After enabling the local development flags and configuring encrypted artifact storage, start the durable evaluation worker with `uv run --package fisheye-worker fisheye-worker work`.

For database checks, start a disposable PostgreSQL test database and set `FISHEYE_TEST_DATABASE_URL` as described in [Development](docs/DEVELOPMENT.md). Run all checks with `pnpm check`.

## Repository guide

- [Development and contribution workflow](docs/DEVELOPMENT.md)
- [Product requirements](docs/PRD.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Brand](docs/BRAND.md)
- [Design](docs/DESIGN.md)

The UI shells and API health endpoint are foundations only. Authentication, detection, evaluation, persistence models, and product workflows are not implemented.
