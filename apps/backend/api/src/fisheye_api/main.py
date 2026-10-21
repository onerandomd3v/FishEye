"""FishEye API entrypoint; no live banking integrations in the MVP."""

import asyncio
import os
from datetime import UTC
from functools import lru_cache
from pathlib import Path

from fastapi import FastAPI, Header, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fisheye_persistence.datasets import DatasetRecord, create_session_factory, import_dataset
from pydantic import BaseModel
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, sessionmaker

from fisheye_api.csv_validation import CsvValidationResult, validate_events_csv

app = FastAPI(title="FishEye API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("FISHEYE_CORS_ORIGINS", "http://127.0.0.1:3000").split(","),
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "X-FishEye-Synthetic-Data-Confirmed"],
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


@lru_cache(maxsize=4)
def _session_factory(database_url: str) -> sessionmaker[Session]:
    return create_session_factory(database_url)


@app.get("/health/live", response_model=HealthResponse)
def liveness() -> HealthResponse:
    return HealthResponse(status="ok", synthetic_only=True)


@app.post(
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


@app.post(
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
