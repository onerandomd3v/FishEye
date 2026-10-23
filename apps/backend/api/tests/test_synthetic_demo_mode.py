from fisheye_api.main import _feature_enabled, _local_data_reset_enabled


def test_hosted_synthetic_demo_mode_enables_configured_synthetic_routes(monkeypatch):
    monkeypatch.setenv("FISHEYE_ENV", "production")
    monkeypatch.setenv("FISHEYE_SYNTHETIC_DEMO_MODE", "1")
    monkeypatch.setenv("FISHEYE_ENABLE_DEV_CSV_VALIDATION", "1")
    monkeypatch.setenv("FISHEYE_ENABLE_DEV_CSV_IMPORT", "1")
    monkeypatch.setenv("FISHEYE_ENABLE_DEV_DATASET_READS", "1")
    monkeypatch.setenv("FISHEYE_ENABLE_DEV_EVALUATION_RUNS", "1")
    for flag in (
        "FISHEYE_ENABLE_DEV_CSV_VALIDATION",
        "FISHEYE_ENABLE_DEV_CSV_IMPORT",
        "FISHEYE_ENABLE_DEV_DATASET_READS",
        "FISHEYE_ENABLE_DEV_EVALUATION_RUNS",
    ):
        assert _feature_enabled(flag)


def test_production_without_synthetic_demo_mode_keeps_routes_disabled(monkeypatch):
    monkeypatch.setenv("FISHEYE_ENV", "production")
    monkeypatch.setenv("FISHEYE_SYNTHETIC_DEMO_MODE", "0")
    monkeypatch.setenv("FISHEYE_ENABLE_DEV_EVALUATION_RUNS", "1")
    assert not _feature_enabled("FISHEYE_ENABLE_DEV_EVALUATION_RUNS")


def test_synthetic_demo_mode_does_not_enable_unconfigured_routes(monkeypatch):
    monkeypatch.setenv("FISHEYE_ENV", "production")
    monkeypatch.setenv("FISHEYE_SYNTHETIC_DEMO_MODE", "1")
    monkeypatch.delenv("FISHEYE_ENABLE_DEV_EVALUATION_RUNS", raising=False)
    assert not _feature_enabled("FISHEYE_ENABLE_DEV_EVALUATION_RUNS")


def test_non_production_non_development_environment_keeps_routes_disabled(monkeypatch):
    monkeypatch.setenv("FISHEYE_ENV", "staging")
    monkeypatch.setenv("FISHEYE_SYNTHETIC_DEMO_MODE", "1")
    monkeypatch.setenv("FISHEYE_ENABLE_DEV_EVALUATION_RUNS", "1")
    assert not _feature_enabled("FISHEYE_ENABLE_DEV_EVALUATION_RUNS")


def test_hosted_synthetic_demo_never_enables_workspace_reset(monkeypatch):
    monkeypatch.setenv("FISHEYE_ENV", "production")
    monkeypatch.setenv("FISHEYE_SYNTHETIC_DEMO_MODE", "1")
    monkeypatch.setenv("FISHEYE_ENABLE_DEV_EVALUATION_RUNS", "1")
    monkeypatch.setenv("FISHEYE_ENABLE_LOCAL_DATA_RESET", "1")
    monkeypatch.setenv("FISHEYE_ARTIFACT_STORAGE", "local")
    assert not _local_data_reset_enabled()


def test_local_development_can_enable_development_routes(monkeypatch):
    monkeypatch.setenv("FISHEYE_ENV", "development")
    monkeypatch.setenv("FISHEYE_ENABLE_DEV_CSV_IMPORT", "1")
    assert _feature_enabled("FISHEYE_ENABLE_DEV_CSV_IMPORT")
