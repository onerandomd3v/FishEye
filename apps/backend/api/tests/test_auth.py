from datetime import UTC, datetime, timedelta

import jwt
import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from fastapi.testclient import TestClient
from fisheye_api import auth
from fisheye_api.main import app

SESSION_SECRET = "test-only-session-secret-with-at-least-32-bytes"


@pytest.fixture
def demo_settings(monkeypatch):
    monkeypatch.setenv("FISHEYE_ENV", "staging")
    monkeypatch.setenv("FISHEYE_SESSION_SECRET", SESSION_SECRET)

    def issue_token(**overrides: object) -> str:
        now = datetime.now(UTC)
        claims: dict[str, object] = {
            "iss": auth.DEMO_TOKEN_ISSUER,
            "aud": auth.DEMO_TOKEN_AUDIENCE,
            "sub": "analyst@example.test",
            "roles": ["analyst"],
            "iat": now,
            "exp": now + timedelta(minutes=5),
        }
        claims.update(overrides)
        return jwt.encode(claims, SESSION_SECRET, algorithm="HS256")

    return issue_token


def credentials(token: str) -> HTTPAuthorizationCredentials:
    return HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)


def test_demo_analyst_token_is_verified(demo_settings) -> None:
    identity = auth.require_analyst(credentials(demo_settings()))

    assert identity.subject == "analyst@example.test"
    assert identity.roles == frozenset({"analyst"})


@pytest.mark.parametrize(
    "claims",
    [
        {"roles": ["viewer"]},
        {"aud": "other-api"},
        {"iss": "other-console"},
        {"exp": datetime.now(UTC) - timedelta(minutes=1)},
    ],
)
def test_invalid_or_non_analyst_tokens_are_rejected(demo_settings, claims) -> None:
    with pytest.raises(HTTPException) as raised:
        auth.require_analyst(credentials(demo_settings(**claims)))
    assert raised.value.status_code in {401, 403}


def test_missing_token_fails_closed_outside_local_development(demo_settings) -> None:
    with pytest.raises(HTTPException) as raised:
        auth.require_analyst(None)
    assert raised.value.status_code == 401


def test_missing_session_configuration_returns_service_unavailable(monkeypatch) -> None:
    monkeypatch.setenv("FISHEYE_ENV", "production")
    monkeypatch.delenv("FISHEYE_SESSION_SECRET", raising=False)
    with pytest.raises(HTTPException) as raised:
        auth.require_analyst(credentials("invalid"))
    assert raised.value.status_code == 503


def test_short_session_secret_returns_service_unavailable(monkeypatch) -> None:
    monkeypatch.setenv("FISHEYE_ENV", "production")
    monkeypatch.setenv("FISHEYE_SESSION_SECRET", "short")
    with pytest.raises(HTTPException) as raised:
        auth.require_analyst(credentials("invalid"))
    assert raised.value.status_code == 503


def test_local_development_has_explicit_unauthenticated_identity(monkeypatch) -> None:
    monkeypatch.setenv("FISHEYE_ENV", "development")
    identity = auth.require_analyst(None)
    assert identity.subject == "Local development user (not authenticated)"


def test_api_routes_require_valid_demo_token_outside_local_development(
    monkeypatch, demo_settings
) -> None:
    client = TestClient(app)

    assert client.get("/health/live").status_code == 200
    assert client.get("/api/v1/runs").status_code == 401
    assert client.post("/api/v1/datasets/imports/validate").status_code == 401
    response = client.get(
        "/api/v1/runs",
        headers={"Authorization": f"Bearer {demo_settings()}"},
    )
    assert response.status_code != 401
