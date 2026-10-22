"""Prepare encrypted, label-isolated analytical artifacts from imported CSVs."""

from __future__ import annotations

import csv
import hashlib
import io
import json
import os
from dataclasses import dataclass
from datetime import UTC, date, datetime
from pathlib import Path

import polars as pl
from cryptography.fernet import Fernet, InvalidToken
from fisheye_domain.csv_schema import CSV_HEADERS, SCHEMA_VERSION, SCHEMA_VERSION_V1
from fisheye_domain.csv_validation import validate_events_csv
from fisheye_persistence.artifacts import (
    ArtifactStore,
    LocalArtifactStore,
    artifact_store_from_environment,
    as_artifact_store,
    write_encrypted_immutable,
)
from fisheye_persistence.datasets import DatasetRecord, get_dataset, read_dataset_source
from sqlalchemy.orm import Session

EVENT_SCHEMA: dict[str, type[pl.DataType] | pl.DataType] = {
    "event_id": pl.String,
    "employee_id": pl.String,
    "role_id": pl.String,
    "department_id": pl.String,
    "event_timestamp_utc": pl.Datetime("us", "UTC"),
    "event_type": pl.String,
    "system": pl.String,
    "device_id": pl.String,
    "location_label": pl.String,
    "record_count": pl.Int64,
}
PARTITION_SCHEMA: dict[str, type[pl.DataType] | pl.DataType] = {
    "employee_id": pl.String,
    "employee_day_utc": pl.Date,
    "dataset_partition": pl.String,
}
LABEL_SCHEMA: dict[str, type[pl.DataType] | pl.DataType] = {
    "employee_id": pl.String,
    "employee_day_utc": pl.Date,
    "ground_truth_label": pl.String,
}


@dataclass(frozen=True)
class PreparationResult:
    dataset_id: str
    preparation_status: str
    analysis_manifest_sha256: str
    row_count: int
    employee_day_count: int


@dataclass(frozen=True)
class StoredAnalysisArtifacts:
    manifest_sha256: str
    row_count: int
    employee_day_count: int
    prepared_at: datetime
    artifact_uri: str = ""


def prepare_dataset(
    session: Session,
    dataset_id: str,
    artifact_root: Path | ArtifactStore,
    encryption_key: bytes,
) -> PreparationResult:
    """Convert one imported CSV exactly once and persist preparation metadata."""
    record = get_dataset(session, dataset_id)
    if record is None:
        raise LookupError("Dataset was not found.")
    if record.schema_version not in {SCHEMA_VERSION, SCHEMA_VERSION_V1}:
        raise ValueError("This worker does not support the dataset schema version.")
    session.expunge(record)
    session.commit()

    source = read_dataset_source(record, artifact_root, encryption_key)
    cipher = _make_cipher(encryption_key)
    artifact_base = (Path(record.artifact_uri).parent / "analysis").as_posix()
    store = as_artifact_store(artifact_root)
    if record.preparation_status == "prepared":
        artifact_rel = record.analysis_artifact_uri
        if not artifact_rel:
            raise RuntimeError("Prepared dataset analysis artifacts are missing.")
        prepared = _verify_existing_artifacts(
            store, artifact_rel, record, record.analysis_manifest_sha256, cipher
        )
    elif store.exists(f"{artifact_base}/manifest.json.enc"):
        # Continue to read artifacts written by the previous stable-prefix format.
        artifact_rel = artifact_base
        prepared = _verify_existing_artifacts(store, artifact_rel, record, None, cipher)
    else:
        validation = validate_events_csv(source)
        if not validation.valid or validation.schema_version != record.schema_version:
            raise ValueError("The stored source CSV failed its schema integrity check.")
        prepared = _create_and_publish_artifacts(record, source, store, cipher, artifact_base)

    relative_uri = prepared.artifact_uri or artifact_base
    persisted_record = get_dataset(session, record.id)
    if persisted_record is None or persisted_record.sha256 != record.sha256:
        raise RuntimeError("Dataset metadata changed during preparation.")
    if persisted_record.preparation_status == "prepared":
        if (
            persisted_record.analysis_artifact_uri != relative_uri
            or persisted_record.analysis_manifest_sha256 != prepared.manifest_sha256
            or _normalize_utc(persisted_record.prepared_at) != prepared.prepared_at
        ):
            raise RuntimeError("Prepared dataset metadata does not match its immutable artifacts.")
    else:
        persisted_record.preparation_status = "prepared"
        persisted_record.prepared_at = prepared.prepared_at
        persisted_record.analysis_artifact_uri = relative_uri
        persisted_record.analysis_manifest_sha256 = prepared.manifest_sha256
        session.commit()

    return PreparationResult(
        dataset_id=record.id,
        preparation_status=persisted_record.preparation_status,
        analysis_manifest_sha256=prepared.manifest_sha256,
        row_count=prepared.row_count,
        employee_day_count=prepared.employee_day_count,
    )


