# FishEye

FishEye is a context-aware insider-risk triage research MVP. Version 1 uses synthetic data only. The repository contains the Astro landing site, Next.js console, FastAPI API, Python evaluation worker and local PostgreSQL configuration.

## Quick start

Install Node.js 22.22.0 or newer, pnpm 11.25.0, Python 3.12, uv, and Docker Compose. For the containerized API and worker stack, follow [Local Compose stack](docs/DEVELOPMENT.md#local-compose-stack). To run the web apps directly, install dependencies and run:

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

FishEye is a synthetic-data research MVP, not a bank deployment. The local API and worker can process development evaluation runs; CSV and run routes remain disabled outside local development. Shared console authentication requires a configured OIDC provider. See [PRD](docs/PRD.md), [Architecture](docs/ARCHITECTURE.md), and [Development](docs/DEVELOPMENT.md) for current capabilities and boundaries.
