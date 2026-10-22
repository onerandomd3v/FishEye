'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Button, Notice } from '@fisheye/ui';
import { createFishEyeApiClient, type components } from '@fisheye/api-client';
import { EvaluationComparison } from '../comparison';
import { formatDetectorName } from '../../evaluation-format';
import { EmptyState, PageHeading } from '../../shared';
import { apiBaseUrl } from '../../investigations/data';

type Run = components['schemas']['EvaluationRunResponse'];
type Finding = components['schemas']['RunFindingResponse'];
type Detector = Finding['detector'];

const detectors: Detector[] = ['simple_rule', 'tuned_rules', 'contextual'];

export default function EvaluationRunPage() {
  const { runId } = useParams<{ runId: string }>();
  const [run, setRun] = useState<Run | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [detector, setDetector] = useState<Detector>('contextual');
  const [loading, setLoading] = useState(true);
  const [findingsLoading, setFindingsLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');
  const [manifestError, setManifestError] = useState('');
  const [findingsError, setFindingsError] = useState('');
  const [refreshCount, setRefreshCount] = useState(0);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      setRun(null);
      setFindings([]);
      setError('');
      setLoading(true);
      const baseUrl = apiBaseUrl();
      if (!baseUrl) {
        setError('The FishEye API is not configured.');
        setLoading(false);
        return;
      }
      const client = createFishEyeApiClient(baseUrl);
      void client
        .GET('/api/v1/runs/{run_id}', {
          params: { path: { run_id: runId } },
        })
        .then((result) => {
          if (!active) return;
          if (!result.response.ok || !result.data) {
            throw new Error(
              result.response.status === 404
                ? 'This run could not be found.'
                : `Run details could not be loaded (${result.response.status}).`,
            );
          }
          setRun(result.data);
        })
        .catch((cause: unknown) => {
          if (active) {
            setError(
              cause instanceof Error
                ? cause.message
                : 'Run details could not be loaded.',
            );
          }
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [runId, refreshCount]);

  useEffect(() => {
    if (!run || run.status !== 'completed') return;
    let active = true;
    const timer = window.setTimeout(() => {
      setFindings([]);
      setFindingsError('');
      setFindingsLoading(true);
      const client = createFishEyeApiClient(apiBaseUrl());
      void client
        .GET('/api/v1/runs/{run_id}/findings', {
          params: {
            path: { run_id: run.run_id },
            query: { detector, limit: 100, offset: 0 },
          },
        })
        .then((result) => {
          if (!active) return;
          if (!result.response.ok || !result.data) {
            throw new Error(
              `Findings could not be loaded (${result.response.status}).`,
            );
          }
          setFindings(result.data.items);
        })
        .catch((cause: unknown) => {
          if (active) {
            setFindingsError(
              cause instanceof Error
                ? cause.message
                : 'Findings could not be loaded.',
            );
          }
        })
        .finally(() => {
          if (active) setFindingsLoading(false);
        });
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [run, detector]);

  async function downloadManifest() {
    if (!run?.result_manifest_sha256) return;
    setDownloading(true);
    setManifestError('');
    try {
      const response = await fetch(
        `${apiBaseUrl()}/api/v1/runs/${encodeURIComponent(run.run_id)}/manifest`,
      );
      if (!response.ok) {
        throw new Error(`Manifest download failed (${response.status}).`);
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = `fisheye-run-${run.run_id}-manifest.json`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) {
      setManifestError(
        cause instanceof Error
          ? cause.message
          : 'The run manifest could not be downloaded.',
      );
    } finally {
      setDownloading(false);
    }
  }

  const metrics = asRecord(run?.metrics);
  const comparisons = asRecord(metrics?.comparisons);
  const unit = metrics?.evaluation_unit;
  const unitCount = metrics?.evaluation_unit_count;

  return (
    <>
      <Link className="back-link" href="/evaluation">
        <span aria-hidden="true">←</span> Back to runs
      </Link>
      <PageHeading
        title={run ? `Run ${run.run_id.slice(0, 8)}` : 'Run details'}
        description="Review the results and findings from this evaluation."
        action={
          <div className="page-actions">
            <Link className="inline-guide-link" href="/guide#results">
              How to read results
            </Link>
            <Button
              type="button"
              variant="secondary"
              disabled={loading}
              onClick={() => setRefreshCount((value) => value + 1)}
            >
              {loading ? 'Refreshing…' : 'Refresh run'}
            </Button>
          </div>
        }
      />

      {loading ? <p role="status">Loading run…</p> : null}
      {error ? (
        <div role="alert">
          <Notice title="Run details unavailable">
            <p>{error}</p>
            <Link className="fe-button fe-button-secondary" href="/evaluation">
              Back to runs
            </Link>
          </Notice>
        </div>
      ) : null}

      {run ? (
        <>
          <dl className="run-summary" aria-label="Run summary">
            <div>
              <dt>Status</dt>
              <dd>{formatStatus(run.status)}</dd>
            </div>
            <div>
              <dt>What is counted</dt>
              <dd>
                {unit === 'employee_day_utc'
                  ? 'One person per day'
                  : stringValue(unit) ?? 'Pending'}
              </dd>
            </div>
            <div>
              <dt>Person-days evaluated</dt>
              <dd>{stringValue(unitCount) ?? 'Pending'}</dd>
            </div>
          </dl>

          {run.status === 'failed' ? (
            <Notice title="Evaluation failed">
              The run could not be processed. Review the run details below.
            </Notice>
          ) : null}
          {run.status !== 'completed' && run.status !== 'failed' ? (
            <Notice title="Run in progress">
              Results will appear when processing is complete. Refresh to check
              for an update.
            </Notice>
          ) : null}

          <details className="card disclosure-card run-details">
            <summary>
              <h2>Run details</h2>
            </summary>
            <div className="disclosure-content">
              <dl className="dataset-import-details">
                <div>
                  <dt>Run ID</dt>
                  <dd>{run.run_id}</dd>
                </div>
                <div>
                  <dt>Method</dt>
                  <dd>{run.methodology_version}</dd>
                </div>
                {run.error_code ? (
                  <div>
                    <dt>Error code</dt>
                    <dd>{run.error_code}</dd>
                  </div>
                ) : null}
              </dl>
              <div className="run-manifest-action">
                <p className="field-help">
                  Download the manifest with dataset and file checksums.
                </p>
                <Button
                  type="button"
                  disabled={
                    run.status !== 'completed' ||
                    !run.result_manifest_sha256 ||
                    downloading
                  }
                  onClick={() => void downloadManifest()}
                >
                  {downloading ? 'Preparing…' : 'Download manifest'}
                </Button>
              </div>
              {manifestError ? (
                <p className="import-state import-state-error" role="alert">
                  {manifestError}
                </p>
              ) : null}
            </div>
          </details>

          {run.status === 'completed' ? (
            <>
              <section className="run-results-section" aria-labelledby="comparison-title">
                <div className="run-section-heading">
                  <h2 id="comparison-title">Compare methods</h2>
                </div>
                {comparisons ? (
                  <EvaluationComparison metrics={comparisons} />
                ) : (
                  <p className="run-section-message" role="alert">
                    This run has no comparison results.
                  </p>
                )}
              </section>

              <section className="run-results-section" aria-labelledby="findings-title">
                <div className="run-section-heading">
                  <div>
                    <h2 id="findings-title">Findings</h2>
                    <p className="card-intro">
                      Review the activity each method flagged.
                    </p>
                  </div>
                  <label className="compact-field">
                    Method
                    <select
                      value={detector}
                      onChange={(event) =>
                        setDetector(event.target.value as Detector)
                      }
                    >
                      {detectors.map((item) => (
                        <option key={item} value={item}>
                          {formatDetectorName(item)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {findingsLoading ? (
                  <p className="run-section-message" role="status">
                    Loading findings…
                  </p>
                ) : null}
                {findingsError ? (
                  <p className="run-section-message" role="alert">
                    {findingsError}
                  </p>
                ) : null}
                {!findingsLoading && !findingsError && findings.length === 0 ? (
                  <EmptyState title="No findings from this method">
                    Check the missed-threat count above; no findings does not
                    always mean no threats were present.
                  </EmptyState>
                ) : null}
                {findings.length > 0 ? (
                  <div className="table-wrap">
                    <table className="data-table evaluation-findings-table">
                      <thead>
                        <tr>
                          <th scope="col">Employee</th>
                          <th scope="col">Day</th>
                          <th scope="col">Score</th>
                          <th scope="col">Priority</th>
                          <th scope="col">Why flagged</th>
                          <th scope="col">Evidence</th>
                        </tr>
                      </thead>
                      <tbody>
                        {findings.map((finding) => (
                          <tr key={finding.finding_id}>
                            <td>
                              <Link
                                href={`/investigations/${encodeURIComponent(finding.finding_id)}`}
                              >
                                {finding.employee_id}
                              </Link>
                            </td>
                            <td>{finding.employee_day_utc}</td>
                            <td>{finding.score} / 100</td>
                            <td>{finding.severity}</td>
                            <td>
                              {finding.reason_codes
                                .map((reason) => reason.replaceAll('_', ' '))
                                .join(', ') || '—'}
                            </td>
                            <td>{finding.evidence_event_ids.length} events</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </section>
            </>
          ) : null}

        </>
      ) : null}
    </>
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function formatStatus(status: string): string {
  const label = status.replaceAll('_', ' ');
  return `${label.charAt(0).toUpperCase()}${label.slice(1)}`;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : null;
}
