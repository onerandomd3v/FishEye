# ADR 0003: Local workspace data reset

- Status: Accepted
- Date: 2026-10-22

## Context

Researchers need to clear local evaluation history before testing a new CSV. The
API stores runs, append-only review events, imported dataset metadata, and
encrypted source, context, analysis, and result artifacts. Completed results
remain immutable during ordinary use.

## Decision

Provide an authenticated local workspace reset that explicitly deletes all
evaluation runs, their review history, imported datasets, and the artifacts
referenced by those records. The API exposes this operation only when
`FISHEYE_ENV=development`, development evaluation runs are enabled, and
`FISHEYE_ENABLE_LOCAL_DATA_RESET=1`. The new flag is off by default.

The console reports the number of affected records before the reset and
requires the analyst to type `CLEAR ALL DATA`. The API independently checks
that confirmation. It refuses to reset while any run is queued or running,
locks the relevant database rows, validates artifact paths remain under the
configured storage root, and restores quarantined files if the database
transaction fails.

## Consequences

- This is an explicit local cleanup operation, not ordinary run deletion or a
  mechanism to alter published research results.
- Environments must opt in; deployed environments do not expose or permit it by
  default.
- A cleanup failure after database commit is reported so remaining quarantined
  files can be handled without falsely claiming complete artifact removal.
