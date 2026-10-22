"""FishEye API entrypoint; no live banking integrations in the MVP."""

import asyncio
import csv
import hashlib
import io
import json
import os
from datetime import UTC, datetime
from functools import lru_cache
from pathlib import Path
from typing import Annotated, Literal, cast
from urllib.parse import quote, unquote

import polars as pl
from cryptography.fernet import Fernet, InvalidToken
from fastapi import APIRouter, Depends, FastAPI, Header, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fisheye_domain.context import parse_synthetic_context
from fisheye_domain.csv_schema import SCHEMA_VERSION
from fisheye_evaluation.methodology import METHODOLOGY_CONFIG_SHA256, METHODOLOGY_VERSION
from fisheye_persistence.datasets import (
    DatasetRecord,
    create_session_factory,
    get_dataset,
    import_dataset,
    list_datasets,
    read_dataset_source,
)
from fisheye_persistence.reviews import (
    FindingReviewRecord,
    create_finding_review,
    list_finding_reviews,
)
from fisheye_persistence.runs import (
    EvaluationRunRecord,
    create_run,
    get_run,
    list_runs,
    store_context_artifact,
)
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, sessionmaker

from fisheye_api.auth import AnalystIdentity, require_analyst
from fisheye_api.csv_validation import CsvValidationResult, validate_events_csv

app = FastAPI(title="FishEye API", version="0.1.0")
api = APIRouter(dependencies=[Depends(require_analyst)])
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("FISHEYE_CORS_ORIGINS", "http://127.0.0.1:3000").split(","),
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "Idempotency-Key", "X-FishEye-Synthetic-Data-Confirmed"],
)

MAX_CSV_BYTES = 10 * 1024 * 1024


class HealthResponse(BaseModel):
    status: str
    synthetic_only: bool


class DatasetValidationResponse(BaseModel):
    valid: bool
    schema_version: str
    row_count: int
    employee_day_count: int
    errors: list[str]
    persisted: bool = False
    run_created: bool = False


class ApiErrorResponse(BaseModel):
    detail: str


class CsvImportValidationDetail(BaseModel):
    code: str
    errors: list[str]


class CsvImportValidationError(BaseModel):
    detail: CsvImportValidationDetail


class DatasetImportResponse(BaseModel):
    dataset_id: str
    status: str
    sha256: str
    manifest_sha256: str
    schema_version: str
    row_count: int
    employee_day_count: int
    created_at: str
    created: bool
    synthetic_only: bool = True
    run_created: bool = False
    risk_calculated: bool = False


class DatasetMetadataResponse(BaseModel):
    dataset_id: str
    status: str = "imported"
    sha256: str
    manifest_sha256: str
    schema_version: str
    row_count: int
    employee_day_count: int
    created_at: str
    preparation_status: str
    prepared_at: str | None = None
    analysis_manifest_sha256: str | None = None
    synthetic_only: bool = True
    evaluation_status: str = "not_run"
    ground_truth_usage: str = (
        "calibration_for_threshold_selection; evaluation_for_metrics; never_a_detector_feature"
    )
    run_created: bool = False
    risk_calculated: bool = False


class DatasetListResponse(BaseModel):
    items: list[DatasetMetadataResponse]
    limit: int
    offset: int
    total: int
    has_more: bool


class EvaluationRunCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    dataset_id: str = Field(min_length=1, max_length=36)
    synthetic_context: dict[str, object]


class EvaluationRunResponse(BaseModel):
    run_id: str
    dataset_id: str
    status: Literal["queued", "running", "completed", "failed"]
    methodology_version: str
    claim_status: str
    created_at: str
    started_at: str | None = None
    completed_at: str | None = None
    failed_at: str | None = None
    error_code: str | None = None
    metrics: dict[str, object] | None = None
    result_manifest_sha256: str | None = None
    synthetic_only: bool = True


class EvaluationRunManifestResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    manifest_schema_version: Literal["fisheye.evaluation-run-manifest.v1"]
    run_id: str
    dataset_id: str
    dataset_sha256: str
    dataset_schema_version: str
    analysis_manifest_sha256: str
    context_sha256: str
    methodology_version: str
    config_sha256: str
    worker_build_revision: str
    evaluation_unit: Literal["employee_day_utc"]
    ground_truth_usage: str
    result_artifact: Literal["scores.parquet.enc"]
    result_artifact_sha256: str
    result_row_count: int
    metrics_sha256: str
    claim_status: str
    completed_at: str


