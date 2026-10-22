import pytest
from fastapi import HTTPException
from fisheye_api.auth import require_analyst
from fisheye_api.main import _feature_enabled


def test_hosted_synthetic_demo_mode_enables_confirmed_csv_workflow(monkeypatch):
    monkeypatch.setenv("FISHEYE_ENV", "production")
    monkeypatch.setenv("FISHEYE_SYNTHETIC_DEMO_MODE", "1")
    for flag in (
        "FISHEYE_ENABLE_DEV_CSV_VALIDATION",
        "FISHEYE_ENABLE_DEV_CSV_IMPORT",
        "FISHEYE_ENABLE_DEV_DATASET_READS",
        "FISHEYE_ENABLE_DEV_EVALUATION_RUNS",
    ):
        monkeypatch.delenv(flag, raising=False)
        assert _feature_enabled(flag)


def test_hosted_import_gates_stay_disabled_without_explicit_demo_mode(monkeypatch):
    monkeypatch.setenv("FISHEYE_ENV", "production")
    monkeypatch.setenv("FISHEYE_ENABLE_DEV_CSV_IMPORT", "1")
    monkeypatch.delenv("FISHEYE_SYNTHETIC_DEMO_MODE", raising=False)
    assert not _feature_enabled("FISHEYE_ENABLE_DEV_CSV_IMPORT")


def test_demo_mode_does_not_enable_development_authentication_bypass(monkeypatch):
    monkeypatch.setenv("FISHEYE_ENV", "production")
    monkeypatch.setenv("FISHEYE_SYNTHETIC_DEMO_MODE", "1")
    monkeypatch.delenv("FISHEYE_SESSION_SECRET", raising=False)
    assert _feature_enabled("FISHEYE_ENABLE_DEV_CSV_IMPORT")
    with pytest.raises(HTTPException) as error:
        require_analyst(None)
    assert error.value.status_code == 503
