"""FishEye API entrypoint; no live banking integrations in the MVP."""

import os

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from fisheye_api.csv_validation import validate_events_csv

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

    chunks: list[bytes] = []
    size = 0
    async for chunk in request.stream():
        size += len(chunk)
        if size > MAX_CSV_BYTES:
            raise HTTPException(status_code=413, detail="CSV exceeds the 10 MiB development limit.")
        chunks.append(chunk)

    result = validate_events_csv(b"".join(chunks))
    return DatasetValidationResponse(
        valid=result.valid,
        schema_version=result.schema_version,
        row_count=result.row_count,
        employee_day_count=result.employee_day_count,
        errors=list(result.errors),
    )
