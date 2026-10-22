import csv
import hashlib
import io
import json
import logging
from datetime import UTC, datetime
from pathlib import Path

import polars as pl
import pytest
from cryptography.fernet import Fernet
from fisheye_domain.csv_schema import CSV_HEADERS
from fisheye_domain.csv_validation import validate_events_csv
from fisheye_persistence.datasets import Base, DatasetRecord, create_session_factory, import_dataset
from fisheye_worker import dataset_preparation
from fisheye_worker.dataset_preparation import (
    _create_and_publish_artifacts,
    _make_cipher,
    prepare_dataset,
)
from fisheye_worker.main import main
from sqlalchemy import create_engine
from sqlalchemy.engine import URL


def make_csv() -> bytes:
    rows = [
        (
            "evt-base-1",
            "emp-demo-1",
            "role-analyst",
            "dept-ops",
            "2026-01-01T09:00:00Z",
            "sign_in",
            "synthetic-core",
            "device-base",
            "synthetic-office",
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
            "device-new",
            "synthetic-office",
            "4",
            "evaluation",
            "threat_scenario",
        ),
        (
            "evt-eval-2",
            "emp-demo-1",
            "role-analyst",
            "dept-ops",
            "2026-01-02T10:00:00Z",
            "record_export",
            "synthetic-core",
            "device-new",
            "synthetic-office",
            "2",
            "evaluation",
            "threat_scenario",
        ),
    ]
    buffer = io.StringIO(newline="")
    writer = csv.writer(buffer, lineterminator="\n")
    writer.writerow(CSV_HEADERS)
    writer.writerows(rows)
    return buffer.getvalue().encode("utf-8")


@pytest.fixture
def imported_dataset(tmp_path):
    database_url = str(URL.create("sqlite+pysqlite", database=str(tmp_path / "fisheye.db")))
    engine = create_engine(database_url)
    Base.metadata.create_all(engine)
    engine.dispose()
    artifact_root = tmp_path / "artifacts"
    encryption_key = Fernet.generate_key()
    content = make_csv()
    validation = validate_events_csv(content)
    assert validation.valid
    factory = create_session_factory(database_url)
    with factory() as session:
        record, created = import_dataset(
            session,
            content,
            validation.schema_version,
            validation.row_count,
            validation.employee_day_count,
            artifact_root,
            encryption_key,
        )
        assert created
        dataset_id = record.id
    return database_url, artifact_root, encryption_key, dataset_id, content


def test_prepare_dataset_writes_encrypted_label_isolated_parquet(imported_dataset) -> None:
    database_url, artifact_root, encryption_key, dataset_id, source = imported_dataset
    factory = create_session_factory(database_url)

    with factory() as session:
        result = prepare_dataset(session, dataset_id, artifact_root, encryption_key)
        record = session.get(DatasetRecord, dataset_id)
        assert record is not None
        assert record.preparation_status == "prepared"
        assert record.analysis_manifest_sha256 == result.analysis_manifest_sha256
        assert record.analysis_artifact_uri is not None
        assert record.prepared_at is not None
        manifest = json.loads(
            Fernet(encryption_key).decrypt(
                (artifact_root / record.analysis_artifact_uri / "manifest.json.enc").read_bytes()
            )
        )
        expected_prepared_at = datetime.fromisoformat(manifest["prepared_at"])
        assert record.prepared_at.replace(tzinfo=UTC) == expected_prepared_at
        assert record.prepared_at != record.created_at
        analysis_dir = artifact_root / record.analysis_artifact_uri

    cipher = Fernet(encryption_key)
    manifest_bytes = cipher.decrypt((analysis_dir / "manifest.json.enc").read_bytes())
    manifest = json.loads(manifest_bytes)
    assert hashlib.sha256(manifest_bytes).hexdigest() == result.analysis_manifest_sha256
    assert manifest["source_sha256"] == hashlib.sha256(source).hexdigest()
    assert manifest["row_count"] == 3
    assert manifest["employee_day_count"] == 2
    assert manifest["ground_truth_usage"] == (
        "calibration_for_threshold_selection; evaluation_for_metrics; "
        "stored separately from detector inputs"
    )

    events = pl.read_parquet(
        io.BytesIO(cipher.decrypt((analysis_dir / "events.parquet.enc").read_bytes()))
    )
    partitions = pl.read_parquet(
        io.BytesIO(cipher.decrypt((analysis_dir / "partitions.parquet.enc").read_bytes()))
    )
    labels = pl.read_parquet(
        io.BytesIO(cipher.decrypt((analysis_dir / "labels.parquet.enc").read_bytes()))
    )

    assert events.height == 3
    assert "ground_truth_label" not in events.columns
    assert "dataset_partition" not in events.columns
    assert events.schema["event_timestamp_utc"].time_zone == "UTC"
    assert events["record_count"].to_list() == [None, 4, 2]
    assert partitions.height == 2
    assert partitions["dataset_partition"].to_list() == ["baseline", "evaluation"]
    assert "ground_truth_label" not in partitions.columns
    assert labels.height == 1
    assert labels["ground_truth_label"].to_list() == ["threat_scenario"]
    assert labels["employee_day_utc"].to_list()[0].isoformat() == "2026-01-02"


