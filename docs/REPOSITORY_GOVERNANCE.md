# FishEye — Repository Governance and CI

**Status:** CI workflows and repository policy files committed. **GitHub repository settings/ruleset must be activated by an administrator in GitHub UI.** This policy file alone does not enforce rules.

## Protected default branch

Target **main** with a repository ruleset named `FishEye | Protect main` (Active only after first successful runs).

- Require pull requests for all changes; disallow direct pushes, including administrators (avoid bypass except a separately governed emergency process).
- Require **1 approval from another maintainer**; dismiss stale approvals after new commits and require review of most recent push when available.
- Require resolved conversations before merge.
- Require status checks **web-checks**, **backend-checks**, **database-checks**, **security-checks** after confirming each has actually run and is green. Use checks from GitHub Actions.
- Enable **Require branches to be up to date before merging**; use merge queue instead only when configured and validated (workflows accept `merge_group`).
- Block force pushes and deletion of `main`.
- Prefer squash merge and delete head branch after successful merge.
- Require code owner reviews **only after** verifying an eligible different reviewer exists (sole owner cannot meaningfully approve own PR).
- Restrict bypass; do not grant silent administrator exemption.

### Safe activation sequence

1. Run CI for a test PR and fix failing workflows.
2. Confirm check **names and GitHub Actions as the check source**.
3. Create ruleset at **Settings → Rules → Rulesets → New branch ruleset** and target the default `main` branch; turn it to **Evaluate** (where supported) until checks verified.
4. Enable protections above; set ruleset Active; test an unapproved PR, failing-check PR and stale branch.
5. Enable squash-only merge and delete-head-branches at **Settings → General → Pull Requests**.
6. Ensure branch updating is possible and auto-merge policies don't bypass required reviews.

**Never require a check that is not yet emitted or always skipped**, or every PR will be blocked.

## Pull request convention

- Feature branch example: `feat/FE-003-risk-overview`; fixes `fix/FE-XXX-...`; infra `chore/ci-...`.
- PR targets `main` and uses `.github/PULL_REQUEST_TEMPLATE.md`.
- Link issues and include verification evidence. For web UI, include desktop/mobile screenshots; for detectors, report seed/dataset and error-case comparisons.
- Requested reviews must be from authorized maintainers other than the author.
- Keep main green; sync PR with current main using Update branch or a deliberate rebase/merge. Never force-update another engineer's branch without permission.

## CI responsibilities

| Workflow | Required check | Current scope |
| --- | --- | --- |
| `web-ci.yml` | `web-checks` | pnpm install, TypeScript/Astro checks and web production builds |
| `backend-ci.yml` | `backend-checks` | uv sync, Ruff lint/format and existing FastAPI tests |
| `database-ci.yml` | `database-checks` | PostgreSQL 17 connectivity smoke only, pending real Alembic migration tests |
| `security-ci.yml` | `security-checks` | Gitleaks secret scanning (needs GitHub Action runtime validation) |
| `release.yml` | not required | Manual **approval gate scaffold only**, no deployments wired |

All required checks run for all PRs without path filters, to avoid skipped required checks. The PR merge queue event is supported by workflow triggers, but the merge queue ruleset has **not** been enabled.

**Gaps to close before enforcing production release readiness:**
- Generate and commit a reproducible pnpm lockfile and uv lockfile; make CI installs frozen/locked.
- Add actual ESLint configuration (current web lint script is not a real lint implementation), web unit/UI tests and Python static type checks.
- Add real Alembic migration tests once schema exists; connectivity smoke alone is not database migration verification.
- Validate CI Action permissions / Gitleaks runtime, and add suitable dependency vulnerability/code scanning coverage.
- Create GitHub `staging` and `production` Environments with reviewer approvals and environment secrets when hosting selected.
- Configure and test actual application deployments and rollback before calling release CI/CD complete.

## Security conventions

- Do not store real bank records; use synthetic events only for v1.
- CI uses no production secrets for PRs. Restrict workflow permissions to least privilege.
- Review external GitHub Actions before pinning SHA; move from release tags to reviewed immutable commit SHAs when validated.
- Keep separate secrets for local, staging and production; no unprotected repository-wide deployment credentials.

See `AGENTS.md`, `apps/web/AGENTS.md`, `apps/backend/AGENTS.md`, `ARCHITECTURE.md`, and `PRD.md`.