class EvaluationRunListResponse(BaseModel):
    items: list[EvaluationRunResponse]
    limit: int
    offset: int
    total: int
    has_more: bool


class RunFindingResponse(BaseModel):
    finding_id: str
    run_id: str
    employee_id: str
    employee_day_utc: str
    detector: Literal["simple_rule", "tuned_rules", "contextual"]
    score: int
    severity: str
    reason_codes: list[str]
    evidence_event_ids: list[str]


class RunFindingsResponse(BaseModel):
    items: list[RunFindingResponse]
    detector: Literal["simple_rule", "tuned_rules", "contextual"]
    limit: int
    offset: int
    total: int
    has_more: bool
    claim_status: str


class FindingReviewResponse(BaseModel):
    review_id: str
    decision: Literal["under_review", "reviewed_benign", "escalated"]
    note: str | None
    reviewer_label: str
    created_at: str


class FindingEvidenceEventResponse(BaseModel):
    event_id: str
    employee_id: str
    role_id: str
    department_id: str
    event_timestamp_utc: str
    event_type: str
    system: str
    device_id: str | None
    location_label: str | None
    record_count: int | None


class FindingDetailResponse(BaseModel):
    finding: RunFindingResponse
    events: list[FindingEvidenceEventResponse]
    reviews: list[FindingReviewResponse]


class FindingReviewCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    decision: Literal["under_review", "reviewed_benign", "escalated"]
    note: str | None = Field(default=None, max_length=1000)


@lru_cache(maxsize=4)
def _session_factory(database_url: str) -> sessionmaker[Session]:
    return create_session_factory(database_url)


@app.get("/health/live", response_model=HealthResponse)
def liveness() -> HealthResponse:
    return HealthResponse(status="ok", synthetic_only=True)


@api.post(
    "/api/v1/datasets/imports/validate",
    response_model=DatasetValidationResponse,
    responses={status_code: {"model": ApiErrorResponse} for status_code in (400, 413, 415, 503)},
    openapi_extra={
        "requestBody": {
            "required": True,
            "content": {
                "text/csv": {
                    "schema": {"type": "string", "format": "binary"},
                }
            },
        }
    },
)
async def validate_dataset_import(
    request: Request,
    synthetic_data_confirmed: str | None = Header(
        default=None,
        alias="X-FishEye-Synthetic-Data-Confirmed",
    ),
) -> DatasetValidationResponse:
    """Development-only schema check; this endpoint does not import or score data."""
    if (
        os.getenv("FISHEYE_ENV") != "development"
        or os.getenv("FISHEYE_ENABLE_DEV_CSV_VALIDATION") != "1"
    ):
        raise HTTPException(status_code=503, detail="CSV validation is not enabled on this API.")
    if synthetic_data_confirmed != "true":
        raise HTTPException(
            status_code=400,
            detail="Confirm that the file contains synthetic data before validation.",
        )
    if request.headers.get("content-type", "").split(";")[0].strip().lower() != "text/csv":
        raise HTTPException(
            status_code=415, detail="Upload a CSV file using Content-Type: text/csv."
        )

    content = await _read_csv_body(request)
    result = validate_events_csv(content)
    return DatasetValidationResponse(
        valid=result.valid,
        schema_version=result.schema_version,
        row_count=result.row_count,
        employee_day_count=result.employee_day_count,
        errors=list(result.errors),
    )


