# Synthetic employee context sidecar

The optional development research engine uses a separate, versioned JSON
context file for synthetic role permissions and declared work schedules. The
sidecar is input data, not an API response or proof of real employee policy.
Do not put real employee information or production authorization records in it.

```json
{
  "schema_version": "fisheye.context.v1",
  "roles": [
    { "role_id": "teller", "authorized_systems": ["core-banking", "crm"] }
  ],
  "employee_schedules": [
    {
      "employee_id": "employee-001",
      "timezone": "Africa/Lagos",
      "working_weekdays": [0, 1, 2, 3, 4],
      "work_start_local": "08:00",
      "work_end_local": "17:00"
    }
  ]
}
```

`working_weekdays` uses ISO weekday numbering (`0` Monday through `6` Sunday).
Times use 24-hour `HH:MM` local time and IANA time-zone names. An end time
earlier than the start time represents an overnight shift. Shift intervals
include the start and exclude the end time. The sidecar must
cover every role and employee appearing in the analyzed events. The parser
rejects unsupported versions, duplicate mappings, empty permissions, invalid
time zones, invalid schedules and unknown fields.

The research engine accepts this parsed contract alongside prepared event,
partition and label frames. Its detector feature construction does not accept
ground-truth labels. At this stage the context file is not uploaded or persisted
by the API, and the research comparison is not wired to a run endpoint. The
scoring method remains a proposal pending methodology review.
