# ADR 0003: Hosted synthetic demo evaluation

- **Status:** Accepted
- **Date:** 2026-10-23
- **Supersedes:** Hosted-route restriction in [ADR 0002](./0002-environment-configured-demo-login.md)

## Context

The shared FishEye console is a synthetic-data demo hosted separately from the
API and worker. The Brimble deployment is configured with a production runtime,
but the API had disabled CSV and evaluation endpoints in every production
environment. This left the hosted console unable to list runs or start an
evaluation. The earlier restriction prevented accidental exposure but also
blocked the explicitly synthetic hosted demo.

## Decision

- Permit CSV validation/import, dataset reads and evaluation-run routes in
  `FISHEYE_ENV=production` only when `FISHEYE_SYNTHETIC_DEMO_MODE=1` **and** the
  endpoint's individual `FISHEYE_ENABLE_DEV_*` feature flag is `1`.
- Keep the existing API analyst-token authentication on all protected routes.
  Dataset writes additionally require the explicit synthetic-data confirmation
  header and the strict events-v2 CSV validator. Do not accept real employee,
  customer, bank, credential or production-log data.
- Keep encrypted artifact storage and the configured database/encryption key as
  runtime prerequisites for persisted datasets and runs.
- Do not enable workspace reset in production. Its existing development,
  feature-flag and local-storage gates remain unchanged.
- Do not enable unauthenticated development routes in production. Staging and
  every non-development environment remain closed by default.

## Alternatives

- **Keep every hosted evaluation route disabled:** secure by default, but makes
  the configured hosted synthetic console nonfunctional.
- **Set the API to development in Brimble:** rejected because it weakens the
  environment boundary and could enable unrelated local development behavior.
- **Expose routes whenever the login is configured:** rejected because a login
  must not implicitly activate imports, reads or run creation.

## Tradeoffs and rollout

The production exception is explicit and remains opt-in at two levels: the
synthetic-demo mode and each route feature flag. Deploy the API with those flags
only for the isolated synthetic demo, keep `FISHEYE_ENV=production`, and retain
the configured authenticated console, database, worker and encrypted artifact
storage. The console and worker must use the same intended demo database and
artifact store. A real-data or multi-user pilot requires a separate reviewed
security and architecture decision. Rollback is to unset
`FISHEYE_SYNTHETIC_DEMO_MODE` or the affected feature flags and redeploy the API.
