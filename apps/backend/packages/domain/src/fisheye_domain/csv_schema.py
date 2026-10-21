"""Shared constants for the versioned synthetic event CSV contract."""

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
MAX_REPORTED_ERRORS = 100
MAX_ERROR_ROW_NUMBERS = 20
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