@api.post(
    "/api/v1/datasets/imports",
    response_model=DatasetImportResponse,
    status_code=201,
    responses={
        200: {"model": DatasetImportResponse},
        400: {"model": ApiErrorResponse},
        413: {"model": ApiErrorResponse},
        415: {"model": ApiErrorResponse},
        422: {"model": CsvImportValidationError},
        503: {"model": ApiErrorResponse},
    },
    openapi_extra={
        "requestBody": {
            "required": True,
            "content": {"text/csv": {"schema": {"type": "string", "format": "binary"}}},
        }
    },
)
async def import_synthetic_dataset(
    request: Request,
    response: Response,
    synthetic_data_confirmed: str | None = Header(
        default=None,
        alias="X-FishEye-Synthetic-Data-Confirmed",
    ),
) -> DatasetImportResponse:
    """Persist a validated synthetic CSV as an immutable dev-only dataset artifact."""
    if (
        os.getenv("FISHEYE_ENV") != "development"
        or os.getenv("FISHEYE_ENABLE_DEV_CSV_IMPORT") != "1"
    ):
        raise HTTPException(
            status_code=503,
            detail="Synthetic CSV import is not enabled on this API.",
        )
    if synthetic_data_confirmed != "true":
        raise HTTPException(
            status_code=400,
            detail="Confirm that the file contains synthetic data before import.",
        )

    content = await _read_csv_body(request)
    validation = validate_events_csv(content)
    if not validation.valid:
        raise HTTPException(
            status_code=422,
            detail={"code": "invalid_synthetic_csv", "errors": list(validation.errors)},
        )

    database_url = os.getenv("DATABASE_URL")
    artifact_root = os.getenv("FISHEYE_ARTIFACT_DIR")
    artifact_encryption_key = os.getenv("FISHEYE_ARTIFACT_ENCRYPTION_KEY")
    if not database_url or not artifact_root or not artifact_encryption_key:
        raise HTTPException(
            status_code=503,
            detail="Encrypted dataset storage is not configured for this development API.",
        )

    try:
        record, created = await asyncio.to_thread(
            _persist_dataset,
            database_url,
            Path(artifact_root),
            content,
            validation,
            artifact_encryption_key.encode("utf-8"),
        )
    except (OSError, RuntimeError, SQLAlchemyError):
        raise HTTPException(
            status_code=503,
            detail="Dataset storage failed. The upload was not reported as imported.",
        ) from None

    if not created:
        response.status_code = 200
    created_at = record.created_at
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=UTC)
    return DatasetImportResponse(
        dataset_id=record.id,
        status="imported",
        sha256=record.sha256,
        manifest_sha256=record.manifest_sha256,
        schema_version=record.schema_version,
        row_count=record.row_count,
        employee_day_count=record.employee_day_count,
        created_at=created_at.isoformat(),
        created=created,
    )


@api.get(
    "/api/v1/datasets",
    response_model=DatasetListResponse,
    responses={status_code: {"model": ApiErrorResponse} for status_code in (503,)},
)
def get_datasets(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0, le=1_000_000),
) -> DatasetListResponse:
    """Development-only, paginated listing of imported dataset metadata."""
    database_url = _require_dev_dataset_reads()
    try:
        factory = _session_factory(database_url)
        with factory() as session:
            records, total = list_datasets(session, limit=limit, offset=offset)
    except SQLAlchemyError:
        raise HTTPException(
            status_code=503,
            detail="Dataset metadata could not be read from development storage.",
        ) from None

    items = [_dataset_metadata(record) for record in records]
    return DatasetListResponse(
        items=items,
        limit=limit,
        offset=offset,
        total=total,
        has_more=offset + len(items) < total,
    )


@api.get(
    "/api/v1/datasets/{dataset_id}",
    response_model=DatasetMetadataResponse,
    responses={status_code: {"model": ApiErrorResponse} for status_code in (404, 503)},
)
def get_dataset_metadata(dataset_id: str) -> DatasetMetadataResponse:
    """Development-only read of one dataset's provenance metadata."""
    database_url = _require_dev_dataset_reads()
    try:
        factory = _session_factory(database_url)
        with factory() as session:
            record = get_dataset(session, dataset_id)
    except SQLAlchemyError:
        raise HTTPException(
            status_code=503,
            detail="Dataset metadata could not be read from development storage.",
        ) from None
    if record is None:
        raise HTTPException(status_code=404, detail="Dataset was not found.")
    return _dataset_metadata(record)


