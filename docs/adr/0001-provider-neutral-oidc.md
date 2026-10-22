# ADR 0001: Provider-neutral OIDC authentication

- **Status:** Superseded by [ADR 0002](./0002-environment-configured-demo-login.md)
- **Date:** 2026-10-22

## Context

The console's local demo session did not authenticate FastAPI requests. Shared console/API access needs a standard identity flow and server-side authorization without choosing a vendor before hosting is selected. FishEye v1 remains synthetic-data-only, and the current CSV and evaluation APIs remain disabled outside local development.

## Decision (superseded)

- Use OIDC authorization-code flow with PKCE, state and nonce in the Next.js console.
- Keep the provider access token in an authenticated, encrypted, HttpOnly session cookie. Proxy console API requests server-side; never expose the token or API origin to browser JavaScript.
- FastAPI verifies access-token signature against issuer-discovered JWKS, plus issuer, API audience, expiry and subject. A configurable claim (default `roles`) must include `analyst` or `admin`.
- Keep the password-based demo login available only in the local Next.js development server. It does not represent a real identity or authorize non-development API requests.
- Continue to gate synthetic CSV import and evaluation endpoints to local development until shared-environment synthetic-data controls are separately specified.

## Alternatives

- **Choose a hosted provider now:** rejected because hosting and provider procurement have not been selected; it would couple the code to a vendor without improving the protocol boundary.
- **Keep a local demo session in shared environments:** rejected because it provides neither verified identity nor backend authorization.
- **Pass tokens to browser JavaScript and call FastAPI directly:** rejected because it increases exposure of bearer credentials and requires cross-origin token handling.

## Tradeoffs and rollout

The selected provider must support OIDC discovery, authorization-code flow with PKCE, signed JWT access tokens with a FishEye API audience, JWKS rotation, and an analyst/admin role claim. Configure issuer, client credentials, redirect URI, API audience, and role claim before shared deployment. API import/run routes remain unavailable outside local development, so this ADR does not claim shared evaluation readiness.

The implementation is reversible at the protocol configuration boundary; the concrete provider can change without changing the API authorization contract. Do not deploy the OIDC flow until the provider, role mapping, HTTPS origins and secret management are configured and verified.
