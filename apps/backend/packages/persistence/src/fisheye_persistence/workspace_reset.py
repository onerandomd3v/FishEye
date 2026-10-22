"""Explicit reset operations for a local synthetic workspace."""

from __future__ import annotations

import shutil
from dataclasses import dataclass
from pathlib import Path
from uuid import uuid4

from sqlalchemy import delete, func, select, text
from sqlalchemy.orm import Session

from fisheye_persistence.datasets import DatasetRecord
from fisheye_persistence.reviews import FindingReviewRecord
from fisheye_persistence.runs import EvaluationRunRecord


class ActiveEvaluationRunsError(RuntimeError):
    """Raised when a reset could interrupt queued or running evaluations."""


@dataclass(frozen=True)
class WorkspaceCounts:
    runs: int
    datasets: int
    reviews: int
    active_runs: int


@dataclass(frozen=True)
class WorkspaceResetResult:
    counts: WorkspaceCounts
    artifacts_removed: bool


def workspace_counts(session: Session) -> WorkspaceCounts:
    runs = session.scalars(select(EvaluationRunRecord)).all()
    datasets = session.scalars(select(DatasetRecord)).all()
    reviews = session.scalar(select(func.count()).select_from(FindingReviewRecord)) or 0
    active_runs = sum(run.status in {"queued", "running"} for run in runs)
    return WorkspaceCounts(
        runs=len(runs),
        datasets=len(datasets),
        reviews=reviews,
        active_runs=active_runs,
    )


def reset_workspace(session: Session, artifact_root: Path) -> WorkspaceResetResult:
    """Remove all run, review, dataset and referenced artifact data atomically."""
    root = artifact_root.resolve()
    dialect_name = session.get_bind().dialect.name
    if dialect_name == "sqlite":
        session.connection().exec_driver_sql("BEGIN IMMEDIATE")
    elif dialect_name == "postgresql":
        session.execute(
            text(
                "LOCK TABLE datasets, evaluation_runs, finding_reviews IN SHARE ROW EXCLUSIVE MODE"
            )
        )
    datasets = list(session.scalars(select(DatasetRecord).with_for_update()).all())
    runs = list(session.scalars(select(EvaluationRunRecord).with_for_update()).all())
    if any(run.status in {"queued", "running"} for run in runs):
        raise ActiveEvaluationRunsError(
            "Wait for all evaluations to finish before clearing the workspace."
        )

    review_count = session.scalar(select(func.count()).select_from(FindingReviewRecord)) or 0
    paths = _artifact_paths(root, runs, datasets)
    quarantine = root / f".workspace-reset-{uuid4()}"
    moved: list[tuple[Path, Path]] = []
    try:
        for original in paths:
            if not original.exists():
                continue
            relative = original.relative_to(root)
            quarantined = quarantine / relative
            quarantined.parent.mkdir(parents=True, exist_ok=True)
            original.parent.mkdir(parents=True, exist_ok=True)
            original.replace(quarantined)
            moved.append((original, quarantined))

        session.execute(delete(FindingReviewRecord))
        session.execute(delete(EvaluationRunRecord))
        session.execute(delete(DatasetRecord))
        session.commit()
    except BaseException as error:
        try:
            session.rollback()
        except BaseException as rollback_error:
            error.add_note(f"Workspace reset rollback failed: {rollback_error}")

        restore_failed = False
        for original, quarantined in reversed(moved):
            if quarantined.exists():
                try:
                    original.parent.mkdir(parents=True, exist_ok=True)
                    quarantined.replace(original)
                except OSError as restore_error:
                    restore_failed = True
                    error.add_note(
                        f"Could not restore {original} from {quarantined}: {restore_error}"
                    )
        if quarantine.exists() and not restore_failed:
            shutil.rmtree(quarantine, ignore_errors=True)
        raise

    artifacts_removed = True
    if quarantine.exists():
        try:
            shutil.rmtree(quarantine)
        except OSError:
            artifacts_removed = False
    return WorkspaceResetResult(
        counts=WorkspaceCounts(
            runs=len(runs),
            datasets=len(datasets),
            reviews=review_count,
            active_runs=0,
        ),
        artifacts_removed=artifacts_removed,
    )


def _artifact_paths(
    root: Path,
    runs: list[EvaluationRunRecord],
    datasets: list[DatasetRecord],
) -> list[Path]:
    paths: set[Path] = set()
    for run in runs:
        if run.context_artifact_uri:
            paths.add(_checked_path(root, run.context_artifact_uri, "run-inputs"))
        if run.result_artifact_uri:
            result = _checked_path(root, run.result_artifact_uri, "runs")
            relative = result.relative_to(root)
            if len(relative.parts) < 3 or relative.parts[1] != run.id:
                raise RuntimeError("A run artifact path does not match its run record.")
            paths.add(root / "runs" / run.id)
    for dataset in datasets:
        source = _checked_path(root, dataset.artifact_uri, "datasets")
        relative = source.relative_to(root)
        if len(relative.parts) != 4 or relative.parts[-1] != "source.csv.enc":
            raise RuntimeError("A dataset artifact path is invalid.")
        paths.add(source.parent)

    # Keep only the shallowest paths; moving a directory already includes its files.
    shallowest: list[Path] = []
    for path in sorted(paths, key=lambda item: len(item.parts)):
        if not any(path.is_relative_to(parent) for parent in shallowest):
            shallowest.append(path)
    return shallowest


def _checked_path(root: Path, relative_uri: str, expected_prefix: str) -> Path:
    path = (root / relative_uri).resolve()
    try:
        relative = path.relative_to(root)
    except ValueError:
        raise RuntimeError("An artifact path is outside the configured storage root.") from None
    if not relative.parts or relative.parts[0] != expected_prefix:
        raise RuntimeError("An artifact path is outside its expected storage area.")
    return path
