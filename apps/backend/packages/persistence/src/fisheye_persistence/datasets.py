"""Dataset metadata and immutable local artifacts for development imports."""

from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime
from pathlib import Path
from uuid import NAMESPACE_URL, uuid5

from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Integer,
    String,
    Text,
    UniqueConstraint,
    create_engine,
    func,
    select,
)
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker

from fisheye_persistence.artifacts import (
    ArtifactStore,
    as_artifact_store,
    write_encrypted_immutable,
)


class Base(DeclarativeBase):
    """SQLAlchemy metadata for API-owned transactional records."""


class DatasetRecord(Base):
    __tablename__ = "datasets"
    __table_args__ = (
        UniqueConstraint("sha256", name="uq_datasets_sha256"),
        CheckConstraint(
            "preparation_status IN ('source_only', 'prepared')",
            name="ck_datasets_preparation_status",
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    schema_version: Mapped[str] = mapped_column(String(64), nullable=False)
    row_count: Mapped[int] = mapped_column(Integer, nullable=False)
    employee_day_count: Mapped[int] = mapped_column(Integer, nullable=False)
    artifact_uri: Mapped[str] = mapped_column(Text, nullable=False)
    manifest_uri: Mapped[str] = mapped_column(Text, nullable=False)
    manifest_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    preparation_status: Mapped[str] = mapped_column(
        String(32), nullable=False, default="source_only"
    )
    prepared_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    analysis_artifact_uri: Mapped[str | None] = mapped_column(Text, nullable=True)
    analysis_manifest_sha256: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


def create_session_factory(database_url: str) -> sessionmaker[Session]:
    """Create the API's synchronous database session factory."""
    engine = create_engine(database_url, pool_pre_ping=True)
    return sessionmaker(bind=engine, expire_on_commit=False)


def import_dataset(
    session: Session,
    content: bytes,
    schema_version: str,
    row_count: int,
    employee_day_count: int,
    artifact_root: Path | ArtifactStore,
    encryption_key: bytes,
) -> tuple[DatasetRecord, bool]:
    """Persist a validated upload once, keyed by its exact source-byte hash."""
    try:
        cipher = Fernet(encryption_key)
    except (TypeError, ValueError):
        raise RuntimeError("Dataset artifact encryption is not configured correctly.") from None

    source_sha256 = hashlib.sha256(content).hexdigest()
    existing = session.scalar(select(DatasetRecord).where(DatasetRecord.sha256 == source_sha256))
    if existing is not None:
        _verify_artifact(artifact_root, existing.artifact_uri, source_sha256, cipher)
        _verify_artifact(artifact_root, existing.manifest_uri, existing.manifest_sha256, cipher)
        return existing, False

    dataset_id = str(uuid5(NAMESPACE_URL, f"fisheye:dataset:{source_sha256}"))
    created_at = datetime.now(UTC)
    relative_dir = Path("datasets") / source_sha256[:2] / source_sha256
    artifact_uri = (relative_dir / "source.csv.enc").as_posix()
    manifest_uri = (relative_dir / "manifest.json.enc").as_posix()
    manifest = {
        "manifest_schema_version": "fisheye.dataset-manifest.v1",
        "dataset_id": dataset_id,
        "source_sha256": source_sha256,
        "source_format": "text/csv",
        "source_artifact_uri": artifact_uri,
        "artifact_encryption": "fernet",
        "event_schema_version": schema_version,
        "row_count": row_count,
        "employee_day_count": employee_day_count,
        "seed": None,
        "seed_status": "not_provided_by_uploaded_csv",
        "ground_truth_usage": (
            "calibration_for_threshold_selection; evaluation_for_metrics; never_a_detector_feature"
            if schema_version == "fisheye.events.v2"
            else "evaluation_only; never a detector feature"
        ),
        "evaluation_status": "not_run",
    }
    manifest_bytes = (json.dumps(manifest, indent=2, sort_keys=True) + "\n").encode("utf-8")
    manifest_sha256 = hashlib.sha256(manifest_bytes).hexdigest()

    store = as_artifact_store(artifact_root)
    _publish_artifacts(
        store,
        artifact_uri,
        manifest_uri,
        cipher.encrypt(content),
        cipher.encrypt(manifest_bytes),
        source_sha256,
        manifest_sha256,
        cipher,
    )
    record = DatasetRecord(
        id=dataset_id,
        sha256=source_sha256,
        schema_version=schema_version,
        row_count=row_count,
        employee_day_count=employee_day_count,
        artifact_uri=artifact_uri,
        manifest_uri=manifest_uri,
        manifest_sha256=manifest_sha256,
        created_at=created_at,
    )
    try:
        session.add(record)
        session.commit()
    except IntegrityError:
        session.rollback()
        existing = session.scalar(
            select(DatasetRecord).where(DatasetRecord.sha256 == source_sha256)
        )
        if existing is None:
            raise
        _verify_artifact(artifact_root, existing.artifact_uri, source_sha256, cipher)
        _verify_artifact(artifact_root, existing.manifest_uri, existing.manifest_sha256, cipher)
        return existing, False
    return record, True


def list_datasets(session: Session, *, limit: int, offset: int) -> tuple[list[DatasetRecord], int]:
    """Return bounded dataset metadata, newest first, with a total count."""
    total = session.scalar(select(func.count()).select_from(DatasetRecord)) or 0
    records = list(
        session.scalars(
            select(DatasetRecord)
            .order_by(DatasetRecord.created_at.desc(), DatasetRecord.id.asc())
            .offset(offset)
            .limit(limit)
        )
    )
    return records, total


def get_dataset(session: Session, dataset_id: str) -> DatasetRecord | None:
    """Return one dataset's persisted provenance metadata."""
    return session.get(DatasetRecord, dataset_id)


def read_dataset_source(
    record: DatasetRecord, artifact_root: Path | ArtifactStore, encryption_key: bytes
) -> bytes:
    """Decrypt and verify the immutable source CSV for internal worker processing."""
    try:
        cipher = Fernet(encryption_key)
    except (TypeError, ValueError):
        raise RuntimeError("Dataset artifact encryption is not configured correctly.") from None
    return _read_artifact(artifact_root, record.artifact_uri, record.sha256, cipher)


def _publish_artifacts(
    store: ArtifactStore,
    source_uri: str,
    manifest_uri: str,
    encrypted_source: bytes,
    encrypted_manifest: bytes,
    source_sha256: str,
    manifest_sha256: str,
    cipher: Fernet,
) -> None:
    """Publish immutable encrypted objects, with the manifest uploaded last."""
    write_encrypted_immutable(
        store,
        source_uri,
        cipher.decrypt(encrypted_source),
        encrypt=cipher.encrypt,
        decrypt=cipher.decrypt,
    )
    _verify_artifact(store, source_uri, source_sha256, cipher)
    write_encrypted_immutable(
        store,
        manifest_uri,
        cipher.decrypt(encrypted_manifest),
        encrypt=cipher.encrypt,
        decrypt=cipher.decrypt,
    )
    _verify_artifact(store, manifest_uri, manifest_sha256, cipher)


def _verify_artifact(
    root: Path | ArtifactStore,
    relative_uri: str,
    expected_sha256: str,
    cipher: Fernet,
) -> None:
    _read_artifact(root, relative_uri, expected_sha256, cipher)


def _read_artifact(
    root: Path | ArtifactStore,
    relative_uri: str,
    expected_sha256: str,
    cipher: Fernet,
) -> bytes:
    store = as_artifact_store(root)
    try:
        plaintext = cipher.decrypt(store.read(relative_uri))
    except (OSError, InvalidToken) as error:
        raise RuntimeError(
            "A previously imported dataset artifact is missing or failed decryption."
        ) from error
    actual_sha256 = hashlib.sha256(plaintext).hexdigest()
    if actual_sha256 != expected_sha256:
        raise RuntimeError("A previously imported dataset artifact failed its integrity check.")
    return plaintext
