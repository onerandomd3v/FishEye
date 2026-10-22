"""Execute a leased research run and publish its immutable result artifacts."""

from __future__ import annotations

import hashlib
import io
import json
import logging
import os
import threading
from collections.abc import Callable
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path

import fisheye_domain
import fisheye_evaluation
import fisheye_persistence
import polars as pl
from cryptography.fernet import Fernet, InvalidToken
from fisheye_domain.context import parse_synthetic_context
from fisheye_evaluation.methodology import METHODOLOGY_CONFIG_SHA256
from fisheye_persistence.artifacts import (
    ArtifactStore,
    as_artifact_store,
    write_encrypted_immutable,
)
from fisheye_persistence.datasets import DatasetRecord, get_dataset
from fisheye_persistence.runs import (
    RunLease,
    claim_next_run,
    complete_run,
    fail_run,
    heartbeat_run,
    read_context_artifact,
)
from sqlalchemy.orm import Session, sessionmaker

from fisheye_worker.dataset_preparation import (
    prepare_dataset,
)
from fisheye_worker.research_engine import (
    ResearchEvaluation,
    evaluate_prepared_frames,
)

logger = logging.getLogger(__name__)
LEASE_HEARTBEAT_INTERVAL_SECONDS = 60


def process_next_run(
    factory: sessionmaker[Session],
    *,
    artifact_root: Path | ArtifactStore,
    encryption_key: bytes,
    worker_id: str,
    heartbeat_interval_seconds: float = LEASE_HEARTBEAT_INTERVAL_SECONDS,
) -> bool:
    """Claim and process one run. Return whether a run was claimed."""
    with factory() as session:
        lease = claim_next_run(session, worker_id=worker_id)
    if lease is None:
        return False

    stopped = threading.Event()
    lease_lost = threading.Event()

    def heartbeat() -> None:
        while not stopped.wait(heartbeat_interval_seconds):
            try:
                with factory() as session:
                    renewed = heartbeat_run(
                        session, run_id=lease.run_id, lease_token=lease.lease_token
                    )
            except Exception:
                renewed = False
            if not renewed:
                lease_lost.set()
                return

    def assert_lease_active() -> None:
        if lease_lost.is_set():
            raise RuntimeError("Worker no longer owns this evaluation run lease.")

    heartbeat_thread = threading.Thread(
        target=heartbeat,
        name=f"fisheye-run-heartbeat-{lease.run_id}",
        daemon=True,
    )
    heartbeat_thread.start()
    try:
        result = execute_run(
            factory,
            lease,
            artifact_root=artifact_root,
            encryption_key=encryption_key,
            assert_lease_active=assert_lease_active,
        )
        assert_lease_active()
        with factory() as session:
            accepted = complete_run(
                session,
                run_id=lease.run_id,
                lease_token=lease.lease_token,
                metrics_json=result.metrics,
                result_artifact_uri=result.artifact_uri,
                result_manifest_sha256=result.manifest_sha256,
            )
        if not accepted:
            logger.warning("Run worker lost its lease before publishing completion.")
    except Exception:
        with factory() as session:
            fail_run(
                session,
                run_id=lease.run_id,
                lease_token=lease.lease_token,
                error_code="evaluation_processing_failed",
            )
        logger.error("A synthetic evaluation run failed; its state was recorded safely.")
    finally:
        stopped.set()
        heartbeat_thread.join(timeout=heartbeat_interval_seconds + 1)
    return True


def execute_run(
    factory: sessionmaker[Session],
    lease: RunLease,
    *,
    artifact_root: Path | ArtifactStore,
    encryption_key: bytes,
    assert_lease_active: Callable[[], None] = lambda: None,
) -> PublishedRunResult:
    """Prepare, validate, score and publish one immutable experimental run."""
    with factory() as session:
        prepared = prepare_dataset(session, lease.dataset_id, artifact_root, encryption_key)
        dataset = get_dataset(session, lease.dataset_id)
        if dataset is None or dataset.preparation_status != "prepared":
            raise RuntimeError("Dataset preparation did not complete.")
        events, partitions, labels = _load_prepared_frames(dataset, artifact_root, encryption_key)

    context_bytes = read_context_artifact(
        lease.context_artifact_uri,
        lease.context_sha256,
        artifact_root,
        encryption_key,
    )
    context = parse_synthetic_context(context_bytes)
    assert_lease_active()
    evaluation = evaluate_prepared_frames(events, partitions, labels, context)
    if evaluation.methodology_version != lease.methodology_version:
        raise RuntimeError("Run policy version changed after the run was queued.")
    if lease.config_sha256 != METHODOLOGY_CONFIG_SHA256:
        raise RuntimeError("Run policy configuration changed after the run was queued.")
    metrics = _serialize_evaluation(evaluation)
    scores = _scores_frame(evaluation)
    artifact_uri, manifest_sha256 = _publish_result_artifact(
        lease,
        dataset,
        prepared.analysis_manifest_sha256,
        scores,
        metrics,
        artifact_root,
        encryption_key,
        assert_lease_active,
    )
    return PublishedRunResult(metrics, artifact_uri, manifest_sha256)