def _create_and_publish_artifacts(
    record: DatasetRecord,
    source: bytes,
    destination: Path | ArtifactStore,
    cipher: Fernet,
    artifact_prefix: str | None = None,
) -> StoredAnalysisArtifacts:
    if isinstance(destination, Path):
        store: ArtifactStore = LocalArtifactStore(destination.parent)
        artifact_prefix = destination.name
    else:
        store = destination
    if not artifact_prefix:
        raise ValueError("Artifact storage prefix is required.")
    event_bytes, partition_bytes, label_bytes, row_count, employee_day_count = (
        _convert_csv_to_parquet(source)
    )
    prepared_at = datetime.now(UTC)
    artifacts = {
        "events.parquet.enc": event_bytes,
        "partitions.parquet.enc": partition_bytes,
        "labels.parquet.enc": label_bytes,
    }
    content_digest = hashlib.sha256()
    for name, content in artifacts.items():
        content_digest.update(name.encode("utf-8"))
        content_digest.update(b"\0")
        content_digest.update(content)
    # If a worker dies before writing the manifest, a later build with different
    # converter output publishes under a new prefix instead of colliding with the
    # orphaned immutable objects.
    artifact_prefix = f"{artifact_prefix.rstrip('/')}/{content_digest.hexdigest()}"
    manifest = {
        "manifest_schema_version": "fisheye.dataset-analysis-manifest.v1",
        "dataset_id": record.id,
        "source_sha256": record.sha256,
        "event_schema_version": record.schema_version,
        "converter_version": "fisheye.dataset-preparation.v2",
        "worker_build_revision": _worker_build_revision(),
        "polars_version": pl.__version__,
        "row_count": row_count,
        "employee_day_count": employee_day_count,
        "event_artifact": "events.parquet.enc",
        "event_artifact_sha256": hashlib.sha256(event_bytes).hexdigest(),
        "partition_artifact": "partitions.parquet.enc",
        "partition_artifact_sha256": hashlib.sha256(partition_bytes).hexdigest(),
        "label_artifact": "labels.parquet.enc",
        "label_artifact_sha256": hashlib.sha256(label_bytes).hexdigest(),
        "detector_inputs_exclude": ["dataset_partition", "ground_truth_label"],
        "ground_truth_usage": (
            "calibration_for_threshold_selection; evaluation_for_metrics; "
            "stored separately from detector inputs"
            if record.schema_version == SCHEMA_VERSION
            else "evaluation_only; stored separately from detector inputs"
        ),
        "prepared_at": prepared_at.isoformat(),
    }
    manifest_bytes = (json.dumps(manifest, indent=2, sort_keys=True) + "\n").encode("utf-8")
    manifest_sha256 = hashlib.sha256(manifest_bytes).hexdigest()
    winner = _publish_artifacts(store, artifact_prefix, artifacts, manifest_bytes, cipher, record)
    if winner is not None:
        return winner
    return StoredAnalysisArtifacts(
        manifest_sha256, row_count, employee_day_count, prepared_at, artifact_prefix
    )


