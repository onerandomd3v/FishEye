import csv
import io
from datetime import UTC

import fisheye_worker.run_processing as run_processing
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient
from fisheye_api.main import app
from fisheye_domain.csv_schema import CSV_HEADERS
from fisheye_persistence.datasets import Base, create_session_factory
from fisheye_persistence.runs import EvaluationRunRecord
from fisheye_worker.run_processing import process_next_run
from sqlalchemy import create_engine, select
from sqlalchemy.engine import URL
from sqlalchemy.orm import Session


def make_v2_csv() -> bytes:
    rows = [
        ("evt-base-1", "2026-01-01T09:00:00Z", "core", "baseline", ""),
        ("evt-base-2", "2026-01-02T09:00:00Z", "core", "baseline", ""),
        ("evt-base-3", "2026-01-03T09:00:00Z", "core", "baseline", ""),
        ("evt-cal", "2026-01-04T09:00:00Z", "wire", "calibration", "threat_scenario"),
        ("evt-eval-threat", "2026-01-05T09:00:00Z", "wire", "evaluation", "threat_scenario"),
        ("evt-eval-benign", "2026-01-06T09:00:00Z", "core", "evaluation", "benign_scenario"),
    ]
    output = io.StringIO(newline="")
    writer = csv.writer(output, lineterminator="\n")
    writer.writerow(CSV_HEADERS)
    for event_id, timestamp, system, partition, label in rows:
        writer.writerow(
            (
                event_id,
                "emp-demo-1",
                "role-teller",
                "dept-branch",
                timestamp,
                "record_read",
                system,
                "device-1",
                "branch-1",
                "40" if partition in {"calibration", "evaluation"} else "10",
                partition,
                label,
            )
        )
    return output.getvalue().encode()


def make_context() -> dict[str, object]:
    return {
        "schema_version": "fisheye.context.v1",
        "roles": [{"role_id": "role-teller", "authorized_systems": ["core"]}],
        "employee_schedules": [
            {
                "employee_id": "emp-demo-1",
                "timezone": "Africa/Lagos",
                "working_weekdays": [0, 1, 2, 3, 4, 5, 6],
                "work_start_local": "08:00",
                "work_end_local": "17:00",
            }
        ],
    }


def test_import_queue_process_and_read_real_synthetic_run(tmp_path, monkeypatch) -> None:
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

    imported = client.post(
        "/api/v1/datasets/imports",
        content=make_v2_csv(),
        headers={
            "Content-Type": "text/csv",
            "X-FishEye-Synthetic-Data-Confirmed": "true",
        },
    )
    assert imported.status_code == 201
    dataset_id = imported.json()["dataset_id"]

    request = {"dataset_id": dataset_id, "synthetic_context": make_context()}
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
    assert result["metrics"]["evaluation_unit_count"] == 2
    assert result["metrics"]["comparisons"]["contextual"]["report"]["metrics"]["unit_count"] == 2
    assert result["result_manifest_sha256"]

    findings = client.get(f"/api/v1/runs/{result['run_id']}/findings?detector=contextual")
    assert findings.status_code == 200
    finding_items = findings.json()["items"]
    assert any("evt-eval-threat" in item["evidence_event_ids"] for item in finding_items)
    assert all("ground_truth_label" not in item for item in finding_items)

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
