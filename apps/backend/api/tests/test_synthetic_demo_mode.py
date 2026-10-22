from fisheye_api.main import _feature_enabled


def test_hosted_synthetic_demo_mode_does_not_enable_development_routes(monkeypatch):
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
        assert not _feature_enabled(flag)


def test_local_development_can_enable_development_routes(monkeypatch):
    monkeypatch.setenv("FISHEYE_ENV", "development")
    monkeypatch.setenv("FISHEYE_ENABLE_DEV_CSV_IMPORT", "1")
    assert _feature_enabled("FISHEYE_ENABLE_DEV_CSV_IMPORT")