def _convert_csv_to_parquet(content: bytes) -> tuple[bytes, bytes, bytes, int, int]:
    try:
        decoded = content.decode("utf-8-sig")
        reader = csv.DictReader(io.StringIO(decoded, newline=""), strict=True)
        if tuple(reader.fieldnames or ()) != CSV_HEADERS:
            raise ValueError

        event_rows: list[tuple[object, ...]] = []
        partitions: dict[tuple[str, date], str] = {}
        labels: dict[tuple[str, date], str] = {}
        for row in reader:
            if None in row:
                raise ValueError
            values = {key: (value or "").strip() for key, value in row.items()}
            event_time = _parse_event_time(values["event_timestamp_utc"])
            partition = values["dataset_partition"]
            label = values["ground_truth_label"]
            if event_time is None or partition not in {"baseline", "calibration", "evaluation"}:
                raise ValueError
            employee_day = (values["employee_id"], event_time.date())
            previous_partition = partitions.setdefault(employee_day, partition)
            if previous_partition != partition:
                raise ValueError
            if partition in {"calibration", "evaluation"}:
                previous_label = labels.setdefault(employee_day, label)
                if previous_label != label:
                    raise ValueError

            record_count = values["record_count"]
            event_rows.append(
                (
                    values["event_id"],
                    values["employee_id"],
                    values["role_id"],
                    values["department_id"],
                    event_time,
                    values["event_type"],
                    values["system"],
                    values["device_id"] or None,
                    values["location_label"] or None,
                    int(record_count) if record_count else None,
                )
            )
    except (UnicodeDecodeError, csv.Error, KeyError, TypeError, ValueError) as error:
        raise ValueError("The stored source CSV could not be converted safely.") from error

    events = pl.DataFrame(event_rows, schema=EVENT_SCHEMA, orient="row")
    partition_rows = [
        (employee_id, employee_day, partition)
        for (employee_id, employee_day), partition in partitions.items()
    ]
    label_rows = [
        (employee_id, employee_day, label) for (employee_id, employee_day), label in labels.items()
    ]
    partition_frame = pl.DataFrame(partition_rows, schema=PARTITION_SCHEMA, orient="row").sort(
        ["employee_id", "employee_day_utc"]
    )
    labels_frame = pl.DataFrame(label_rows, schema=LABEL_SCHEMA, orient="row").sort(
        ["employee_id", "employee_day_utc"]
    )
    return (
        _parquet_bytes(events),
        _parquet_bytes(partition_frame),
        _parquet_bytes(labels_frame),
        events.height,
        partition_frame.height,
    )


def _parquet_bytes(frame: pl.DataFrame) -> bytes:
    buffer = io.BytesIO()
    frame.write_parquet(buffer, compression="zstd", statistics=True)
    return buffer.getvalue()


def _parse_event_time(value: str) -> datetime | None:
    if not value.endswith("Z"):
        return None
    try:
        parsed = datetime.fromisoformat(value[:-1] + "+00:00")
    except ValueError:
        return None
    if parsed.tzinfo is None or parsed.utcoffset() != UTC.utcoffset(parsed):
        return None
    return parsed.astimezone(UTC)


def _make_cipher(encryption_key: bytes) -> Fernet:
    try:
        return Fernet(encryption_key)
    except (TypeError, ValueError):
        raise RuntimeError("Dataset artifact encryption is not configured correctly.") from None


def _publish_artifacts(
    store: ArtifactStore,
    artifact_prefix: str,
    artifacts: dict[str, bytes],
    manifest_bytes: bytes,
    cipher: Fernet,
    record: DatasetRecord,
) -> StoredAnalysisArtifacts | None:
    manifest_uri = f"{artifact_prefix}/manifest.json.enc"
    if store.exists(manifest_uri):
        return _verify_existing_artifacts(store, artifact_prefix, record, None, cipher)
    for name, content in artifacts.items():
        write_encrypted_immutable(
            store,
            f"{artifact_prefix}/{name}",
            content,
            encrypt=cipher.encrypt,
            decrypt=cipher.decrypt,
        )
    # The manifest is the publication marker and must be written after all artifacts.
    try:
        write_encrypted_immutable(
            store,
            manifest_uri,
            manifest_bytes,
            encrypt=cipher.encrypt,
            decrypt=cipher.decrypt,
        )
    except RuntimeError:
        if not store.exists(manifest_uri):
            raise
        return _verify_existing_artifacts(store, artifact_prefix, record, None, cipher)
    if not store.read(f"{artifact_prefix}/manifest.json.enc"):
        raise RuntimeError("Dataset analysis manifest was not published.")
    return _verify_existing_artifacts(
        store, artifact_prefix, record, None, cipher, expected_manifest_bytes=manifest_bytes
    )


