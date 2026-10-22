"""Approved provisional v1 experimental policy and immutable config fingerprint."""

import hashlib
import json

from fisheye_evaluation.metrics import MAX_RECALL_DROP

METHODOLOGY_VERSION = "fisheye.employee-day-experimental.v1"
SIMPLE_ALERT_THRESHOLD = 40
HIGH_SEVERITY_THRESHOLD = 70
MIN_PERSONAL_BASELINE_DAYS = 3
MIN_ROLE_BASELINE_DAYS = 3
VOLUME_MULTIPLIER = 3.0

METHODOLOGY_CONFIG: dict[str, object] = {
    "version": METHODOLOGY_VERSION,
    "evaluation_unit": "employee_day_utc",
    "simple_rule": {
        "out_of_role_points": 50,
        "high_volume_points": 50,
        "failed_sign_in_minimum": 5,
        "failed_sign_in_points": 50,
        "alert_threshold": SIMPLE_ALERT_THRESHOLD,
    },
    "contextual": {
        "out_of_role_points": 40,
        "high_volume_points": 30,
        "failed_sign_in_minimum": 3,
        "failed_sign_in_points": 30,
        "unseen_device_points": 15,
        "unseen_location_points": 15,
        "off_hours_points": 10,
        "high_severity_threshold": HIGH_SEVERITY_THRESHOLD,
        "medium_severity_threshold": 40,
    },
    "baseline": {
        "history": "all_baseline_partition_employee_days",
        "minimum_personal_days": MIN_PERSONAL_BASELINE_DAYS,
        "minimum_role_days": MIN_ROLE_BASELINE_DAYS,
        "volume_multiplier": VOLUME_MULTIPLIER,
        "zero_or_missing_median_triggers_high_volume": False,
    },
    "calibration": {
        "maximum_absolute_recall_drop": MAX_RECALL_DROP,
        "threshold_selection": "strictest_observed_score_meeting_recall_floor",
    },
}
METHODOLOGY_CONFIG_SHA256 = hashlib.sha256(
    json.dumps(METHODOLOGY_CONFIG, sort_keys=True, separators=(",", ":")).encode()
).hexdigest()
