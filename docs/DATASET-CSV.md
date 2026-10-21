# FishEye synthetic event CSV — v1

This file defines the first user-supplied synthetic dataset format. The API's
development validation endpoint checks this contract only; it does not persist
the upload, create a dataset, start a run, or calculate risk.

## CSV format

- Encoding: UTF-8 (an optional UTF-8 BOM is accepted).
- Header row: exact names and order shown below; all 12 columns are required in
  the header, including optional-value columns.
- Each data row represents one synthetic access event.
- Maximum development validation size: 10 MiB and 100,000 event rows. These are
  resource bounds for the local preview, not deployment capacity targets.

```csv
event_id,employee_id,role_id,department_id,event_timestamp_utc,event_type,system,device_id,location_label,record_count,dataset_partition,ground_truth_label
```

| Field                 | Requirement and meaning                                                                          |
| --------------------- | ------------------------------------------------------------------------------------------------ |
| `event_id`            | Required, unique event identifier.                                                               |
| `employee_id`         | Required fake employee identifier.                                                               |
| `role_id`             | Required synthetic role identifier.                                                              |
| `department_id`       | Required synthetic department identifier.                                                        |
| `event_timestamp_utc` | Required ISO 8601 timestamp ending in `Z`.                                                       |
| `event_type`          | Required enum: `sign_in`, `failed_sign_in`, `record_read`, `record_export`, `permission_change`. |
| `system`              | Required synthetic target-system name.                                                           |
| `device_id`           | Optional; blank means missing or unreported.                                                     |
| `location_label`      | Optional; blank means missing or unreported.                                                     |
| `record_count`        | Optional nonnegative integer count; blank means unknown or not applicable.                       |
| `dataset_partition`   | Required enum: `baseline` or `evaluation`.                                                       |
| `ground_truth_label`  | Blank on baseline rows. Evaluation rows require `threat_scenario` or `benign_scenario`.          |

## Evaluation unit and validation

The evaluation unit is an employee-day: rows are grouped by `employee_id` and
the UTC calendar date of `event_timestamp_utc`. The evaluation label applies to
the whole employee-day and must be consistent across its evaluation rows. All
baseline events must precede evaluation events. Ground-truth labels are reserved
for evaluation and must never become detector features.

The development endpoint is `POST /api/v1/datasets/imports/validate` with
`Content-Type: text/csv` and
`X-FishEye-Synthetic-Data-Confirmed: true`. It is disabled unless
`FISHEYE_ENV=development` and `FISHEYE_ENABLE_DEV_CSV_VALIDATION=1`. The
confirmation is a user attestation;
CSV validation cannot establish that data is synthetic. Do not submit actual
employee, customer, bank, credential, or production-log data.

For local use, set `FISHEYE_ENV=development` and
`FISHEYE_ENABLE_DEV_CSV_VALIDATION=1` in the API process environment, then start
the API with `pnpm dev:api`. Set `NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000`
in `apps/web/console/.env.local` and start the console with `pnpm dev:console`.
Keep the validation flag off outside local development.

Validation errors identify row numbers and rules, not submitted event values.
Successful validation reports row and employee-day counts only. It does not
mean the CSV was imported or evaluated.
