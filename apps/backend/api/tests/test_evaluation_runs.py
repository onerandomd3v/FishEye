import json
from datetime import UTC
from pathlib import Path

import fisheye_worker.run_processing as run_processing
import pytest
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient
from fisheye_api.main import app
from fisheye_persistence.datasets import Base, create_session_factory
from fisheye_persistence.runs import EvaluationRunRecord
from fisheye_worker.run_processing import process_next_run
from sqlalchemy import create_engine, select
from sqlalchemy.engine import URL
from sqlalchemy.orm import Session

SAMPLE_ROOT = Path(__file__).parents[4] / "apps/web/console/public/demo-samples"


def make_context() -> dict[str, object]:
    context_path = SAMPLE_ROOT / "unfamiliar-access-context-v1.json"
    return json.loads(context_path.read_text(encoding="utf-8"))


@pytest.mark.parametrize(
    ("sample_name", "expected_units", "threat_event_id"),
    [
        ("approved-overtime", 4, "evt-access-eval-001"),
        ("unfamiliar-access", 2, "evt-ua-eval-threat"),
    ],
)
def test_import_queue_process_and_read_real_synthetic_run(
    tmp_path, monkeypatch, sample_name: str, expected_units: int, threat_event_id: str
) -> None:
    database_url = str(URL.create("sqlite+pysqlite", database=str(tmp_path / "runs.db")))
    artifact_root = tmp_path / "artifacts"
    encryption_key = Fernet.generate_key()
    engine = create_engine(database_url)
    Base.metadata.create_all(engine)
    engine.dispose()
    monkeypatch.setenv("FISHEYE_ENV", "development")
    monkeypatch.setenv("FISHEYE_ENABLE_DEV_CSV_IMPORT", "1")
    monkeypatch.setenv("FISHEYE_ENABLE_DEV_EVALUATION_RUNS", "1")
    monkeypatch.setenv("DATABASE_URL", database_url)
    monkeypatch.setenv("FISHEYE_ARTIFACT_DIR", str(artifact_root))
    monkeypatch.setenv("FISHEYE_ARTIFACT_ENCRYPTION_KEY", encryption_key.decode())
    client = TestClient(app)

    sample_csv = SAMPLE_ROOT / f"{sample_name}-events-v2.csv"
    sample_context = SAMPLE_ROOT / f"{sample_name}-context-v1.json"
    imported = client.post(
        "/api/v1/datasets/imports",
        content=sample_csv.read_bytes(),
        headers={
            "Content-Type": "text/csv",
            "X-FishEye-Synthetic-Data-Confirmed": "true",
        },
    )
    assert imported.status_code == 201
    dataset_id = imported.json()["dataset_id"]

    request = {
        "dataset_id": dataset_id,
        "synthetic_context": json.loads(sample_context.read_text(encoding="utf-8")),
    }
    headers = {"Idempotency-Key": "demo-run-001"}
    queued = client.post("/api/v1/runs", json=request, headers=headers)
    duplicate = client.post("/api/v1/runs", json=request, headers=headers)
    assert queued.status_code == 202
    assert queued.json()["status"] == "queued"
    assert duplicate.json()["run_id"] == queued.json()["run_id"]

    factory = create_session_factory(database_url)
    original_execute = run_processing.execute_run
    heartbeat_count = 0

    def delayed_execute(*args, **kwargs):
        import time

        time.sleep(0.05)
        return original_execute(*args, **kwargs)

    original_heartbeat = run_processing.heartbeat_run

    def count_heartbeat(*args, **kwargs):
        nonlocal heartbeat_count
        heartbeat_count += 1
        return original_heartbeat(*args, **kwargs)

    monkeypatch.setattr(run_processing, "execute_run", delayed_execute)
    monkeypatch.setattr(run_processing, "heartbeat_run", count_heartbeat)
    assert process_next_run(
        factory,
        artifact_root=artifact_root,
        encryption_key=encryption_key,
        worker_id="test-worker",
        heartbeat_interval_seconds=0.01,
    )
    assert heartbeat_count >= 1

    completed = client.get(f"/api/v1/runs/{queued.json()['run_id']}")
    assert completed.status_code == 200
    result = completed.json()
    assert result["status"] == "completed"
    assert result["claim_status"] == "provisional_experiment; not_benchmarked"
    assert result["metrics"]["evaluation_unit"] == "employee_day_utc"
    assert result["metrics"]["evaluation_unit_count"] == expected_units
    assert (
        result["metrics"]["comparisons"]["contextual"]["report"]["metrics"]["unit_count"]
        == expected_units
    )
    assert result["result_manifest_sha256"]

    findings = client.get(f"/api/v1/runs/{result['run_id']}/findings?detector=contextual")
    assert findings.status_code == 200
    finding_items = findings.json()["items"]
    assert any(threat_event_id in item["evidence_event_ids"] for item in finding_items)
    assert all("ground_truth_label" not in item for item in finding_items)
    finding = next(item for item in finding_items if threat_event_id in item["evidence_event_ids"])

    detail_url = f"/api/v1/runs/{result['run_id']}/findings/{finding['finding_id']}"
    detail = client.get(detail_url)
    assert detail.status_code == 200
    assert detail.json()["finding"] == finding
    evidence = detail.json()["events"]
    assert [event["event_id"] for event in evidence] == [threat_event_id]
    assert "ground_truth_label" not in evidence[0]

    review = client.post(
        f"{detail_url}/reviews",
        json={"decision": "escalated", "note": "Check source event context."},
    )
    assert review.status_code == 201
    assert review.json()["reviewer_label"] == "Local development user (not authenticated)"
    assert review.json()["decision"] == "escalated"

    follow_up = client.post(
        f"{detail_url}/reviews",
        json={"decision": "reviewed_benign", "note": "Synthetic fixture follow-up."},
    )
    assert follow_up.status_code == 201
    refreshed = client.get(detail_url)
    assert refreshed.status_code == 200
    review_history = refreshed.json()["reviews"]
    assert [item["decision"] for item in review_history] == ["escalated", "reviewed_benign"]
    assert refreshed.json()["finding"] == finding
    assert refreshed.json()["events"] == evidence
    assert refreshed.json()["review_mode"] == "local_development_unauthenticated"

    missing_finding = client.get(
        f"/api/v1/runs/{result['run_id']}/findings/{result['run_id']}:contextual:unknown:2026-01-05"
    )
    assert missing_finding.status_code == 404

    with Session(create_engine(database_url)) as session:
        record = session.scalar(
            select(EvaluationRunRecord).where(EvaluationRunRecord.id == result["run_id"])
        )
        assert record is not None
        assert record.status == "completed"
        assert record.started_at is not None
        assert record.completed_at is not None
        assert record.completed_at.replace(tzinfo=UTC) >= record.started_at.replace(tzinfo=UTC)


