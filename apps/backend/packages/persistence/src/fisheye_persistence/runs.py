"""Durable development evaluation runs and PostgreSQL-backed worker leases."""

from __future__ import annotations

import hashlib
import os
import shutil
import tempfile
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import uuid4

from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy import (
    JSON,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    and_,
    or_,
    select,
    update,
)
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Mapped, Session, mapped_column

from fisheye_persistence.datasets import Base, DatasetRecord

MAX_RUN_ATTEMPTS = 3
DEFAULT_LEASE_SECONDS = 30 * 60


class EvaluationRunRecord(Base):
    __tablename__ = "evaluation_runs"
    __table_args__ = (
        UniqueConstraint("idempotency_key", name="uq_evaluation_runs_idempotency_key"),
        CheckConstraint(
            "status IN ('queued', 'running', 'completed', 'failed')",
            name="ck_evaluation_runs_status",
        ),
        CheckConstraint("attempt_count >= 0", name="ck_evaluation_runs_attempt_count"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    dataset_id: Mapped[str] = mapped_column(ForeignKey("datasets.id"), nullable=False, index=True)
    idempotency_key: Mapped[str] = mapped_column(String(128), nullable=False)
    request_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    context_artifact_uri: Mapped[str] = mapped_column(Text, nullable=False)
    context_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    methodology_version: Mapped[str] = mapped_column(String(96), nullable=False)
    config_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="queued")
    attempt_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    available_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    lease_owner: Mapped[str | None] = mapped_column(String(128), nullable=True)
    lease_token: Mapped[str | None] = mapped_column(String(36), nullable=True)
    lease_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    failed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    error_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    metrics_json: Mapped[dict[str, object] | None] = mapped_column(JSON, nullable=True)
    result_artifact_uri: Mapped[str | None] = mapped_column(Text, nullable=True)
    result_manifest_sha256: Mapped[str | None] = mapped_column(String(64), nullable=True)


@dataclass(frozen=True)
class RunLease:
    run_id: str
    dataset_id: str
    context_artifact_uri: str
    context_sha256: str
    methodology_version: str
    config_sha256: str
    lease_token: str
    attempt_count: int


def store_context_artifact(
    content: bytes,
    artifact_root: Path,
    encryption_key: bytes,
) -> tuple[str, str]:
    """Encrypt and publish a content-addressed context sidecar."""
    sha256 = hashlib.sha256(content).hexdigest()
    relative_uri = (Path("run-inputs") / sha256[:2] / f"{sha256}.json.enc").as_posix()
    destination = _safe_path(artifact_root, relative_uri)
    cipher = _cipher(encryption_key)
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists():
        if cipher.decrypt(destination.read_bytes()) != content:
            raise RuntimeError("Stored run context failed its integrity check.")
        return relative_uri, sha256

    temporary = Path(tempfile.mkdtemp(prefix=".run-input-", dir=destination.parent))
    try:
        (temporary / destination.name).write_bytes(cipher.encrypt(content))
        try:
            os.rename(temporary / destination.name, destination)
        except FileExistsError:
            if cipher.decrypt(destination.read_bytes()) != content:
                raise RuntimeError("Stored run context failed its integrity check.") from None
    finally:
        shutil.rmtree(temporary, ignore_errors=True)
    return relative_uri, sha256


def read_context_artifact(
    relative_uri: str,
    expected_sha256: str,
    artifact_root: Path,
    encryption_key: bytes,
) -> bytes:
    path = _safe_path(artifact_root, relative_uri)
    try:
        content = _cipher(encryption_key).decrypt(path.read_bytes())
    except (OSError, InvalidToken) as error:
        raise RuntimeError("Stored run context is unavailable or cannot be decrypted.") from error
    if hashlib.sha256(content).hexdigest() != expected_sha256:
        raise RuntimeError("Stored run context failed its integrity check.")
    return content


def create_run(
    session: Session,
    *,
    dataset: DatasetRecord,
    idempotency_key: str,
    request_sha256: str,
    context_artifact_uri: str,
    context_sha256: str,
    methodology_version: str,
    config_sha256: str,
) -> tuple[EvaluationRunRecord, bool]:
    """Create a queued run once; identical retries return the existing record."""
    existing = session.scalar(
        select(EvaluationRunRecord).where(EvaluationRunRecord.idempotency_key == idempotency_key)
    )
    if existing is not None:
        if existing.request_sha256 != request_sha256:
            raise ValueError("Idempotency key was already used with a different run request.")
        return existing, False
    record = EvaluationRunRecord(
        id=str(uuid4()),
        dataset_id=dataset.id,
        idempotency_key=idempotency_key,
        request_sha256=request_sha256,
        context_artifact_uri=context_artifact_uri,
        context_sha256=context_sha256,
        methodology_version=methodology_version,
        config_sha256=config_sha256,
        status="queued",
        attempt_count=0,
        available_at=datetime.now(UTC),
        created_at=datetime.now(UTC),
    )
    session.add(record)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        existing = session.scalar(
            select(EvaluationRunRecord).where(
                EvaluationRunRecord.idempotency_key == idempotency_key
            )
        )
        if existing is None:
            raise
        if existing.request_sha256 != request_sha256:
            raise ValueError(
                "Idempotency key was already used with a different run request."
            ) from None
        return existing, False
    return record, True


def claim_next_run(
    session: Session,
    *,
    worker_id: str,
    now: datetime | None = None,
    lease_seconds: int = DEFAULT_LEASE_SECONDS,
) -> RunLease | None:
    """Atomically claim one queued run or reclaim an expired lease."""
    current = now or datetime.now(UTC)
    with session.begin():
        exhausted = session.scalars(
            select(EvaluationRunRecord).where(
                EvaluationRunRecord.status == "running",
                EvaluationRunRecord.lease_expires_at <= current,
                EvaluationRunRecord.attempt_count >= MAX_RUN_ATTEMPTS,
            )
        ).all()
        for record in exhausted:
            record.status = "failed"
            record.failed_at = current
            record.error_code = "worker_lease_expired"
            record.lease_owner = None
            record.lease_token = None
            record.lease_expires_at = None

        statement = (
            select(EvaluationRunRecord)
            .where(
                EvaluationRunRecord.attempt_count < MAX_RUN_ATTEMPTS,
                or_(
                    and_(
                        EvaluationRunRecord.status == "queued",
                        EvaluationRunRecord.available_at <= current,
                    ),
                    and_(
                        EvaluationRunRecord.status == "running",
                        EvaluationRunRecord.lease_expires_at <= current,
                    ),
                ),
            )
            .order_by(EvaluationRunRecord.created_at, EvaluationRunRecord.id)
            .with_for_update(skip_locked=True)
            .limit(1)
        )
        claimed = session.scalar(statement)
        if claimed is None:
            return None
        token = str(uuid4())
        claimed.status = "running"
        claimed.attempt_count += 1
        claimed.started_at = claimed.started_at or current
        claimed.lease_owner = worker_id
        claimed.lease_token = token
        claimed.lease_expires_at = current + timedelta(seconds=lease_seconds)
        claimed.error_code = None
        session.flush()
        return RunLease(
            run_id=claimed.id,
            dataset_id=claimed.dataset_id,
            context_artifact_uri=claimed.context_artifact_uri,
            context_sha256=claimed.context_sha256,
            methodology_version=claimed.methodology_version,
            config_sha256=claimed.config_sha256,
            lease_token=token,
            attempt_count=claimed.attempt_count,
        )


def heartbeat_run(
    session: Session,
    *,
    run_id: str,
    lease_token: str,
    now: datetime | None = None,
    lease_seconds: int = DEFAULT_LEASE_SECONDS,
) -> bool:
    current = now or datetime.now(UTC)
    result = session.execute(
        update(EvaluationRunRecord)
        .where(
            EvaluationRunRecord.id == run_id,
            EvaluationRunRecord.status == "running",
            EvaluationRunRecord.lease_token == lease_token,
        )
        .values(lease_expires_at=current + timedelta(seconds=lease_seconds))
        .returning(EvaluationRunRecord.id)
    )
    updated = result.scalar_one_or_none() is not None
    session.commit()
    return updated


def complete_run(
    session: Session,
    *,
    run_id: str,
    lease_token: str,
    metrics_json: dict[str, object],
    result_artifact_uri: str,
    result_manifest_sha256: str,
    now: datetime | None = None,
) -> bool:
    current = now or datetime.now(UTC)
    result = session.execute(
        update(EvaluationRunRecord)
        .where(
            EvaluationRunRecord.id == run_id,
            EvaluationRunRecord.status == "running",
            EvaluationRunRecord.lease_token == lease_token,
        )
        .values(
            status="completed",
            completed_at=current,
            metrics_json=metrics_json,
            result_artifact_uri=result_artifact_uri,
            result_manifest_sha256=result_manifest_sha256,
            lease_owner=None,
            lease_token=None,
            lease_expires_at=None,
            error_code=None,
        )
        .returning(EvaluationRunRecord.id)
    )
    updated = result.scalar_one_or_none() is not None
    session.commit()
    return updated


def fail_run(
    session: Session,
    *,
    run_id: str,
    lease_token: str,
    error_code: str,
    now: datetime | None = None,
) -> str:
    """Fail safely or return the run to the queue for a bounded retry."""
    current = now or datetime.now(UTC)
    with session.begin():
        record = session.scalar(
            select(EvaluationRunRecord)
            .where(
                EvaluationRunRecord.id == run_id,
                EvaluationRunRecord.status == "running",
                EvaluationRunRecord.lease_token == lease_token,
            )
            .with_for_update()
        )
        if record is None:
            return "stale"
        record.error_code = error_code
        record.lease_owner = None
        record.lease_token = None
        record.lease_expires_at = None
        if record.attempt_count < MAX_RUN_ATTEMPTS:
            record.status = "queued"
            delay = min(60, 2**record.attempt_count)
            record.available_at = current + timedelta(seconds=delay)
        else:
            record.status = "failed"
            record.failed_at = current
        return record.status


def get_run(session: Session, run_id: str) -> EvaluationRunRecord | None:
    return session.get(EvaluationRunRecord, run_id)


def list_runs(
    session: Session,
    *,
    limit: int,
    offset: int,
) -> tuple[list[EvaluationRunRecord], int]:
    from sqlalchemy import func

    total = session.scalar(select(func.count()).select_from(EvaluationRunRecord)) or 0
    records = list(
        session.scalars(
            select(EvaluationRunRecord)
            .order_by(EvaluationRunRecord.created_at.desc(), EvaluationRunRecord.id.asc())
            .offset(offset)
            .limit(limit)
        )
    )
    return records, total


def _cipher(key: bytes) -> Fernet:
    try:
        return Fernet(key)
    except (TypeError, ValueError):
        raise RuntimeError("Run artifact encryption is not configured correctly.") from None


def _safe_path(root: Path, relative_uri: str) -> Path:
    path = (root / relative_uri).resolve()
    try:
        path.relative_to(root.resolve())
    except ValueError:
        raise RuntimeError("A run artifact path is invalid.") from None
    return path
