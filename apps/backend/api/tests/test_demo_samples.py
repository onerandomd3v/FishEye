import csv
from pathlib import Path

from fisheye_domain.context import parse_synthetic_context
from fisheye_domain.csv_validation import validate_events_csv

REPO_ROOT = Path(__file__).parents[4]
SAMPLE_ROOT = REPO_ROOT / "apps/web/console/public/demo-samples"


def test_bundled_synthetic_samples_match_the_import_contract() -> None:
    for stem in ("approved-overtime", "unfamiliar-access"):
        csv_path = SAMPLE_ROOT / f"{stem}-events-v2.csv"
        context_path = SAMPLE_ROOT / f"{stem}-context-v1.json"
        content = csv_path.read_bytes()
        result = validate_events_csv(content)
        context = parse_synthetic_context(context_path.read_bytes())

        assert result.valid, result.errors
        assert result.schema_version == "fisheye.events.v2"
        with csv_path.open(newline="", encoding="utf-8") as sample:
            rows = list(csv.DictReader(sample))
            assert {row["employee_id"] for row in rows} == set(context.employee_schedules)
            assert {row["role_id"] for row in rows} == set(context.roles)
        assert context.schema_version == "fisheye.context.v1"
