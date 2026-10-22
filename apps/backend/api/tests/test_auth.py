from datetime import UTC, datetime, timedelta

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from fastapi.testclient import TestClient
from fisheye_api import auth
from fisheye_api.main import app


@pytest.fixture
def oidc_settings(monkeypatch):
    monkeypatch.setenv("FISHEYE_ENV", "staging")
    monkeypatch.setenv("FISHEYE_OIDC_ISSUER", "https://identity.example.test/")
    monkeypatch.setenv("FISHEYE_OIDC_AUDIENCE", "fisheye-api")
    monkeypatch.setenv("FISHEYE_OIDC_JWKS_URL", "https://identity.example.test/jwks")
    monkeypatch.setenv("FISHEYE_OIDC_ROLES_CLAIM", "roles")
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    public_key = private_key.public_key()

    class SigningKey:
        key = public_key

    class JwksClient:
        def get_signing_key_from_jwt(self, token: str) -> SigningKey:
            return SigningKey()

    monkeypatch.setattr(auth, "_jwks_client", lambda _: JwksClient())

    def issue_token(**overrides: object) -> str:
        now = datetime.now(UTC)
        claims: dict[str, object] = {
            "iss": "https://identity.example.test/",
            "aud": "fisheye-api",
            "sub": "analyst-123",
            "roles": ["analyst"],
            "iat": now,
            "exp": now + timedelta(minutes=5),
        }
        claims.update(overrides)
        return jwt.encode(claims, private_key, algorithm="RS256", headers={"kid": "test-key"})

    return issue_token


def credentials(token: str) -> HTTPAuthorizationCredentials:
    return HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)


def test_analyst_access_token_is_verified(oidc_settings) -> None:
    identity = auth.require_analyst(credentials(oidc_settings()))

    assert identity.subject == "analyst-123"
    assert identity.roles == frozenset({"analyst"})


@pytest.mark.parametrize(
    "claims",
    [
        {"roles": ["viewer"]},
        {"aud": "other-api"},
        {"iss": "https://other.example.test/"},
        {"exp": datetime.now(UTC) - timedelta(minutes=1)},
    ],
)
def test_invalid_or_non_analyst_tokens_are_rejected(oidc_settings, claims) -> None:
    token = oidc_settings(**claims)
    with pytest.raises(HTTPException) as raised:
        auth.require_analyst(credentials(token))
    assert raised.value.status_code in {401, 403}


def test_missing_token_fails_closed_outside_local_development(oidc_settings) -> None:
    with pytest.raises(HTTPException) as raised:
        auth.require_analyst(None)
    assert raised.value.status_code == 401


def test_missing_oidc_configuration_returns_service_unavailable(monkeypatch) -> None:
    monkeypatch.setenv("FISHEYE_ENV", "production")
    for name in (
        "FISHEYE_OIDC_ISSUER",
        "FISHEYE_OIDC_AUDIENCE",
        "FISHEYE_OIDC_JWKS_URL",
    ):
        monkeypatch.delenv(name, raising=False)
    with pytest.raises(HTTPException) as raised:
        auth.require_analyst(credentials("token"))
    assert raised.value.status_code == 503


def test_non_https_issuer_is_rejected_before_discovery(monkeypatch) -> None:
    monkeypatch.setenv("FISHEYE_ENV", "staging")
    monkeypatch.setenv("FISHEYE_OIDC_ISSUER", "http://identity.example.test/")
    monkeypatch.setenv("FISHEYE_OIDC_AUDIENCE", "fisheye-api")
    monkeypatch.delenv("FISHEYE_OIDC_JWKS_URL", raising=False)
    discovery_called = False

    def discover(_issuer: str) -> str:
        nonlocal discovery_called
        discovery_called = True
        return "http://identity.example.test/jwks"

    monkeypatch.setattr(auth, "_discover_jwks_url", discover)
    with pytest.raises(HTTPException) as raised:
        auth.require_analyst(credentials("token"))

    assert raised.value.status_code == 503
    assert not discovery_called


def test_local_development_has_explicit_unauthenticated_identity(monkeypatch) -> None:
    monkeypatch.setenv("FISHEYE_ENV", "development")
    identity = auth.require_analyst(None)
    assert identity.subject == "Local development user (not authenticated)"


def test_api_routes_require_auth_outside_local_development(monkeypatch) -> None:
    monkeypatch.setenv("FISHEYE_ENV", "staging")
    monkeypatch.setenv("FISHEYE_OIDC_ISSUER", "https://identity.example.test/")
    monkeypatch.setenv("FISHEYE_OIDC_AUDIENCE", "fisheye-api")
    monkeypatch.setenv("FISHEYE_OIDC_JWKS_URL", "https://identity.example.test/jwks")
    client = TestClient(app)

    assert client.get("/health/live").status_code == 200
    assert client.get("/api/v1/runs").status_code == 401
    assert client.post("/api/v1/datasets/imports/validate").status_code == 401