@api.post(
    "/api/v1/runs",
    response_model=EvaluationRunResponse,
    status_code=202,
    responses={
        status_code: {"model": ApiErrorResponse} for status_code in (400, 404, 409, 422, 503)
    },
)
def create_evaluation_run(
    body: EvaluationRunCreateRequest,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
) -> EvaluationRunResponse:
    """Queue a development-only synthetic evaluation for a prepared-schema dataset."""
    database_url, artifact_root, encryption_key = _require_dev_evaluation_runs()
    if not idempotency_key or len(idempotency_key) > 128 or not idempotency_key.strip():
        raise HTTPException(status_code=400, detail="A valid Idempotency-Key header is required.")

    context_bytes = json.dumps(
        body.synthetic_context, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")
    try:
        parse_synthetic_context(context_bytes)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from None
    request_bytes = json.dumps(
        {
            "dataset_id": body.dataset_id,
            "synthetic_context": json.loads(context_bytes),
            "methodology_version": METHODOLOGY_VERSION,
            "config_sha256": METHODOLOGY_CONFIG_SHA256,
        },
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    request_sha256 = hashlib.sha256(request_bytes).hexdigest()

    try:
        factory = _session_factory(database_url)
        with factory() as session:
            dataset = get_dataset(session, body.dataset_id)
            if dataset is None:
                raise HTTPException(status_code=404, detail="Dataset was not found.")
            if dataset.schema_version != SCHEMA_VERSION:
                raise HTTPException(
                    status_code=422,
                    detail=(
                        "Evaluation runs require a v2 dataset with baseline, calibration, "
                        "and evaluation partitions."
                    ),
                )
            context_uri, context_sha256 = store_context_artifact(
                context_bytes, artifact_root, encryption_key
            )
            record, _ = create_run(
                session,
                dataset=dataset,
                idempotency_key=idempotency_key.strip(),
                request_sha256=request_sha256,
                context_artifact_uri=context_uri,
                context_sha256=context_sha256,
                methodology_version=METHODOLOGY_VERSION,
                config_sha256=METHODOLOGY_CONFIG_SHA256,
            )
    except HTTPException:
        raise
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from None
    except (OSError, RuntimeError, SQLAlchemyError):
        raise HTTPException(
            status_code=503,
            detail="The evaluation run could not be queued in development storage.",
        ) from None

    return _evaluation_run_response(record)


@api.get("/api/v1/runs", response_model=EvaluationRunListResponse)
def get_evaluation_runs(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0, le=1_000_000),
) -> EvaluationRunListResponse:
    database_url, _, _ = _require_dev_evaluation_runs()
    try:
        factory = _session_factory(database_url)
        with factory() as session:
            records, total = list_runs(session, limit=limit, offset=offset)
    except SQLAlchemyError:
        raise HTTPException(status_code=503, detail="Evaluation runs could not be read.") from None
    items = [_evaluation_run_response(record) for record in records]
    return EvaluationRunListResponse(
        items=items,
        limit=limit,
        offset=offset,
        total=total,
        has_more=offset + len(items) < total,
    )


@api.get(
    "/api/v1/runs/{run_id}",
    response_model=EvaluationRunResponse,
    responses={status_code: {"model": ApiErrorResponse} for status_code in (404, 503)},
)
def get_evaluation_run(run_id: str) -> EvaluationRunResponse:
    database_url, _, _ = _require_dev_evaluation_runs()
    try:
        factory = _session_factory(database_url)
        with factory() as session:
            record = get_run(session, run_id)
    except SQLAlchemyError:
        raise HTTPException(status_code=503, detail="Evaluation run could not be read.") from None
    if record is None:
        raise HTTPException(status_code=404, detail="Evaluation run was not found.")
    return _evaluation_run_response(record)


@api.get(
    "/api/v1/runs/{run_id}/manifest",
    response_model=EvaluationRunManifestResponse,
    responses={status_code: {"model": ApiErrorResponse} for status_code in (404, 409, 503)},
)
def download_evaluation_manifest(run_id: str) -> Response:
    """Download verified provenance for a completed development evaluation."""
    database_url, artifact_root, encryption_key = _require_dev_evaluation_runs()
    try:
        factory = _session_factory(database_url)
        with factory() as session:
            record = get_run(session, run_id)
    except SQLAlchemyError:
        raise HTTPException(status_code=503, detail="Evaluation run could not be read.") from None
    if record is None:
        raise HTTPException(status_code=404, detail="Evaluation run was not found.")
    if record.status != "completed" or not record.result_artifact_uri:
        raise HTTPException(
            status_code=409,
            detail="The evaluation manifest is available after a run completes.",
        )
    try:
        manifest_bytes = _read_run_manifest(
            record.result_artifact_uri,
            record.result_manifest_sha256 or "",
            run_id,
            artifact_root,
            encryption_key,
        )
    except (OSError, RuntimeError, ValueError):
        raise HTTPException(
            status_code=503, detail="The evaluation manifest could not be verified."
        ) from None
    return Response(
        content=manifest_bytes,
        media_type="application/json",
        headers={
            "Content-Disposition": f'attachment; filename="fisheye-run-{run_id}-manifest.json"'
        },
    )


@api.get("/api/v1/runs/{run_id}/findings", response_model=RunFindingsResponse)
def get_evaluation_findings(
    run_id: str,
    detector: Literal["simple_rule", "tuned_rules", "contextual"] = "contextual",
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0, le=1_000_000),
) -> RunFindingsResponse:
    database_url, artifact_root, encryption_key = _require_dev_evaluation_runs()
    try:
        factory = _session_factory(database_url)
        with factory() as session:
            record = get_run(session, run_id)
    except SQLAlchemyError:
        raise HTTPException(status_code=503, detail="Evaluation run could not be read.") from None
    if record is None:
        raise HTTPException(status_code=404, detail="Evaluation run was not found.")
    if record.status != "completed" or not record.result_artifact_uri:
        raise HTTPException(status_code=409, detail="Findings are available after a run completes.")
    try:
        frame = _read_findings_frame(
            record.result_artifact_uri,
            record.result_manifest_sha256 or "",
            artifact_root,
            encryption_key,
        )
    except (OSError, RuntimeError, ValueError):
        raise HTTPException(
            status_code=503, detail="Run findings could not be read safely."
        ) from None

    metrics = record.metrics_json or {}
    comparisons = metrics.get("comparisons", {})
    detector_result = comparisons.get(detector, {}) if isinstance(comparisons, dict) else {}
    threshold = detector_result.get("threshold") if isinstance(detector_result, dict) else None
    if not isinstance(threshold, (int, float)):
        raise HTTPException(status_code=503, detail="Run detector metadata is incomplete.")
    if detector == "simple_rule":
        score_column = "simple_score"
    elif detector == "tuned_rules":
        score_column = "tuned_score"
    else:
        score_column = "contextual_score"
    severity_column = score_column.removesuffix("_score") + "_severity"
    reasons_column = score_column.removesuffix("_score") + "_reason_codes"
    evidence_column = score_column.removesuffix("_score") + "_evidence_event_ids"
    selected = frame.filter(pl.col(score_column) >= threshold)
    total = selected.height
    page = selected.slice(offset, limit).to_dicts()
    items = [
        RunFindingResponse(
            finding_id=_finding_id(
                run_id, detector, row["employee_id"], row["employee_day_utc"].isoformat()
            ),
            run_id=run_id,
            employee_id=row["employee_id"],
            employee_day_utc=row["employee_day_utc"].isoformat(),
            detector=detector,
            score=row[score_column],
            severity=row[severity_column],
            reason_codes=row[reasons_column],
            evidence_event_ids=row[evidence_column],
        )
        for row in page
    ]
    return RunFindingsResponse(
        items=items,
        detector=detector,
        limit=limit,
        offset=offset,
        total=total,
        has_more=offset + len(items) < total,
        claim_status=str(metrics.get("claim_status", "provisional_experiment; not_benchmarked")),
    )


