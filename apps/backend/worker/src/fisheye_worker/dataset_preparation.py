"""Prepare encrypted, label-isolated analytical artifacts from imported CSVs."""

from __future__ import annotations

import csv
import hashlib
import io
import json
import os
import shutil
import tempfile
from dataclasses import dataclass
from datetime import UTC, date, datetime
from pathlib import Path

import polars as pl
from cryptography.fernet import Fernet, InvalidToken
from fisheye_domain.csv_schema import CSV_HEADERS, SCHEMA_VERSION
from fisheye_domain.csv_validation import validate_events_csv
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


def prepare_dataset(
    session: Session,
    dataset_id: str,
    artifact_root: Path,
    encryption_key: bytes,
) -> PreparationResult:
    """Convert one imported CSV exactly once and persist preparation metadata."""
    record = get_dataset(session, dataset_id)
    if record is None:
        raise LookupError("Dataset was not found.")
    if record.schema_version != SCHEMA_VERSION:
        raise ValueError("This worker does not support the dataset schema version.")
    session.expunge(record)
    session.commit()

    source = read_dataset_source(record, artifact_root, encryption_key)
    validation = validate_events_csv(source)
    if not validation.valid or validation.schema_version != record.schema_version:
        raise ValueError("The stored source CSV failed its schema integrity check.")

    cipher = _make_cipher(encryption_key)
    event_bytes, partition_bytes, label_bytes, row_count, employee_day_count = (
        _convert_csv_to_parquet(source)
    )
    artifact_rel = Path(record.artifact_uri).parent / "analysis"
    destination = _safe_path(artifact_root, artifact_rel)
    created_at = record.created_at
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=UTC)
    artifacts = {
        "events.parquet.enc": event_bytes,
        "partitions.parquet.enc": partition_bytes,
        "labels.parquet.enc": label_bytes,
    }
    manifest = {
        "manifest_schema_version": "fisheye.dataset-analysis-manifest.v1",
        "dataset_id": record.id,
        "source_sha256": record.sha256,
        "event_schema_version": record.schema_version,
        "converter_version": "fisheye.dataset-preparation.v1",
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
        "ground_truth_usage": "evaluation_only; stored in a separate artifact",
        "prepared_at": created_at.isoformat(),
    }
    manifest_bytes = (json.dumps(manifest, indent=2, sort_keys=True) + "\n").encode("utf-8")
    manifest_sha256 = hashlib.sha256(manifest_bytes).hexdigest()

    if destination.exists():
        _verify_existing_artifacts(
            destination, record, manifest_sha256, artifacts, manifest_bytes, cipher
        )
    else:
        _publish_artifacts(destination, artifacts, manifest_bytes, cipher)

    relative_uri = artifact_rel.as_posix()
    persisted_record = get_dataset(session, record.id)
    if persisted_record is None or persisted_record.sha256 != record.sha256:
        raise RuntimeError("Dataset metadata changed during preparation.")
    if persisted_record.preparation_status == "prepared":
        if (
            persisted_record.analysis_artifact_uri != relative_uri
            or persisted_record.analysis_manifest_sha256 != manifest_sha256
        ):
            raise RuntimeError("Prepared dataset metadata does not match its immutable artifacts.")
    else:
        persisted_record.preparation_status = "prepared"
        persisted_record.analysis_artifact_uri = relative_uri
        persisted_record.analysis_manifest_sha256 = manifest_sha256
        session.commit()

    return PreparationResult(
        dataset_id=record.id,
        preparation_status=persisted_record.preparation_status,
        analysis_manifest_sha256=manifest_sha256,
        row_count=row_count,
        employee_day_count=employee_day_count,
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
            if event_time is None or partition not in {"baseline", "evaluation"}:
                raise ValueError
            employee_day = (values["employee_id"], event_time.date())
            previous_partition = partitions.setdefault(employee_day, partition)
            if previous_partition != partition:
                raise ValueError
            if partition == "evaluation":
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


def _safe_path(root: Path, relative_path: Path) -> Path:
    destination = (root / relative_path).resolve()
    try:
        destination.relative_to(root.resolve())
    except ValueError:
        raise RuntimeError("A dataset analysis artifact path is invalid.") from None
    return destination


def _publish_artifacts(
    destination: Path,
    artifacts: dict[str, bytes],
    manifest_bytes: bytes,
    cipher: Fernet,
) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = Path(tempfile.mkdtemp(prefix=".analysis-prepare-", dir=destination.parent))
    try:
        for name, content in artifacts.items():
            (temporary / name).write_bytes(cipher.encrypt(content))
        (temporary / "manifest.json.enc").write_bytes(cipher.encrypt(manifest_bytes))
        try:
            os.rename(temporary, destination)
        except OSError:
            if not destination.is_dir():
                raise
            _verify_existing_artifacts(
                destination,
                None,
                hashlib.sha256(manifest_bytes).hexdigest(),
                artifacts,
                manifest_bytes,
                cipher,
            )
    finally:
        if temporary.exists():
            shutil.rmtree(temporary)


def _verify_existing_artifacts(
    directory: Path,
    record: DatasetRecord | None,
    expected_manifest_sha256: str,
    artifacts: dict[str, bytes],
    expected_manifest: bytes,
    cipher: Fernet,
) -> None:
    try:
        manifest_bytes = cipher.decrypt((directory / "manifest.json.enc").read_bytes())
        if hashlib.sha256(manifest_bytes).hexdigest() != expected_manifest_sha256:
            raise RuntimeError("Existing analysis manifest does not match regenerated content.")
        if manifest_bytes != expected_manifest:
            raise RuntimeError("Existing analysis manifest content has changed.")
        manifest = json.loads(manifest_bytes)
        if record is not None and manifest.get("source_sha256") != record.sha256:
            raise RuntimeError("Existing analysis artifacts refer to a different source dataset.")
        for name, expected_content in artifacts.items():
            content = cipher.decrypt((directory / name).read_bytes())
            if content != expected_content:
                raise RuntimeError("Existing analysis artifact content has changed.")
    except (OSError, InvalidToken, json.JSONDecodeError) as error:
        raise RuntimeError(
            "Existing analysis artifacts are missing or failed integrity checks."
        ) from error


def prepare_dataset_from_environment(dataset_id: str) -> PreparationResult:
    """Run one dataset preparation from explicitly configured local storage."""
    from fisheye_persistence.datasets import create_session_factory

    database_url = os.getenv("DATABASE_URL")
    artifact_dir = os.getenv("FISHEYE_ARTIFACT_DIR")
    encryption_key = os.getenv("FISHEYE_ARTIFACT_ENCRYPTION_KEY")
    if not database_url or not artifact_dir or not encryption_key:
        raise RuntimeError("Dataset preparation requires database and encrypted artifact settings.")
    factory = create_session_factory(database_url)
    with factory() as session:
        return prepare_dataset(
            session,
            dataset_id,
            Path(artifact_dir),
            encryption_key.encode("utf-8"),
        )