def test_run_creation_requires_v2_dataset_and_idempotency_key(tmp_path, monkeypatch) -> None:
    database_url = str(URL.create("sqlite+pysqlite", database=str(tmp_path / "runs.db")))
    artifact_root = tmp_path / "artifacts"
    encryption_key = Fernet.generate_key()
    engine = create_engine(database_url)
    Base.metadata.create_all(engine)
    engine.dispose()
    monkeypatch.setenv("FISHEYE_ENV", "development")
    monkeypatch.setenv("FISHEYE_ENABLE_DEV_EVALUATION_RUNS", "1")
    monkeypatch.setenv("FISHEYE_ARTIFACT_DIR", str(artifact_root))
    monkeypatch.setenv("FISHEYE_ARTIFACT_ENCRYPTION_KEY", encryption_key.decode())
    monkeypatch.setenv("DATABASE_URL", database_url)

    response = TestClient(app).post(
        "/api/v1/runs",
        json={"dataset_id": "missing", "synthetic_context": make_context()},
    )
    assert response.status_code == 400


def test_run_detail_openapi_declares_not_found_and_storage_errors() -> None:
    responses = app.openapi()["paths"]["/api/v1/runs/{run_id}"]["get"]["responses"]

    for status_code in ("404", "503"):
        assert responses[status_code]["content"]["application/json"]["schema"] == {
            "$ref": "#/components/schemas/ApiErrorResponse"
        }