@api.get(
    "/api/v1/runs/{run_id}/findings/{finding_id}",
    response_model=FindingDetailResponse,
    responses={status_code: {"model": ApiErrorResponse} for status_code in (404, 409, 503)},
)
def get_finding_detail(run_id: str, finding_id: str) -> FindingDetailResponse:
    """Read a stored finding and only the synthetic source events it references."""
    database_url, artifact_root, encryption_key = _require_dev_evaluation_runs()
    record, dataset = _get_run_and_dataset(run_id, database_url)
    finding = _resolve_stored_finding(
        record, finding_id, artifact_root=artifact_root, encryption_key=encryption_key
    )
    events = _read_finding_events(dataset, finding, artifact_root, encryption_key)
    try:
        factory = _session_factory(database_url)
        with factory() as session:
            reviews = list_finding_reviews(session, run_id=run_id, finding_id=finding_id)
    except SQLAlchemyError:
        raise HTTPException(status_code=503, detail="Finding reviews could not be read.") from None
    return FindingDetailResponse(
        finding=finding,
        events=events,
        reviews=[_finding_review_response(review) for review in reviews],
    )


@api.post(
    "/api/v1/runs/{run_id}/findings/{finding_id}/reviews",
    response_model=FindingReviewResponse,
    status_code=201,
    responses={status_code: {"model": ApiErrorResponse} for status_code in (404, 409, 503)},
)
def record_finding_review(
    run_id: str,
    finding_id: str,
    body: FindingReviewCreateRequest,
    analyst: Annotated[AnalystIdentity, Depends(require_analyst)],
) -> FindingReviewResponse:
    """Append a review attributed to the verified analyst subject or local dev actor."""
    database_url, artifact_root, encryption_key = _require_dev_evaluation_runs()
    record, _ = _get_run_and_dataset(run_id, database_url)
    _resolve_stored_finding(
        record, finding_id, artifact_root=artifact_root, encryption_key=encryption_key
    )
    try:
        factory = _session_factory(database_url)
        with factory() as session:
            review = create_finding_review(
                session,
                run_id=run_id,
                finding_id=finding_id,
                decision=body.decision,
                note=body.note.strip() if body.note and body.note.strip() else None,
                reviewer_label=analyst.subject,
            )
    except SQLAlchemyError:
        raise HTTPException(status_code=503, detail="Finding review could not be saved.") from None
    return _finding_review_response(review)


