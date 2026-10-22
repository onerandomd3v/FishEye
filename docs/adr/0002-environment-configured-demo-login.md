# ADR 0002: Environment-configured demo login

- **Status:** Accepted
- **Date:** 2026-10-22
- **Supersedes:** [ADR 0001](./0001-provider-neutral-oidc.md)

## Context

FishEye's first shared experience is a controlled, synthetic-data demo. A hosted identity provider adds setup and operational work without a current requirement for user invitations, account recovery, or multiple analyst identities. A console-only login would be inadequate because FastAPI also needs to verify access to protected routes.

## Decision

- Configure one demo email and password as server-side environment secrets in the Next.js console.
- The console verifies both credentials server-side and issues an eight-hour HS256 token with a fixed analyst role, issuer and API audience.
- The console asks FastAPI to check and update PostgreSQL-backed, hashed login-failure windows. Five source failures or twenty account failures in fifteen minutes produce `429` with `Retry-After`; signed, time-limited requests keep the API from accepting forged counter updates. Passwords are never sent to the API.
- The token is held only in an HttpOnly, SameSite=Lax cookie, marked Secure in production, and sent to FastAPI by the same-origin server-side API proxy.
- The console and API share a randomly generated session-signing secret of at least 32 bytes. FastAPI independently verifies the token signature, issuer, audience, expiry and analyst role. The same secret signs short-lived throttle requests so the API can apply the source limit across serverless instances.
- Keep the development-only unauthenticated API path restricted to `FISHEYE_ENV=development`.
- Keep CSV import, run creation, and other development-only routes disabled outside local development. Login does not change their availability.
- This single-account flow is only for synthetic demos. It does not provide individual analyst identity, invitation, password reset, multi-tenant isolation, or production identity management.

## Alternatives

- **OIDC provider:** deferred because the current demo needs one configured account and no federation or account lifecycle; a provider can be adopted later if those requirements arise.
- **Console-only gate:** rejected because it would not protect direct API requests.
- **Credentials in browser code or `NEXT_PUBLIC_` variables:** rejected because client-side secrets are observable.

## Tradeoffs and rollout

The approach has a small configuration footprint and keeps API authorization server-enforced. The API database must be migrated before throttled login is available. The shared signing key must be stored as a secret in both services and rotated together. A shared password does not establish individual analyst identity; use a long unique password and keep this demo on synthetic data only. Replace this flow with a managed identity system before a real pilot or multi-user deployment.
