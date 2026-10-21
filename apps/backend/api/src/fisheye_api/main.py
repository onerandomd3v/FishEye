"""FishEye API entrypoint; no live banking integrations in the MVP."""
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="FishEye API", version="0.1.0")


class HealthResponse(BaseModel):
    status: str
    synthetic_only: bool


@app.get("/health/live", response_model=HealthResponse)
def liveness() -> HealthResponse:
    return HealthResponse(status="ok", synthetic_only=True)