app.include_router(api)


def _get_run_and_dataset(
    run_id: str, database_url: str
) -> tuple[EvaluationRunRecord, DatasetRecord]:
    try:
        factory = _session_factory(database_url)
        with factory() as session:
            record = get_run(session, run_id)
            dataset = get_dataset(session, record.dataset_id) if record else None
    except SQLAlchemyError:
        raise HTTPException(status_code=503, detail="Evaluation run could not be read.") from None
    if record is None or dataset is None:
        raise HTTPException(status_code=404, detail="Evaluation run was not found.")
    if record.status != "completed" or not record.result_artifact_uri:
        raise HTTPException(status_code=409, detail="Findings are available after a run completes.")
    return record, dataset


def _resolve_stored_finding(
    record: EvaluationRunRecord,
    finding_id: str,
    *,
    artifact_root: Path,
    encryption_key: bytes,
) -> RunFindingResponse:
    parts = finding_id.split(":", 3)
    if len(parts) != 4 or parts[0] != record.id:
        raise HTTPException(status_code=404, detail="Finding was not found in this run.")
    _, detector, encoded_employee_id, day = parts
    employee_id = unquote(encoded_employee_id)
    if detector not in {"simple_rule", "tuned_rules", "contextual"}:
        raise HTTPException(status_code=404, detail="Finding was not found in this run.")
    try:
        target_day = datetime.strptime(day, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=404, detail="Finding was not found in this run.") from None
    if not record.result_artifact_uri:
        raise HTTPException(status_code=409, detail="Findings are available after a run completes.")
    try:
        frame = _read_findings_frame(
            record.result_artifact_uri,
            record.result_manifest_sha256 or "",
            artifact_root,
            encryption_key,
        )
    except (OSError, RuntimeError, ValueError):
        raise HTTPException(
            status_code=503, detail="Run findings could not be read safely."
        ) from None
    metrics = record.metrics_json or {}
    comparisons = metrics.get("comparisons", {})
    detector_result = comparisons.get(detector, {}) if isinstance(comparisons, dict) else {}
    threshold = detector_result.get("threshold") if isinstance(detector_result, dict) else None
    if not isinstance(threshold, (int, float)):
        raise HTTPException(status_code=503, detail="Run detector metadata is incomplete.")
    score_column = {
        "simple_rule": "simple_score",
        "tuned_rules": "tuned_score",
        "contextual": "contextual_score",
    }[detector]
    selected = frame.filter(
        (pl.col(score_column) >= threshold)
        & (pl.col("employee_id") == employee_id)
        & (pl.col("employee_day_utc").cast(pl.String) == day)
    )
    if selected.is_empty():
        raise HTTPException(status_code=404, detail="Finding was not found in this run.")
    row = selected.row(0, named=True)
    stem = score_column.removesuffix("_score")
    return RunFindingResponse(
        finding_id=finding_id,
        run_id=record.id,
        employee_id=employee_id,
        employee_day_utc=target_day.isoformat(),
        detector=detector,  # type: ignore[arg-type]
        score=row[score_column],
        severity=row[f"{stem}_severity"],
        reason_codes=row[f"{stem}_reason_codes"],
        evidence_event_ids=row[f"{stem}_evidence_event_ids"],
    )


def _finding_id(run_id: str, detector: str, employee_id: str, day: str) -> str:
    """Encode employee IDs so reserved delimiters cannot corrupt finding identity."""
    return f"{run_id}:{detector}:{quote(employee_id, safe='')}:{day}"


