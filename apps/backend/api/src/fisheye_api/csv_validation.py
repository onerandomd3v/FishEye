"""Validation for the version 1 synthetic access-event CSV format.

This module deliberately validates structure only. It does not attempt to prove
that a supplied dataset is synthetic and it never persists or scores events.
"""

import csv
import io
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime

SCHEMA_VERSION = "fisheye.events.v1"
CSV_HEADERS = (
    "event_id",
    "employee_id",
    "role_id",
    "department_id",
    "event_timestamp_utc",
    "event_type",
    "system",
    "device_id",
    "location_label",
    "record_count",
    "dataset_partition",
    "ground_truth_label",
)
EVENT_TYPES = {
    "sign_in",
    "failed_sign_in",
    "record_read",
    "record_export",
    "permission_change",
}
PARTITIONS = {"baseline", "evaluation"}
GROUND_TRUTH_LABELS = {"threat_scenario", "benign_scenario"}
MAX_CSV_ROWS = 100_000
REQUIRED_VALUES = (
    "event_id",
    "employee_id",
    "role_id",
    "department_id",
    "event_timestamp_utc",
    "event_type",
    "system",
    "dataset_partition",
)


@dataclass(frozen=True)
class CsvValidationResult:
    valid: bool
    schema_version: str
    row_count: int
    employee_day_count: int
    errors: tuple[str, ...]


def validate_events_csv(content: bytes) -> CsvValidationResult:
    """Validate CSV bytes without retaining the submitted event values."""
    try:
        decoded = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        return _result(errors=("File must use UTF-8 encoding.",))

    try:
        reader = csv.DictReader(io.StringIO(decoded, newline=""), strict=True)
        headers = reader.fieldnames
        if headers is None:
            return _result(errors=("CSV is empty or has no header row.",))
        if len(headers) != len(set(headers)):
            return _result(errors=("CSV header names must not be duplicated.",))
        if tuple(headers) != CSV_HEADERS:
            return _result(
                errors=(
                    "Header row must exactly match the fisheye.events.v1 schema and column order.",
                )
            )

        errors: list[str] = []
        seen_event_ids: set[str] = set()
        employee_days: dict[tuple[str, date], list[tuple[int, dict[str, str]]]] = defaultdict(list)
        baseline_latest: datetime | None = None
        evaluation_earliest: datetime | None = None
        row_count = 0

        for line_number, row in enumerate(reader, start=2):
            row_count += 1
            if row_count > MAX_CSV_ROWS:
                errors.append(f"CSV exceeds the {MAX_CSV_ROWS:,}-row development limit.")
                break
            if None in row:
                errors.append(f"Row {line_number}: has more columns than the schema.")
                continue
            values = {key: (value or "").strip() for key, value in row.items()}
            missing = [name for name in REQUIRED_VALUES if not values[name]]
            if missing:
                errors.append(f"Row {line_number}: missing required values: {', '.join(missing)}.")

            event_id = values["event_id"]
            if event_id:
                if event_id in seen_event_ids:
                    errors.append(f"Row {line_number}: event_id must be unique.")
                seen_event_ids.add(event_id)

            if values["event_type"] and values["event_type"] not in EVENT_TYPES:
                errors.append(f"Row {line_number}: event_type is not supported.")

            partition = values["dataset_partition"]
            if partition and partition not in PARTITIONS:
                errors.append(
                    f"Row {line_number}: dataset_partition must be baseline or evaluation."
                )
            label = values["ground_truth_label"]
            if partition == "baseline" and label:
                errors.append(
                    f"Row {line_number}: baseline rows must not have a ground_truth_label."
                )
            elif partition == "evaluation" and label not in GROUND_TRUTH_LABELS:
                errors.append(
                    f"Row {line_number}: evaluation rows need a supported ground_truth_label."
                )
            elif partition not in PARTITIONS and label:
                errors.append(
                    f"Row {line_number}: label cannot be checked for an invalid partition."
                )

            record_count = values["record_count"]
            if record_count:
                try:
                    if int(record_count) < 0 or str(int(record_count)) != record_count:
                        raise ValueError
                except ValueError:
                    errors.append(f"Row {line_number}: record_count must be a nonnegative integer.")

            event_time = _parse_utc_timestamp(values["event_timestamp_utc"])
            if values["event_timestamp_utc"] and event_time is None:
                errors.append(
                    f"Row {line_number}: event_timestamp_utc must be a valid UTC timestamp "
                    "ending in Z."
                )
            if event_time is not None and partition in PARTITIONS:
                if partition == "baseline":
                    baseline_latest = (
                        max(baseline_latest, event_time) if baseline_latest else event_time
                    )
                else:
                    evaluation_earliest = (
                        min(evaluation_earliest, event_time) if evaluation_earliest else event_time
                    )
                if values["employee_id"]:
                    employee_days[(values["employee_id"], event_time.date())].append(
                        (line_number, values)
                    )

        if row_count == 0:
            errors.append("CSV must contain at least one event row.")
        if baseline_latest and evaluation_earliest and baseline_latest >= evaluation_earliest:
            errors.append("All baseline events must predate evaluation events.")

        for day_rows in employee_days.values():
            labels = {
                row["ground_truth_label"]
                for _, row in day_rows
                if row["dataset_partition"] == "evaluation" and row["ground_truth_label"]
            }
            if len(labels) > 1:
                lines = ", ".join(str(line) for line, _ in day_rows)
                errors.append(
                    "Employee-day evaluation rows must use one consistent ground_truth_label "
                    f"(rows {lines})."
                )

        return CsvValidationResult(
            valid=not errors,
            schema_version=SCHEMA_VERSION,
            row_count=row_count,
            employee_day_count=len(employee_days),
            errors=tuple(errors),
        )
    except csv.Error:
        return _result(errors=("CSV contains invalid quoting or row structure.",))


def _parse_utc_timestamp(value: str) -> datetime | None:
    if not value.endswith("Z"):
        return None
    try:
        return datetime.fromisoformat(value[:-1] + "+00:00")
    except ValueError:
        return None


def _result(errors: tuple[str, ...]) -> CsvValidationResult:
    return CsvValidationResult(
        valid=False,
        schema_version=SCHEMA_VERSION,
        row_count=0,
        employee_day_count=0,
        errors=errors,
    )