def _load_prepared_frames(
    record: DatasetRecord,
    artifact_root: Path | ArtifactStore,
    encryption_key: bytes,
) -> tuple[pl.DataFrame, pl.DataFrame, pl.DataFrame]:
    if record.preparation_status != "prepared" or not record.analysis_artifact_uri:
        raise RuntimeError("Dataset analysis artifacts are unavailable.")
    store = as_artifact_store(artifact_root)
    prefix = record.analysis_artifact_uri
    cipher = _cipher(encryption_key)
    try:
        manifest_bytes = cipher.decrypt(store.read(f"{prefix}/manifest.json.enc"))
        if hashlib.sha256(manifest_bytes).hexdigest() != record.analysis_manifest_sha256:
            raise RuntimeError("Dataset analysis manifest failed its integrity check.")
        manifest = json.loads(manifest_bytes)
        if (
            manifest.get("dataset_id") != record.id
            or manifest.get("source_sha256") != record.sha256
        ):
            raise RuntimeError("Dataset analysis artifacts do not match their source dataset.")
        frames = []
        for name, field in (
            ("events.parquet.enc", "event_artifact_sha256"),
            ("partitions.parquet.enc", "partition_artifact_sha256"),
            ("labels.parquet.enc", "label_artifact_sha256"),
        ):
            content = cipher.decrypt(store.read(f"{prefix}/{name}"))
            if hashlib.sha256(content).hexdigest() != manifest.get(field):
                raise RuntimeError("Dataset analysis artifact failed its integrity check.")
            frames.append(pl.read_parquet(io.BytesIO(content)))
    except (OSError, InvalidToken, json.JSONDecodeError) as error:
        raise RuntimeError("Dataset analysis artifacts are missing or unreadable.") from error
    if len(frames) != 3:
        raise RuntimeError("Dataset analysis artifacts are incomplete.")
    return frames[0], frames[1], frames[2]


def _serialize_evaluation(evaluation: ResearchEvaluation) -> dict[str, object]:
    return {
        "methodology_version": evaluation.methodology_version,
        "evaluation_unit": evaluation.evaluation_unit,
        "calibration_unit_count": evaluation.calibration_unit_count,
        "evaluation_unit_count": evaluation.evaluation_unit_count,
        "claim_status": evaluation.claim_status,
        "comparisons": {
            "simple_rule": {
                "threshold": evaluation.simple_rule.threshold,
                "recall_gate_passed": evaluation.simple_rule.recall_gate_passed,
                "report": asdict(evaluation.simple_rule.report),
            },
            "tuned_rules": {
                "threshold": evaluation.tuned_rules.threshold,
                "recall_gate_passed": evaluation.tuned_rules.recall_gate_passed,
                "report": asdict(evaluation.tuned_rules.report),
            },
            "contextual": {
                "threshold": evaluation.contextual.threshold,
                "recall_gate_passed": evaluation.contextual.recall_gate_passed,
                "report": asdict(evaluation.contextual.report),
            },
        },
    }


def _scores_frame(evaluation: ResearchEvaluation) -> pl.DataFrame:
    rows: list[dict[str, object]] = []
    pairs = zip(evaluation.scores[::2], evaluation.scores[1::2], strict=True)
    for simple, contextual in pairs:
        rows.append(
            {
                "employee_id": simple.key.employee_id,
                "employee_day_utc": simple.key.day_utc,
                "simple_score": simple.score,
                "simple_severity": simple.severity,
                "simple_reason_codes": list(simple.reason_codes),
                "simple_evidence_event_ids": list(simple.evidence_event_ids),
                "tuned_score": simple.score,
                "tuned_severity": simple.severity,
                "tuned_reason_codes": list(simple.reason_codes),
                "tuned_evidence_event_ids": list(simple.evidence_event_ids),
                "contextual_score": contextual.score,
                "contextual_severity": contextual.severity,
                "contextual_reason_codes": list(contextual.reason_codes),
                "contextual_evidence_event_ids": list(contextual.evidence_event_ids),
            }
        )
    if not rows:
        raise ValueError("Research evaluation produced no held-out score rows.")
    return pl.DataFrame(rows).sort(["employee_id", "employee_day_utc"])


@dataclass(frozen=True)
class PublishedRunResult:
    metrics: dict[str, object]
    artifact_uri: str
    manifest_sha256: str


