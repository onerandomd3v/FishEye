import csv
import hashlib
import io
import json

import pytest
from fastapi.testclient import TestClient
from fisheye_api.csv_validation import CSV_HEADERS
from fisheye_api.main import app
from fisheye_persistence.datasets import Base, DatasetRecord
from sqlalchemy import create_engine, func, select
from sqlalchemy.engine import URL
from sqlalchemy.orm import Session


def make_valid_csv() -> bytes:
    rows = [
        (
            "evt-base-1",
            "emp-demo-1",
            "role-analyst",
            "dept-ops",
            "2026-01-01T09:00:00Z",
            "sign_in",
            "synthetic-core",
            "",
            "",
            "",
            "baseline",
            "",
        ),
        (
            "evt-eval-1",
            "emp-demo-1",
            "role-analyst",
            "dept-ops",
            "2026-01-02T09:00:00Z",
            "record_read",
            "synthetic-core",
            "device-demo-1",
            "synthetic-office",
            "12",
            "evaluation",
            "benign_scenario",
        ),
    ]
    buffer = io.StringIO(newline="")
    writer = csv.writer(buffer, lineterminator="\n")
    writer.writerow(CSV_HEADERS)
    writer.writerows(rows)
    return buffer.getvalue().encode("utf-8")


@pytest.fixture
def configured_import(tmp_path, monkeypatch):
    database_path = tmp_path / "fisheye.db"
    database_url = str(URL.create("sqlite+pysqlite", database=str(database_path)))
    engine = create_engine(database_url)
    Base.metadata.create_all(engine)
    engine.dispose()

    artifact_root = tmp_path / "artifacts"
    monkeypatch.setenv("FISHEYE_ENV", "development")
    monkeypatch.setenv("FISHEYE_ENABLE_DEV_CSV_IMPORT", "1")
    monkeypatch.setenv("DATABASE_URL", database_url)
    monkeypatch.setenv("FISHEYE_ARTIFACT_DIR", str(artifact_root))
    return database_url, artifact_root


def post_import(content: bytes, **headers):
    request_headers = {
        "Content-Type": "text/csv",
        "X-FishEye-Synthetic-Data-Confirmed": "true",
        **headers,
    }
    return TestClient(app).post(
        "/api/v1/datasets/imports", content=content, headers=request_headers
    )


def test_import_persists_content_addressed_artifacts_and_metadata(configured_import) -> None:
    database_url, artifact_root = configured_import
    content = make_valid_csv()

    response = post_import(content)

    assert response.status_code == 201
    result = response.json()
    assert result["status"] == "imported"
    assert result["created"] is True
    assert result["sha256"] == hashlib.sha256(content).hexdigest()
    assert result["row_count"] == 2
    assert result["employee_day_count"] == 2
    assert result["synthetic_only"] is True
    assert result["run_created"] is False
    assert result["risk_calculated"] is False

    source_path = (
        artifact_root / "datasets" / result["sha256"][:2] / result["sha256"] / "source.csv"
    )
    manifest_path = source_path.parent / "manifest.json"
    assert source_path.read_bytes() == content
    assert hashlib.sha256(manifest_path.read_bytes()).hexdigest() == result["manifest_sha256"]
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    assert manifest["dataset_id"] == result["dataset_id"]
    assert manifest["evaluation_status"] == "not_run"
    assert manifest["seed"] is None
    assert "evaluation_only" in manifest["ground_truth_usage"]

    with Session(create_engine(database_url)) as session:
        record = session.get(DatasetRecord, result["dataset_id"])
        assert record is not None
        assert record.sha256 == result["sha256"]
        assert record.manifest_sha256 == result["manifest_sha256"]


def test_identical_upload_is_idempotent(configured_import) -> None:
    database_url, _ = configured_import
    content = make_valid_csv()

    first = post_import(content)
    second = post_import(content)

    assert first.status_code == 201
    assert second.status_code == 200
    assert first.json()["dataset_id"] == second.json()["dataset_id"]
    assert first.json()["created"] is True
    assert second.json()["created"] is False
    with Session(create_engine(database_url)) as session:
        assert session.scalar(select(func.count()).select_from(DatasetRecord)) == 1


def test_invalid_csv_is_not_persisted(configured_import) -> None:
    database_url, artifact_root = configured_import

    response = post_import(b"wrong,header\nvalue,value\n")

    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "invalid_synthetic_csv"
    dataset_dir = artifact_root / "datasets"
    if dataset_dir.exists():
        assert list(dataset_dir.iterdir()) == []
    with Session(create_engine(database_url)) as session:
        assert session.scalar(select(func.count()).select_from(DatasetRecord)) == 0


def test_import_requires_confirmation_and_is_disabled_outside_development(
    configured_import, monkeypatch
) -> None:
    no_confirmation = post_import(
        make_valid_csv(),
        **{"X-FishEye-Synthetic-Data-Confirmed": "false"},
    )
    assert no_confirmation.status_code == 400

    monkeypatch.setenv("FISHEYE_ENV", "production")
    disabled = post_import(make_valid_csv())
    assert disabled.status_code == 503