def _verify_existing_artifacts(
    store: ArtifactStore,
    artifact_prefix: str,
    record: DatasetRecord,
    expected_manifest_sha256: str | None,
    cipher: Fernet,
    *,
    expected_manifest_bytes: bytes | None = None,
) -> StoredAnalysisArtifacts:
    try:
        manifest_bytes = cipher.decrypt(store.read(f"{artifact_prefix}/manifest.json.enc"))
        manifest_sha256 = hashlib.sha256(manifest_bytes).hexdigest()
        if expected_manifest_sha256 and manifest_sha256 != expected_manifest_sha256:
            raise RuntimeError(
                "Existing analysis manifest checksum does not match dataset metadata."
            )
        if expected_manifest_bytes is not None and manifest_bytes != expected_manifest_bytes:
            raise RuntimeError("Concurrent analysis preparation produced different artifacts.")
        manifest = json.loads(manifest_bytes)
        if (
            manifest.get("manifest_schema_version") != "fisheye.dataset-analysis-manifest.v1"
            or manifest.get("dataset_id") != record.id
            or manifest.get("source_sha256") != record.sha256
            or manifest.get("event_schema_version") != record.schema_version
            or not isinstance(manifest.get("worker_build_revision"), str)
            or not manifest["worker_build_revision"].strip()
        ):
            raise RuntimeError("Existing analysis artifacts refer to a different source dataset.")
        artifacts = {
            "events.parquet.enc": manifest.get("event_artifact_sha256"),
            "partitions.parquet.enc": manifest.get("partition_artifact_sha256"),
            "labels.parquet.enc": manifest.get("label_artifact_sha256"),
        }
        expected_names = {
            "event_artifact": "events.parquet.enc",
            "partition_artifact": "partitions.parquet.enc",
            "label_artifact": "labels.parquet.enc",
        }
        for field, expected_name in expected_names.items():
            if manifest.get(field) != expected_name:
                raise RuntimeError("Existing analysis manifest references an unsupported artifact.")
        for name, expected_sha256 in artifacts.items():
            if not isinstance(expected_sha256, str) or len(expected_sha256) != 64:
                raise RuntimeError("Existing analysis manifest has an invalid artifact checksum.")
            content = cipher.decrypt(store.read(f"{artifact_prefix}/{name}"))
            if hashlib.sha256(content).hexdigest() != expected_sha256:
                raise RuntimeError(
                    "Existing analysis artifact checksum does not match its manifest."
                )
        row_count = manifest.get("row_count")
        employee_day_count = manifest.get("employee_day_count")
        if (
            not isinstance(row_count, int)
            or row_count < 0
            or not isinstance(employee_day_count, int)
            or employee_day_count < 0
        ):
            raise RuntimeError("Existing analysis manifest has invalid row counts.")
        prepared_at = datetime.fromisoformat(manifest["prepared_at"])
        if prepared_at.tzinfo is None:
            raise RuntimeError("Existing analysis manifest has an invalid preparation timestamp.")
        prepared_at = prepared_at.astimezone(UTC)
        return StoredAnalysisArtifacts(
            manifest_sha256, row_count, employee_day_count, prepared_at, artifact_prefix
        )
    except (OSError, InvalidToken, json.JSONDecodeError) as error:
        raise RuntimeError(
            "Existing analysis artifacts are missing or failed integrity checks."
        ) from error
    except (KeyError, TypeError, ValueError) as error:
        raise RuntimeError("Existing analysis manifest is malformed.") from error


def _worker_build_revision() -> str:
    configured = os.getenv("FISHEYE_CODE_REVISION", "").strip()
    if configured:
        return configured
    return f"module-sha256:{hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}"


def _normalize_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def prepare_dataset_from_environment(dataset_id: str) -> PreparationResult:
    """Run one dataset preparation from explicitly configured local storage."""
    from fisheye_persistence.datasets import create_session_factory

    database_url = os.getenv("DATABASE_URL")
    encryption_key = os.getenv("FISHEYE_ARTIFACT_ENCRYPTION_KEY")
    try:
        artifact_store = artifact_store_from_environment()
    except RuntimeError:
        artifact_store = None
    if not database_url or artifact_store is None or not encryption_key:
        raise RuntimeError("Dataset preparation requires database and encrypted artifact settings.")
    factory = create_session_factory(database_url)
    with factory() as session:
        return prepare_dataset(
            session,
            dataset_id,
            artifact_store,
            encryption_key.encode("utf-8"),
        )