def _publish_result_artifact(
    lease: RunLease,
    dataset: DatasetRecord,
    analysis_manifest_sha256: str,
    scores: pl.DataFrame,
    metrics: dict[str, object],
    artifact_root: Path | ArtifactStore,
    encryption_key: bytes,
    assert_lease_active: Callable[[], None] = lambda: None,
) -> tuple[str, str]:
    assert_lease_active()
    result_bytes = _parquet_bytes(scores)
    result_sha256 = hashlib.sha256(result_bytes).hexdigest()
    metrics_bytes = json.dumps(metrics, sort_keys=True, separators=(",", ":")).encode()
    created_at = datetime.now(UTC)
    manifest = {
        "manifest_schema_version": "fisheye.evaluation-run-manifest.v1",
        "run_id": lease.run_id,
        "dataset_id": dataset.id,
        "dataset_sha256": dataset.sha256,
        "dataset_schema_version": dataset.schema_version,
        "analysis_manifest_sha256": analysis_manifest_sha256,
        "context_sha256": lease.context_sha256,
        "methodology_version": lease.methodology_version,
        "config_sha256": lease.config_sha256,
        "worker_build_revision": _worker_build_revision(),
        "evaluation_unit": "employee_day_utc",
        "ground_truth_usage": "calibration_threshold_selection_and_evaluation_metrics_only",
        "result_artifact": "scores.parquet.enc",
        "result_artifact_sha256": result_sha256,
        "result_row_count": scores.height,
        "metrics_sha256": hashlib.sha256(metrics_bytes).hexdigest(),
        "claim_status": "provisional_experiment; not_benchmarked",
        "completed_at": created_at.isoformat(),
    }
    manifest_bytes = (json.dumps(manifest, indent=2, sort_keys=True) + "\n").encode()
    relative_uri = (Path("runs") / lease.run_id / result_sha256 / "analysis").as_posix()
    store = as_artifact_store(artifact_root)
    manifest_uri = f"{relative_uri}/manifest.json.enc"
    scores_uri = f"{relative_uri}/scores.parquet.enc"
    if store.exists(manifest_uri):
        try:
            existing = _cipher(encryption_key).decrypt(store.read(manifest_uri))
            existing_manifest = json.loads(existing)
            if any(
                existing_manifest.get(key) != value
                for key, value in manifest.items()
                if key not in {"completed_at", "worker_build_revision"}
            ):
                raise RuntimeError("Existing run result artifacts do not match this run.")
            if not isinstance(existing_manifest.get("worker_build_revision"), str):
                raise RuntimeError("Existing run manifest is missing its worker revision.")
            existing_result = _cipher(encryption_key).decrypt(store.read(scores_uri))
            if hashlib.sha256(existing_result).hexdigest() != result_sha256:
                raise RuntimeError("Existing run scores failed their integrity check.")
            assert_lease_active()
            return relative_uri, hashlib.sha256(existing).hexdigest()
        except (OSError, json.JSONDecodeError, InvalidToken) as error:
            raise RuntimeError("Existing run result artifacts are unreadable.") from error
    cipher = _cipher(encryption_key)
    # Publish the immutable score object before the manifest commit marker.
    write_encrypted_immutable(
        store,
        scores_uri,
        result_bytes,
        encrypt=cipher.encrypt,
        decrypt=cipher.decrypt,
    )
    assert_lease_active()
    write_encrypted_immutable(
        store,
        manifest_uri,
        manifest_bytes,
        encrypt=cipher.encrypt,
        decrypt=cipher.decrypt,
    )
    # Verify through the same interface used by readers before marking the run complete.
    published = cipher.decrypt(store.read(manifest_uri))
    if hashlib.sha256(published).hexdigest() != hashlib.sha256(manifest_bytes).hexdigest():
        raise RuntimeError("Published run manifest failed its integrity check.")
    return relative_uri, hashlib.sha256(manifest_bytes).hexdigest()


def _worker_build_revision() -> str:
    configured = os.getenv("FISHEYE_CODE_REVISION")
    if configured:
        return configured

    digest = hashlib.sha256()
    source_packages = (
        ("worker", Path(__file__).resolve().parent),
        ("domain", Path(fisheye_domain.__file__).resolve().parent),
        ("evaluation", Path(fisheye_evaluation.__file__).resolve().parent),
        ("persistence", Path(fisheye_persistence.__file__).resolve().parent),
    )
    for package_name, package_root in source_packages:
        for source in sorted(package_root.rglob("*.py")):
            digest.update(
                f"{package_name}/{source.relative_to(package_root).as_posix()}\0".encode()
            )
            digest.update(source.read_bytes())

    repository_root = Path(__file__).resolve().parents[5]
    for relative_path in (
        "uv.lock",
        "apps/backend/worker/pyproject.toml",
        "apps/backend/packages/domain/pyproject.toml",
        "apps/backend/packages/evaluation/pyproject.toml",
        "apps/backend/packages/persistence/pyproject.toml",
    ):
        file_path = repository_root / relative_path
        if file_path.is_file():
            digest.update(f"{relative_path}\0".encode())
            digest.update(file_path.read_bytes())
    return f"source-tree-sha256:{digest.hexdigest()}"


def _parquet_bytes(frame: pl.DataFrame) -> bytes:
    output = io.BytesIO()
    frame.write_parquet(output, compression="zstd", statistics=True)
    return output.getvalue()


def _cipher(key: bytes) -> Fernet:
    try:
        return Fernet(key)
    except (TypeError, ValueError):
        raise RuntimeError("Run artifact encryption is not configured correctly.") from None
