from datetime import UTC, datetime
from pathlib import Path

from cryptography.fernet import Fernet
from fastapi.testclient import TestClient
from fisheye_api.main import app
from fisheye_persistence.datasets import Base, DatasetRecord, create_session_factory
from fisheye_persistence.reviews import FindingReviewRecord
from fisheye_persistence.runs import EvaluationRunRecord
from sqlalchemy import create_engine, func, select
from sqlalchemy.engine import URL


def configured_workspace(tmp_path: Path, monkeypatch, *, status: str = "completed"):
    database_url = str(URL.create("sqlite+pysqlite", database=str(tmp_path / "workspace.db")))
    artifact_root = tmp_path / "artifacts"
    key = Fernet.generate_key()
    engine = create_engine(database_url)
    Base.metadata.create_all(engine)
    engine.dispose()
    now = datetime.now(UTC)
    dataset_id = "dataset-0001"
    run_id = "run-0001"
    source_uri = "datasets/aa/hash/source.csv.enc"
    dataset = DatasetRecord(
        id=dataset_id,
        sha256="a" * 64,
        schema_version="fisheye.events.v2",
        row_count=1,
        employee_day_count=1,
        artifact_uri=source_uri,
        manifest_uri="datasets/aa/hash/manifest.json.enc",
        manifest_sha256="b" * 64,
        created_at=now,
    )
    run = EvaluationRunRecord(
        id=run_id,
        dataset_id=dataset_id,
        idempotency_key="request-0001",
        request_sha256="c" * 64,
        context_artifact_uri="run-inputs/dd/context.json.enc",
        context_sha256="d" * 64,
        methodology_version="test-method.v1",
        config_sha256="e" * 64,
        status=status,
        attempt_count=0,
        available_at=now,
        created_at=now,
        result_artifact_uri="runs/run-0001/ff/analysis" if status == "completed" else None,
        result_manifest_sha256="f" * 64 if status == "completed" else None,
    )
    with create_session_factory(database_url)() as session:
        session.add_all([dataset, run])
        session.add(
            FindingReviewRecord(
                run_id=run_id,
                finding_id="run-0001:contextual:employee:2026-01-01",
                decision="under_review",
                reviewer_label="Analyst",
                created_at=now,
            )
        )
        session.commit()

    (artifact_root / "datasets/aa/hash").mkdir(parents=True)
    (artifact_root / source_uri).write_bytes(b"encrypted")
    (artifact_root / "datasets/aa/hash/manifest.json.enc").write_bytes(b"manifest")
    (artifact_root / "run-inputs/dd").mkdir(parents=True)
    (artifact_root / "run-inputs/dd/context.json.enc").write_bytes(b"context")
    result_dir = artifact_root / "runs/run-0001/ff/analysis"
    result_dir.mkdir(parents=True)
    (result_dir / "scores.parquet.enc").write_bytes(b"scores")

    monkeypatch.setenv("FISHEYE_ENV", "development")
    monkeypatch.setenv("FISHEYE_ENABLE_DEV_EVALUATION_RUNS", "1")
    monkeypatch.setenv("FISHEYE_ENABLE_LOCAL_DATA_RESET", "1")
    monkeypatch.setenv("DATABASE_URL", database_url)
    monkeypatch.setenv("FISHEYE_ARTIFACT_DIR", str(artifact_root))
    monkeypatch.setenv("FISHEYE_ARTIFACT_ENCRYPTION_KEY", key.decode())
    return database_url, artifact_root, TestClient(app)


def test_local_reset_reports_counts_and_removes_referenced_data(tmp_path, monkeypatch) -> None:
    database_url, artifact_root, client = configured_workspace(tmp_path, monkeypatch)

    status = client.get("/api/v1/local-workspace")
    assert status.status_code == 200
    assert status.json() == {
        "enabled": True,
        "run_count": 1,
        "dataset_count": 1,
        "review_count": 1,
        "active_run_count": 0,
    }

    response = client.request(
        "DELETE",
        "/api/v1/local-workspace/data",
        json={"confirmation": "CLEAR ALL DATA"},
    )
    assert response.status_code == 200
    assert response.json() == {
        "deleted_run_count": 1,
        "deleted_dataset_count": 1,
        "deleted_review_count": 1,
        "artifacts_removed": True,
    }
    assert not (artifact_root / "datasets/aa/hash").exists()
    assert not (artifact_root / "runs/run-0001").exists()
    assert not (artifact_root / "run-inputs/dd/context.json.enc").exists()
    with create_session_factory(database_url)() as session:
        assert session.scalar(select(func.count()).select_from(EvaluationRunRecord)) == 0
        assert session.scalar(select(func.count()).select_from(DatasetRecord)) == 0
        assert session.scalar(select(func.count()).select_from(FindingReviewRecord)) == 0


def test_local_reset_refuses_active_evaluations(tmp_path, monkeypatch) -> None:
    _, artifact_root, client = configured_workspace(tmp_path, monkeypatch, status="queued")

    response = client.request(
        "DELETE",
        "/api/v1/local-workspace/data",
        json={"confirmation": "CLEAR ALL DATA"},
    )
    assert response.status_code == 409
    assert (artifact_root / "datasets/aa/hash/source.csv.enc").is_file()
    assert client.get("/api/v1/local-workspace").json()["run_count"] == 1


def test_local_reset_is_disabled_without_explicit_opt_in(tmp_path, monkeypatch) -> None:
    _, artifact_root, client = configured_workspace(tmp_path, monkeypatch)
    monkeypatch.setenv("FISHEYE_ENABLE_LOCAL_DATA_RESET", "0")

    assert client.get("/api/v1/local-workspace").json() == {
        "enabled": False,
        "run_count": 0,
        "dataset_count": 0,
        "review_count": 0,
        "active_run_count": 0,
    }
    response = client.request(
        "DELETE",
        "/api/v1/local-workspace/data",
        json={"confirmation": "CLEAR ALL DATA"},
    )
    assert response.status_code == 404
    assert (artifact_root / "datasets/aa/hash/source.csv.enc").is_file()
