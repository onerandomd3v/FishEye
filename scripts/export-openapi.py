"""Export the FastAPI OpenAPI document consumed by the generated web client."""

import json
from pathlib import Path

from fisheye_api.main import app


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
OUTPUT_PATH = REPOSITORY_ROOT / "packages/api-client/openapi.json"

OUTPUT_PATH.write_text(json.dumps(app.openapi(), indent=2) + "\n", encoding="utf-8")
print(f"Wrote {OUTPUT_PATH.relative_to(REPOSITORY_ROOT)}")
