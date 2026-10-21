# FishEye

FishEye is a context-aware insider-risk triage product. **MVP v1 uses synthetic data only** and evaluates whether contextual analysis reduces unnecessary alerts without unacceptable detection-recall loss.

## Repository

- `apps/web/landing` — public Astro website
- `apps/web/console` — Next.js analyst console
- `apps/backend/api` — FastAPI service
- `apps/backend/worker` — Python worker (entrypoint scaffold only)
- `assets/` — official logo SVGs
- `infra/compose.yaml` — local PostgreSQL

## Quick start

Requires Node 22, pnpm 10, Python 3.12+, uv, and Docker if running PostgreSQL.

```sh
pnpm install
pnpm dev:landing   # http://localhost:4321
pnpm dev:console   # http://localhost:3000
uv sync
uv run --package fisheye-api uvicorn fisheye_api.main:app --host 127.0.0.1 --port 8000
# in another terminal, if needed:
docker compose -f infra/compose.yaml up -d
```

**Foundation only:** UI shells and API health exist; account security, detector, experiments, database schemas, jobs and data workflows are not implemented. Do not represent it as a functional insider-risk engine.

Read [PRD.md](./PRD.md), [ARCHITECTURE.md](./ARCHITECTURE.md), [BRAND.md](./BRAND.md), [DESIGN.md](./DESIGN.md) and [AGENTS.md](./AGENTS.md) before implementation.