def test_v2_preparation_preserves_calibration_partition_and_labels() -> None:
    rows = list(csv.reader(io.StringIO(make_csv().decode())))
    calibration = list(rows[2])
    calibration[0] = "evt-cal-1"
    calibration[4] = "2026-01-02T12:00:00Z"
    calibration[10] = "calibration"
    rows[2][4] = "2026-01-03T09:00:00Z"
    rows[3][4] = "2026-01-03T10:00:00Z"
    rows.insert(2, calibration)
    buffer = io.StringIO(newline="")
    csv.writer(buffer, lineterminator="\n").writerows(rows)
    source = buffer.getvalue().encode()

    validation = validate_events_csv(source)
    assert validation.valid is True
    assert validation.schema_version == "fisheye.events.v2"
    _, partition_bytes, label_bytes, _, _ = dataset_preparation._convert_csv_to_parquet(source)
    partitions = pl.read_parquet(io.BytesIO(partition_bytes))
    labels = pl.read_parquet(io.BytesIO(label_bytes))

    assert partitions["dataset_partition"].to_list() == [
        "baseline",
        "calibration",
        "evaluation",
    ]
    assert labels["ground_truth_label"].to_list() == ["threat_scenario", "threat_scenario"]


def test_prepare_dataset_is_idempotent_and_keeps_artifacts_immutable(imported_dataset) -> None:
    database_url, artifact_root, encryption_key, dataset_id, _ = imported_dataset
    factory = create_session_factory(database_url)

    with factory() as session:
        first = prepare_dataset(session, dataset_id, artifact_root, encryption_key)
        artifact_uri = session.get(DatasetRecord, dataset_id).analysis_artifact_uri
    analysis_dir = artifact_root / artifact_uri
    first_bytes = {
        path.name: path.read_bytes() for path in analysis_dir.iterdir() if path.is_file()
    }

    with factory() as session:
        second = prepare_dataset(session, dataset_id, artifact_root, encryption_key)

    second_bytes = {
        path.name: path.read_bytes() for path in analysis_dir.iterdir() if path.is_file()
    }
    assert second == first
    assert second_bytes == first_bytes


def test_retry_verifies_artifacts_without_reconverting_after_worker_upgrade(
    imported_dataset, monkeypatch
) -> None:
    database_url, artifact_root, encryption_key, dataset_id, _ = imported_dataset
    factory = create_session_factory(database_url)
    with factory() as session:
        first = prepare_dataset(session, dataset_id, artifact_root, encryption_key)
        record = session.get(DatasetRecord, dataset_id)
        assert record is not None
        first_prepared_at = record.prepared_at
        artifact_dir = artifact_root / record.analysis_artifact_uri
    before = {path.name: path.read_bytes() for path in artifact_dir.iterdir()}

    def fail_conversion(_content: bytes):
        raise AssertionError("a retry must not reconvert existing immutable artifacts")

    monkeypatch.setattr(dataset_preparation, "_convert_csv_to_parquet", fail_conversion)
    monkeypatch.setattr(dataset_preparation.pl, "__version__", "999.0.0")
    with factory() as session:
        second = prepare_dataset(session, dataset_id, artifact_root, encryption_key)
        record = session.get(DatasetRecord, dataset_id)
        assert record is not None
        assert record.prepared_at == first_prepared_at

    after = {path.name: path.read_bytes() for path in artifact_dir.iterdir()}
    assert second == first
    assert after == before


def test_losing_publisher_reuses_the_winning_artifacts(imported_dataset) -> None:
    database_url, artifact_root, encryption_key, dataset_id, source = imported_dataset
    factory = create_session_factory(database_url)

    with factory() as session:
        record = session.get(DatasetRecord, dataset_id)
        assert record is not None
        destination = artifact_root / Path(record.artifact_uri).parent / "analysis"
        session.expunge(record)
        cipher = _make_cipher(encryption_key)

        winner = _create_and_publish_artifacts(record, source, destination, cipher)
        loser = _create_and_publish_artifacts(record, source, destination, cipher)

        assert loser == winner
        prepared = prepare_dataset(session, dataset_id, artifact_root, encryption_key)
        persisted = session.get(DatasetRecord, dataset_id)
        assert persisted is not None
        assert persisted.preparation_status == "prepared"
        assert persisted.analysis_manifest_sha256 == winner.manifest_sha256
        assert persisted.prepared_at.replace(tzinfo=UTC) == winner.prepared_at
        assert prepared.analysis_manifest_sha256 == winner.manifest_sha256


def test_prepare_dataset_rejects_unknown_dataset(imported_dataset) -> None:
    database_url, artifact_root, encryption_key, _, _ = imported_dataset
    factory = create_session_factory(database_url)

    with factory() as session, pytest.raises(LookupError, match="not found"):
        prepare_dataset(session, "unknown", artifact_root, encryption_key)


def test_prepare_dataset_rejects_wrong_encryption_key(imported_dataset) -> None:
    database_url, artifact_root, _, dataset_id, _ = imported_dataset
    factory = create_session_factory(database_url)

    with factory() as session, pytest.raises(RuntimeError, match="missing or failed decryption"):
        prepare_dataset(session, dataset_id, artifact_root, Fernet.generate_key())


def test_worker_command_prepares_a_dataset(imported_dataset, monkeypatch, caplog) -> None:
    database_url, artifact_root, encryption_key, dataset_id, _ = imported_dataset
    monkeypatch.setenv("DATABASE_URL", database_url)
    monkeypatch.setenv("FISHEYE_ARTIFACT_DIR", str(artifact_root))
    monkeypatch.setenv("FISHEYE_ARTIFACT_ENCRYPTION_KEY", encryption_key.decode("ascii"))

    with caplog.at_level(logging.INFO):
        main(["prepare-dataset", "--dataset-id", dataset_id])

    assert "Synthetic dataset preparation completed" in caplog.text
    assert "No run was created and no risk was calculated" in caplog.text
