# FishEye synthetic event CSV — v1

This file defines the first user-supplied synthetic dataset format. The API has
a development-only validation endpoint and a separate development-only import
endpoint. Validation does not persist data. Import stores the original CSV as an
immutable source artifact, records a checksum and manifest, and creates a
dataset record. Import does not start a run or calculate risk.

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
events for an employee-day must belong to one partition; an employee-day cannot
be split between baseline and evaluation. All baseline events must precede
evaluation events. Ground-truth labels are reserved for evaluation and must
never become detector features. Validation returns at most 99 row-level errors
plus an omitted-error count to keep responses bounded.

The validation endpoint is `POST /api/v1/datasets/imports/validate` with
`Content-Type: text/csv` and
`X-FishEye-Synthetic-Data-Confirmed: true`. It is disabled unless
`FISHEYE_ENV=development` and `FISHEYE_ENABLE_DEV_CSV_VALIDATION=1`. The
confirmation is a user attestation;
CSV validation cannot establish that data is synthetic. Do not submit actual
employee, customer, bank, credential, or production-log data.

The import endpoint is `POST /api/v1/datasets/imports` with the same content
type and confirmation header. It is disabled unless `FISHEYE_ENV=development`
and `FISHEYE_ENABLE_DEV_CSV_IMPORT=1`. It also requires `DATABASE_URL`,
`FISHEYE_ARTIFACT_DIR`, and `FISHEYE_ARTIFACT_ENCRYPTION_KEY` to be configured,
and the Alembic migrations to have been run with `pnpm db:migrate`. Exact
duplicate uploads are idempotent: they return the same dataset ID
and do not create a second database record. Dataset IDs are stable for the
same uploaded bytes. The response states `run_created: false` and
`risk_calculated: false`.

The source CSV and manifest are encrypted at rest using Fernet. The manifest
records the source checksum, schema version, counts, and the absence of an
uploaded random seed. It explicitly reserves ground-truth labels for evaluation.
The original CSV is retained as the encrypted source artifact for provenance.
Development-only `GET /api/v1/datasets` and
`GET /api/v1/datasets/{dataset_id}` expose paginated dataset provenance and
status metadata, but never return the artifact path, source rows or labels.
Enable these reads only with `FISHEYE_ENV=development` and
`FISHEYE_ENABLE_DEV_DATASET_READS=1`. These endpoints do not authenticate
callers and must remain disabled outside local development. Production
authentication/authorization, worker-side parsing into analytical artifacts
and any evaluation run are separate future steps.

For local validation, set `FISHEYE_ENV=development` and
`FISHEYE_ENABLE_DEV_CSV_VALIDATION=1` in the API process environment. For local
import, also set `FISHEYE_ENABLE_DEV_CSV_IMPORT=1`, configure the database and
artifact directory, and provide an encryption key. To list imported datasets,
also set `FISHEYE_ENABLE_DEV_DATASET_READS=1`. Generate a local Fernet key
with `uv run --package fisheye-persistence python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`.
Keep it in your local environment, never commit it, and keep using the same key
for existing artifacts. Then run `pnpm db:migrate`. Start the API with
`pnpm dev:api`. Set `NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000` in
`apps/web/console/.env.local` and start the console with `pnpm dev:console`.
Keep both development flags off outside local development.

Validation errors identify row numbers and rules, not submitted event values.
Successful validation reports row and employee-day counts only. It does not
mean the CSV was imported or evaluated.
