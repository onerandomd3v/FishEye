"""Verify FishEye's environment-configured synthetic demo sessions."""

import os
from dataclasses import dataclass
from typing import Annotated

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

DEMO_TOKEN_ISSUER = "fisheye-console"
DEMO_TOKEN_AUDIENCE = "fisheye-api"
bearer_scheme = HTTPBearer(auto_error=False, scheme_name="FishEyeDemoBearer")


@dataclass(frozen=True)
class AnalystIdentity:
    subject: str
    roles: frozenset[str]


def require_analyst(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> AnalystIdentity:
    """Verify a short-lived console-signed token and the analyst role."""
    if credentials is None and os.getenv("FISHEYE_ENV") == "development":
        return AnalystIdentity("Local development user (not authenticated)", frozenset({"analyst"}))
    secret = os.getenv("FISHEYE_SESSION_SECRET", "").strip()
    if len(secret.encode("utf8")) < 32:
        raise HTTPException(
            status_code=503,
            detail="Demo session verification is not configured.",
        )
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=401,
            detail="A valid analyst access token is required.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        claims = jwt.decode(
            credentials.credentials,
            secret,
            algorithms=["HS256"],
            audience=DEMO_TOKEN_AUDIENCE,
            issuer=DEMO_TOKEN_ISSUER,
            options={"require": ["exp", "iat", "sub", "iss", "aud"]},
            leeway=30,
        )
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=401,
            detail="The analyst access token is invalid or expired.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from None

    subject = claims.get("sub")
    role_claim = claims.get("roles")
    roles = (
        frozenset(role_claim.split())
        if isinstance(role_claim, str)
        else frozenset(role_claim)
        if isinstance(role_claim, list) and all(isinstance(role, str) for role in role_claim)
        else frozenset()
    )
    if not isinstance(subject, str) or not subject:
        raise HTTPException(status_code=401, detail="The access token has no subject.")
    if not roles.intersection({"analyst", "admin"}):
        raise HTTPException(status_code=403, detail="An analyst role is required.")
    return AnalystIdentity(subject, roles)
