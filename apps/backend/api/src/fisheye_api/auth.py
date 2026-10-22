"""OIDC access-token validation for protected analyst API routes."""

import json
import os
from dataclasses import dataclass
from functools import lru_cache
from typing import Annotated, cast
from urllib.error import URLError
from urllib.request import urlopen

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient
from jwt.exceptions import PyJWKClientConnectionError

bearer_scheme = HTTPBearer(auto_error=False, scheme_name="OIDCBearer")


@dataclass(frozen=True)
class AnalystIdentity:
    subject: str
    roles: frozenset[str]


@lru_cache(maxsize=8)
def _jwks_client(url: str) -> PyJWKClient:
    return PyJWKClient(url, cache_jwk_set=True, lifespan=300, timeout=5)


@lru_cache(maxsize=8)
def _discover_jwks_url(issuer: str) -> str:
    discovery_url = f"{issuer.rstrip('/')}/.well-known/openid-configuration"
    with urlopen(discovery_url, timeout=5) as response:  # noqa: S310 - operator-configured OIDC issuer
        metadata = cast(dict[str, object], json.load(response))
    jwks_uri = metadata.get("jwks_uri")
    if metadata.get("issuer") != issuer or not isinstance(jwks_uri, str):
        raise ValueError("OIDC discovery metadata does not match configured issuer")
    return jwks_uri


def require_analyst(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> AnalystIdentity:
    """Verify signature, issuer, audience, expiry, and required analyst role."""
    if os.getenv("FISHEYE_ENV") == "development":
        if credentials is None:
            return AnalystIdentity(
                "Local development user (not authenticated)", frozenset({"analyst"})
            )

    issuer = os.getenv("FISHEYE_OIDC_ISSUER")
    audience = os.getenv("FISHEYE_OIDC_AUDIENCE")
    jwks_url = os.getenv("FISHEYE_OIDC_JWKS_URL")
    if not issuer or not audience:
        raise HTTPException(status_code=503, detail="OIDC API authentication is not configured.")
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=401,
            detail="A valid analyst access token is required.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    algorithms = [
        value.strip()
        for value in os.getenv("FISHEYE_OIDC_ALLOWED_ALGORITHMS", "RS256,ES256").split(",")
        if value.strip()
    ]
    try:
        require_https = os.getenv("FISHEYE_ENV") != "development"
        if require_https and not issuer.startswith("https://"):
            raise ValueError("OIDC issuer must use HTTPS")
        jwks_url = jwks_url or _discover_jwks_url(issuer)
        if require_https and not jwks_url.startswith("https://"):
            raise ValueError("OIDC signing keys must use HTTPS")
        signing_key = _jwks_client(jwks_url).get_signing_key_from_jwt(credentials.credentials)
        claims = jwt.decode(
            credentials.credentials,
            signing_key.key,
            algorithms=algorithms,
            audience=audience,
            issuer=issuer,
            options={"require": ["exp", "iat", "sub", "iss", "aud"]},
            leeway=30,
        )
    except (PyJWKClientConnectionError, URLError, TimeoutError, OSError, ValueError):
        raise HTTPException(
            status_code=503,
            detail="The OIDC issuer could not be reached or its metadata is invalid.",
        ) from None
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=401,
            detail="The analyst access token is invalid or expired.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from None

    subject = claims.get("sub")
    roles_claim = claims.get(os.getenv("FISHEYE_OIDC_ROLES_CLAIM", "roles"), [])
    if isinstance(roles_claim, str):
        roles = frozenset(roles_claim.split())
    elif isinstance(roles_claim, list) and all(isinstance(role, str) for role in roles_claim):
        roles = frozenset(roles_claim)
    else:
        roles = frozenset()
    if not isinstance(subject, str) or not subject:
        raise HTTPException(status_code=401, detail="The access token has no subject.")
    if not roles.intersection({"analyst", "admin"}):
        raise HTTPException(status_code=403, detail="An analyst role is required.")
    return AnalystIdentity(subject, roles)
