# Brimble backend deployment

The API and worker are separate Brimble services built from the official GitHub
repository `onerandomd3v/FishEye`. Both use the same backend image and the monorepo
root as build context:

```text
Build context: .
Dockerfile: infra/docker/backend.Dockerfile
```

Use a **Web Service** for the API with this start command:

```sh
/opt/venv/bin/uvicorn fisheye_api.main:app --host 0.0.0.0 --port ${PORT:-8000}
```

Set its health check to `GET /health/live`. Use a separate **Worker** service with:

```sh
/opt/venv/bin/fisheye-worker work --poll-seconds 2
```

The worker does not need a public HTTP endpoint. Both services need the same
`DATABASE_URL`, `FISHEYE_ARTIFACT_STORAGE=r2`, `FISHEYE_R2_ENDPOINT_URL`,
`FISHEYE_R2_BUCKET=fisheye-artifacts`, `FISHEYE_R2_PREFIX=fisheye`, and
`FISHEYE_ARTIFACT_ENCRYPTION_KEY`. Set `FISHEYE_R2_ACCESS_KEY_ID` and
`FISHEYE_R2_SECRET_ACCESS_KEY` as secrets in both services using a token limited to
the private FishEye bucket. Never expose these values to the console or browser.

Run migrations once, before routing traffic to the API, using the same image and
database:

```sh
/bin/uv run --no-sync --package fisheye-api alembic -c apps/backend/api/alembic.ini upgrade head
```

Set `FISHEYE_ENV=production` on shared services. CSV validation, CSV import,
dataset reads, and evaluation-run routes remain disabled outside local development
under the current architecture decision, even when the authenticated console login
is configured. Do not set development mode on a public service. A hosted upload/run
demo needs a reviewed architecture decision before those routes can be enabled.
Set the same `FISHEYE_SESSION_SECRET` on the console and API. Configure the console's
server-side `API_INTERNAL_URL` to the API URL, and set API `FISHEYE_CORS_ORIGINS`
to the actual console origin. Keep the existing email/password demo login; do not
add a third-party identity provider.

Local development remains on filesystem storage by default. The development-only
workspace reset remains local-storage-only and is not enabled by hosted demo mode.

Do not create or scale services until the Brimble workspace, current resource
estimate, and approved budget are confirmed. Do not point FishEye at another
project's Neon database; confirm the intended existing Neon project before running
migrations.