def _read_finding_events(
    dataset: DatasetRecord,
    finding: RunFindingResponse,
    artifact_root: Path,
    encryption_key: bytes,
) -> list[FindingEvidenceEventResponse]:
    try:
        source = read_dataset_source(dataset, artifact_root, encryption_key).decode("utf-8-sig")
        wanted = set(finding.evidence_event_ids)
        events = []
        for row in csv.DictReader(io.StringIO(source)):
            if row.get("event_id") not in wanted:
                continue
            events.append(
                FindingEvidenceEventResponse(
                    event_id=row["event_id"],
                    employee_id=row["employee_id"],
                    role_id=row["role_id"],
                    department_id=row["department_id"],
                    event_timestamp_utc=row["event_timestamp_utc"],
                    event_type=row["event_type"],
                    system=row["system"],
                    device_id=row.get("device_id") or None,
                    location_label=row.get("location_label") or None,
                    record_count=int(row["record_count"]) if row.get("record_count") else None,
                )
            )
    except (OSError, RuntimeError, InvalidToken, UnicodeDecodeError, KeyError, ValueError):
        raise HTTPException(
            status_code=503, detail="Finding evidence could not be read safely."
        ) from None
    if len(events) != len(wanted):
        raise HTTPException(status_code=503, detail="Finding evidence failed its integrity check.")
    return sorted(events, key=lambda event: (event.event_timestamp_utc, event.event_id))


def _finding_review_response(record: FindingReviewRecord) -> FindingReviewResponse:
    created_at = record.created_at
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=UTC)
    return FindingReviewResponse(
        review_id=record.id,
        decision=record.decision,  # type: ignore[arg-type]
        note=record.note,
        reviewer_label=record.reviewer_label,
        created_at=created_at.isoformat(),
    )


def _require_dev_dataset_reads() -> str:
    if (
        os.getenv("FISHEYE_ENV") != "development"
        or os.getenv("FISHEYE_ENABLE_DEV_DATASET_READS") != "1"
    ):
        raise HTTPException(
            status_code=503,
            detail="Dataset reads are not enabled on this development API.",
        )
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise HTTPException(
            status_code=503,
            detail="Dataset metadata storage is not configured for this development API.",
        )
    return database_url


def _dataset_metadata(record: DatasetRecord) -> DatasetMetadataResponse:
    created_at = record.created_at
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=UTC)
    return DatasetMetadataResponse(
        dataset_id=record.id,
        sha256=record.sha256,
        manifest_sha256=record.manifest_sha256,
        schema_version=record.schema_version,
        row_count=record.row_count,
        employee_day_count=record.employee_day_count,
        created_at=created_at.isoformat(),
        preparation_status=record.preparation_status,
        prepared_at=(record.prepared_at.isoformat() if record.prepared_at is not None else None),
        analysis_manifest_sha256=record.analysis_manifest_sha256,
        ground_truth_usage=(
            "calibration_for_threshold_selection; evaluation_for_metrics; never_a_detector_feature"
            if record.schema_version == SCHEMA_VERSION
            else "evaluation_only"
        ),
    )


def _require_dev_evaluation_runs() -> tuple[str, Path, bytes]:
    if (
        os.getenv("FISHEYE_ENV") != "development"
        or os.getenv("FISHEYE_ENABLE_DEV_EVALUATION_RUNS") != "1"
    ):
        raise HTTPException(
            status_code=503,
            detail="Evaluation runs are not enabled on this development API.",
        )
    database_url = os.getenv("DATABASE_URL")
    artifact_root = os.getenv("FISHEYE_ARTIFACT_DIR")
    encryption_key = os.getenv("FISHEYE_ARTIFACT_ENCRYPTION_KEY")
    if not database_url or not artifact_root or not encryption_key:
        raise HTTPException(
            status_code=503,
            detail="Database and encrypted artifact storage are required for development runs.",
        )
    try:
        Fernet(encryption_key.encode("utf-8"))
    except (TypeError, ValueError):
        raise HTTPException(
            status_code=503,
            detail="Run artifact encryption is not configured correctly.",
        ) from None
    return database_url, Path(artifact_root), encryption_key.encode("utf-8")


