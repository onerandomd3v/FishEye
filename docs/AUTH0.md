# Auth0 setup for the first shared demo

FishEye uses its existing provider-neutral OIDC authorization-code flow with PKCE. Auth0 is the first configured identity provider; the console still owns the encrypted session cookie and server-side API proxy, while FastAPI verifies Auth0 access tokens. This avoids a second authentication/session stack.

## Configure the Auth0 tenant

1. Create a **Regular Web Application** for the FishEye console.
2. Add the console callback URL to **Allowed Callback URLs**:
   - Local: `http://127.0.0.1:3000/api/auth/callback`
   - Shared: `https://<console-host>/api/auth/callback`
3. Add the console origin to **Allowed Web Origins** if the tenant requires it.
4. Create an Auth0 **API** and use its identifier as the FishEye audience. Use RS256 signing.
5. Create and assign Auth0 roles named `analyst` and, when required, `admin`.

The backend expects a role claim in the signed access token. Auth0 roles are not automatically present in that token. Add a Post-Login Action that copies assigned roles into a namespaced custom access-token claim, then deploy the Action:

```js
const namespace = 'https://YOUR-OWNED-DOMAIN/roles';

exports.onExecutePostLogin = async (event, api) => {
  const roles = event.authorization?.roles ?? [];
  api.accessToken.setCustomClaim(namespace, roles);
};
```

Replace the namespace with a URL under a domain you control. Assign only the `analyst` or `admin` roles for the FishEye API. Set the backend `FISHEYE_OIDC_ROLES_CLAIM` to that exact namespace. The API rejects tokens without one of those role values.

## Configure FishEye

Set these values in the console and API deployment environments; keep client secrets and session keys in the hosting provider's secret store:

| Setting | Console | API |
| --- | --- | --- |
| `FISHEYE_OIDC_ISSUER` | Auth0 tenant/custom-domain issuer, including trailing slash | Same exact issuer |
| `FISHEYE_OIDC_CLIENT_ID` | Regular Web Application client ID | — |
| `FISHEYE_OIDC_CLIENT_SECRET` | Regular Web Application secret | — |
| `FISHEYE_OIDC_AUDIENCE` | Auth0 API identifier requested at login | Same API identifier |
| `FISHEYE_OIDC_ROLES_CLAIM` | — | Exact custom claim namespace from the Action |
| `FISHEYE_OIDC_REDIRECT_URI` | `https://<console-host>/api/auth/callback` | — |
| `FISHEYE_CONSOLE_URL` | Console origin, such as `https://<console-host>` | — |
| `FISHEYE_SESSION_SECRET` | Fresh random secret of at least 32 characters | — |

For local use, the issuer is typically `https://<tenant>.<region>.auth0.com/`; copy the value from Auth0 and use it unchanged. If using an Auth0 custom domain, use that same issuer consistently in both services. The authorization route sends `FISHEYE_OIDC_AUDIENCE` as the OIDC `audience` parameter so Auth0 issues a token for the API FishEye validates. The optional `FISHEYE_OIDC_RESOURCE` parameter remains available for providers that support RFC 8707 resource indicators.

Configure production callback URLs with HTTPS. Do not commit tenant credentials or secrets. The local Compose demo login is only for an isolated local demo and is not an Auth0 identity or shared-deployment fallback.

## Verify before shared use

- Start login and confirm Auth0 returns to the configured callback.
- Confirm the access token issuer and audience exactly match the API environment.
- Confirm the namespaced roles claim contains `analyst` or `admin`.
- Verify an unassigned user receives an API authorization error.
- Verify the production callback and console origin use HTTPS and the session secret is unique.
- Run a synthetic-data flow only after its API routes are intentionally enabled in the target environment; those routes are currently development-only.
