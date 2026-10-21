"""Validation for the version 1 synthetic access-event CSV format.

This module deliberately validates structure only. It does not attempt to prove
that a supplied dataset is synthetic and it never persists or scores events.
"""

import csv
import io
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime

from .csv_schema import (
    CSV_HEADERS,
    EVENT_TYPES,
    GROUND_TRUTH_LABELS,
    MAX_CSV_ROWS,
    MAX_ERROR_ROW_NUMBERS,
    MAX_RECORD_COUNT,
    MAX_REPORTED_ERRORS,
    PARTITIONS,
    REQUIRED_VALUES,
    SCHEMA_VERSION,
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
        omitted_error_count = 0

        def add_error(message: str) -> None:
            """Keep validation feedback bounded while counting every issue."""
            nonlocal omitted_error_count
            if len(errors) < MAX_REPORTED_ERRORS - 1:
                errors.append(message)
            else:
                omitted_error_count += 1

        seen_event_ids: set[str] = set()
        employee_days: dict[tuple[str, date], list[tuple[int, dict[str, str]]]] = defaultdict(list)
        baseline_latest: datetime | None = None
        evaluation_earliest: datetime | None = None
        row_count = 0

        for line_number, row in enumerate(reader, start=2):
            row_count += 1
            if row_count > MAX_CSV_ROWS:
                add_error(f"CSV exceeds the {MAX_CSV_ROWS:,}-row development limit.")
                break
            if None in row:
                add_error(f"Row {line_number}: has more columns than the schema.")
                continue
            values = {key: (value or "").strip() for key, value in row.items()}
            missing = [name for name in REQUIRED_VALUES if not values[name]]
            if missing:
                add_error(f"Row {line_number}: missing required values: {', '.join(missing)}.")

            event_id = values["event_id"]
            if event_id:
                if event_id in seen_event_ids:
                    add_error(f"Row {line_number}: event_id must be unique.")
                seen_event_ids.add(event_id)

            if values["event_type"] and values["event_type"] not in EVENT_TYPES:
                add_error(f"Row {line_number}: event_type is not supported.")

            partition = values["dataset_partition"]
            if partition and partition not in PARTITIONS:
                add_error(f"Row {line_number}: dataset_partition must be baseline or evaluation.")
            label = values["ground_truth_label"]
            if partition == "baseline" and label:
                add_error(f"Row {line_number}: baseline rows must not have a ground_truth_label.")
            elif partition == "evaluation" and label not in GROUND_TRUTH_LABELS:
                add_error(
                    f"Row {line_number}: evaluation rows need a supported ground_truth_label."
                )
            elif partition not in PARTITIONS and label:
                add_error(f"Row {line_number}: label cannot be checked for an invalid partition.")

            record_count = values["record_count"]
            if record_count:
                try:
                    parsed_record_count = int(record_count)
                    if (
                        parsed_record_count < 0
                        or parsed_record_count > MAX_RECORD_COUNT
                        or str(parsed_record_count) != record_count
                    ):
                        raise ValueError
                except ValueError:
                    add_error(
                        f"Row {line_number}: record_count must be a nonnegative signed "
                        "64-bit integer."
                    )

            event_time = _parse_utc_timestamp(values["event_timestamp_utc"])
            if values["event_timestamp_utc"] and event_time is None:
                add_error(
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
            add_error("CSV must contain at least one event row.")
        if baseline_latest and evaluation_earliest and baseline_latest >= evaluation_earliest:
            add_error("All baseline events must predate evaluation events.")

        for day_rows in employee_days.values():
            partitions = {row["dataset_partition"] for _, row in day_rows}
            if len(partitions) > 1:
                add_error(
                    "An employee-day cannot be split across baseline and evaluation partitions."
                )
            labels = {
                row["ground_truth_label"]
                for _, row in day_rows
                if row["dataset_partition"] == "evaluation" and row["ground_truth_label"]
            }
            if len(labels) > 1:
                listed_lines = [str(line) for line, _ in day_rows[:MAX_ERROR_ROW_NUMBERS]]
                remaining = len(day_rows) - len(listed_lines)
                lines = ", ".join(listed_lines)
                if remaining:
                    lines += f", and {remaining:,} more"
                add_error(
                    "Employee-day evaluation rows must use one consistent ground_truth_label "
                    f"(rows {lines})."
                )

        if omitted_error_count:
            errors.append(f"{omitted_error_count:,} additional validation errors omitted.")
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
    if "T" not in value or not value.endswith("Z"):
        return None
    try:
        parsed = datetime.fromisoformat(value[:-1] + "+00:00")
    except ValueError:
        return None
    offset = parsed.utcoffset()
    if parsed.tzinfo is None or offset is None or offset.total_seconds() != 0:
        return None
    return parsed


def _result(errors: tuple[str, ...]) -> CsvValidationResult:
    return CsvValidationResult(
        valid=False,
        schema_version=SCHEMA_VERSION,
        row_count=0,
        employee_day_count=0,
        errors=errors,
    )