def _evaluation_run_response(record: EvaluationRunRecord) -> EvaluationRunResponse:
    return EvaluationRunResponse(
        run_id=record.id,
        dataset_id=record.dataset_id,
        status=cast(Literal["queued", "running", "completed", "failed"], record.status),
        methodology_version=record.methodology_version,
        claim_status=str(
            (record.metrics_json or {}).get(
                "claim_status", "provisional_experiment; not_benchmarked"
            )
        ),
        created_at=_iso_utc(record.created_at),
        started_at=_iso_utc(record.started_at) if record.started_at else None,
        completed_at=_iso_utc(record.completed_at) if record.completed_at else None,
        failed_at=_iso_utc(record.failed_at) if record.failed_at else None,
        error_code=record.error_code,
        metrics=record.metrics_json,
        result_manifest_sha256=record.result_manifest_sha256,
    )


def _iso_utc(value: datetime) -> str:
    normalized = value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)
    return normalized.isoformat()


def _read_findings_frame(
    relative_uri: str,
    expected_manifest_sha256: str,
    artifact_root: Path,
    encryption_key: bytes,
) -> pl.DataFrame:
    directory = (artifact_root / relative_uri).resolve()
    try:
        directory.relative_to(artifact_root.resolve())
    except ValueError:
        raise RuntimeError("A run artifact path is invalid.") from None
    try:
        cipher = Fernet(encryption_key)
        manifest_bytes = cipher.decrypt((directory / "manifest.json.enc").read_bytes())
        if hashlib.sha256(manifest_bytes).hexdigest() != expected_manifest_sha256:
            raise RuntimeError("Run manifest failed its integrity check.")
        manifest = json.loads(manifest_bytes)
        result_bytes = cipher.decrypt((directory / "scores.parquet.enc").read_bytes())
        if hashlib.sha256(result_bytes).hexdigest() != manifest.get("result_artifact_sha256"):
            raise RuntimeError("Run findings failed their integrity check.")
        return pl.read_parquet(io.BytesIO(result_bytes))
    except (OSError, InvalidToken, json.JSONDecodeError) as error:
        raise RuntimeError("Run findings are unavailable or unreadable.") from error


def _read_run_manifest(
    relative_uri: str,
    expected_manifest_sha256: str,
    run_id: str,
    artifact_root: Path,
    encryption_key: bytes,
) -> bytes:
    directory = (artifact_root / relative_uri).resolve()
    try:
        directory.relative_to(artifact_root.resolve())
    except ValueError:
        raise RuntimeError("A run artifact path is invalid.") from None
    try:
        manifest_bytes = Fernet(encryption_key).decrypt(
            (directory / "manifest.json.enc").read_bytes()
        )
        if hashlib.sha256(manifest_bytes).hexdigest() != expected_manifest_sha256:
            raise RuntimeError("Run manifest failed its integrity check.")
        manifest = json.loads(manifest_bytes)
        if not isinstance(manifest, dict):
            raise RuntimeError("Run manifest does not match the requested evaluation.")
        parsed_manifest = EvaluationRunManifestResponse.model_validate(manifest)
        if parsed_manifest.run_id != run_id:
            raise RuntimeError("Run manifest does not match the requested evaluation.")
        return manifest_bytes
    except ValueError as error:
        raise RuntimeError("Run manifest does not match its documented schema.") from error
    except (OSError, InvalidToken, json.JSONDecodeError) as error:
        raise RuntimeError("Run manifest is unavailable or unreadable.") from error


async def _read_csv_body(request: Request) -> bytes:
    if request.headers.get("content-type", "").split(";")[0].strip().lower() != "text/csv":
        raise HTTPException(
            status_code=415,
            detail="Upload a CSV file using Content-Type: text/csv.",
        )

    chunks: list[bytes] = []
    size = 0
    async for chunk in request.stream():
        size += len(chunk)
        if size > MAX_CSV_BYTES:
            raise HTTPException(status_code=413, detail="CSV exceeds the 10 MiB development limit.")
        chunks.append(chunk)
    return b"".join(chunks)


def _persist_dataset(
    database_url: str,
    artifact_root: Path,
    content: bytes,
    validation: CsvValidationResult,
    artifact_encryption_key: bytes,
) -> tuple[DatasetRecord, bool]:
    factory = _session_factory(database_url)
    with factory() as session:
        return import_dataset(
            session,
            content,
            validation.schema_version,
            validation.row_count,
            validation.employee_day_count,
            artifact_root,
            artifact_encryption_key,
        )
