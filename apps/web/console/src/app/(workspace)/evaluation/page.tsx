'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Notice } from '@fisheye/ui';
import { createFishEyeApiClient, type components } from '@fisheye/api-client';
import { PageHeading } from '../shared';
import {
  formatAlertsPer100EmployeeDays,
  formatMetricRatio,
} from '../evaluation-format';
import { apiBaseUrl } from '../investigations/data';

type Run = components['schemas']['EvaluationRunResponse'];
type Finding = components['schemas']['RunFindingResponse'];
type Detector = components['schemas']['RunFindingResponse']['detector'];

const detectors: Detector[] = ['simple_rule', 'tuned_rules', 'contextual'];
export default function EvaluationPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [selectedRun, setSelectedRun] = useState<Run | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [detector, setDetector] = useState<Detector>('contextual');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [findingsLoading, setFindingsLoading] = useState(false);
  const [manifestDownloadingRunId, setManifestDownloadingRunId] = useState<
    string | null
  >(null);
  const [manifestError, setManifestError] = useState('');
  const findingsRequestIdRef = useRef(0);
  const manifestRequestIdRef = useRef(0);

  const loadRuns = useCallback(async () => {
    const baseUrl = apiBaseUrl();
    if (!baseUrl) {
      setError('The FishEye API is not configured.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const client = createFishEyeApiClient(baseUrl);
      const result = await client.GET('/api/v1/runs', {
        params: { query: { limit: 50, offset: 0 } },
      });
      if (!result.response.ok || !result.data)
        throw new Error(
          `Run history could not be loaded (${result.response.status}).`,
        );
      setRuns(result.data.items);
      setSelectedRun(
        (current) =>
          result.data.items.find((run) => run.run_id === current?.run_id) ??
          null,
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Run history could not be loaded.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadRuns(), 0);
    return () => window.clearTimeout(timer);
  }, [loadRuns]);

  async function loadFindings(run: Run, selectedDetector: Detector) {
    const baseUrl = apiBaseUrl();
    if (!baseUrl || run.status !== 'completed') return;
    const requestId = ++findingsRequestIdRef.current;
    setSelectedRun(run);
    setFindings([]);
    setFindingsLoading(true);
    setError('');
    const client = createFishEyeApiClient(baseUrl);
    try {
      const result = await client.GET('/api/v1/runs/{run_id}/findings', {
        params: {
          path: { run_id: run.run_id },
          query: { detector: selectedDetector, limit: 100, offset: 0 },
        },
      });
      if (!result.response.ok || !result.data)
        throw new Error(
          `Findings could not be loaded (${result.response.status}).`,
        );
      if (requestId !== findingsRequestIdRef.current) return;
      setFindings(result.data.items);
    } catch (cause) {
      if (requestId !== findingsRequestIdRef.current) return;
      setError(
        cause instanceof Error
          ? cause.message
          : 'Findings could not be loaded.',
      );
    } finally {
      if (requestId === findingsRequestIdRef.current) setFindingsLoading(false);
    }
  }

  function selectRun(run: Run) {
    manifestRequestIdRef.current += 1;
    setManifestDownloadingRunId(null);
    setSelectedRun(run);
    setFindings([]);
    setManifestError('');
    if (run.status === 'completed') {
      void loadFindings(run, detector);
    } else {
      findingsRequestIdRef.current += 1;
      setFindingsLoading(false);
    }
  }

  async function downloadManifest(run: Run) {
    const baseUrl = apiBaseUrl();
    if (!baseUrl || !run.result_manifest_sha256) return;
    const requestId = ++manifestRequestIdRef.current;
    setManifestDownloadingRunId(run.run_id);
    setManifestError('');
    try {
      const response = await fetch(
        `${baseUrl}/api/v1/runs/${encodeURIComponent(run.run_id)}/manifest`,
      );
      if (requestId !== manifestRequestIdRef.current) return;
      if (!response.ok) {
        throw new Error(
          `Manifest download failed (${response.status}). Refresh the run and try again.`,
        );
      }
      const blob = await response.blob();
      if (requestId !== manifestRequestIdRef.current) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `fisheye-run-${run.run_id}-manifest.json`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) {
      if (requestId === manifestRequestIdRef.current) {
        setManifestError(
          cause instanceof Error
            ? cause.message
            : 'The evaluation manifest could not be downloaded.',
        );
      }
    } finally {
      if (requestId === manifestRequestIdRef.current) {
        setManifestDownloadingRunId(null);
      }
    }
  }

  const comparisons = selectedRun?.metrics?.comparisons;

  return (
    <>
      <PageHeading
        title="Model evaluation"
        description="Review durable synthetic evaluation runs and findings returned by the worker."
      />
      <section
        className="card section-card"
        aria-labelledby="run-history-title"
      >
        <div className="section-title-row">
          <h2 id="run-history-title">Evaluation runs</h2>
          <Button
            type="button"
            onClick={() => void loadRuns()}
            disabled={loading}
          >
            {loading ? 'Refreshing…' : 'Refresh runs'}
          </Button>
        </div>
        {loading && runs.length === 0 ? (
          <p role="status">Loading evaluation runs…</p>
        ) : null}
        {error ? (
          <p className="import-state import-state-error" role="alert">
            {error}
          </p>
        ) : null}
        {!loading && !error && runs.length === 0 ? (
          <p className="empty-state">
            No evaluation runs are available. Upload a synthetic events v2 CSV
            and context file in Scenario lab to create one.
          </p>
        ) : null}
        {runs.length > 0 ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Run</th>
                  <th scope="col">Status</th>
                  <th scope="col">Methodology</th>
                  <th scope="col">Created</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.run_id}>
                    <td>
                      <code>{run.run_id.slice(0, 8)}</code>
                    </td>
                    <td>
                      {run.status}
                      {run.error_code ? ` · ${run.error_code}` : ''}
                    </td>
                    <td>{run.methodology_version}</td>
                    <td>{new Date(run.created_at).toLocaleString()}</td>
                    <td>
                      <Button type="button" onClick={() => selectRun(run)}>
                        {selectedRun?.run_id === run.run_id
                          ? 'Selected'
                          : 'View run'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      {selectedRun ? (
        <>
          <section
            className="metrics-grid"
            aria-label="Selected evaluation run"
          >
            <Metric label="Run status" value={selectedRun.status} />
            <Metric
              label="Evaluation unit"
              value={
                stringValue(selectedRun.metrics?.evaluation_unit) ?? 'Pending'
              }
            />
            <Metric
              label="Employee-days"
              value={
                stringValue(selectedRun.metrics?.evaluation_unit_count) ??
                'Pending'
              }
            />
            <Metric label="Claim status" value={selectedRun.claim_status} />
          </section>
          <section
            className="card section-card"
            aria-labelledby="provenance-title"
          >
            <div className="section-title-row">
              <div>
                <h2 id="provenance-title">Evaluation provenance</h2>
                <p className="card-intro">
                  Download the verified development manifest with dataset,
                  configuration, methodology, and artifact checksums.
                </p>
              </div>
              <Button
                type="button"
                disabled={
                  selectedRun.status !== 'completed' ||
                  !selectedRun.result_manifest_sha256 ||
                  manifestDownloadingRunId === selectedRun.run_id
                }
                onClick={() => void downloadManifest(selectedRun)}
              >
                {manifestDownloadingRunId === selectedRun.run_id
                  ? 'Preparing download…'
                  : 'Download manifest'}
              </Button>
            </div>
            {selectedRun.result_manifest_sha256 ? (
              <p className="field-help">
                Manifest SHA-256:{' '}
                <code>{selectedRun.result_manifest_sha256}</code>
              </p>
            ) : (
              <p className="empty-state">
                Manifest becomes available after a run completes successfully.
              </p>
            )}
            {manifestError ? (
              <p className="import-state import-state-error" role="alert">
                {manifestError}
              </p>
            ) : null}
          </section>
          <section
            className="card section-card"
            aria-labelledby="comparison-title"
          >
            <div className="section-title-row">
              <h2 id="comparison-title">Detector comparison</h2>
              <span className="fixture-tag">
                {selectedRun.methodology_version}
              </span>
            </div>
            {selectedRun.status !== 'completed' ? (
              <p className="empty-state">
                Metrics and findings appear after the worker completes this run.
              </p>
            ) : comparisons && typeof comparisons === 'object' ? (
              <Comparison metrics={comparisons as Record<string, unknown>} />
            ) : (
              <p role="alert">
                Completed run does not contain comparison metrics.
              </p>
            )}
            <p className="below-table-note">
              Development experiment on synthetic data only. The methodology is
              provisional and not benchmarked.
            </p>
          </section>
          {selectedRun.status === 'completed' ? (
            <section
              className="card section-card"
              aria-labelledby="findings-title"
            >
              <div className="section-title-row">
                <h2 id="findings-title">Held-out findings</h2>
                <label>
                  Detector{' '}
                  <select
                    value={detector}
                    onChange={(event) => {
                      const next = event.target.value as Detector;
                      setDetector(next);
                      if (selectedRun) void loadFindings(selectedRun, next);
                    }}
                  >
                    {detectors.map((item) => (
                      <option key={item} value={item}>
                        {item.replaceAll('_', ' ')}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {findingsLoading ? <p role="status">Loading findings…</p> : null}
              {!findingsLoading && findings.length === 0 ? (
                <p className="empty-state">
                  No findings returned for this detector.
                </p>
              ) : null}
              {findings.length > 0 ? (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th scope="col">Employee</th>
                        <th scope="col">UTC day</th>
                        <th scope="col">Score</th>
                        <th scope="col">Severity</th>
                        <th scope="col">Reason codes</th>
                        <th scope="col">Evidence events</th>
                      </tr>
                    </thead>
                    <tbody>
                      {findings.map((finding) => (
                        <tr key={finding.finding_id}>
                          <td>{finding.employee_id}</td>
                          <td>{finding.employee_day_utc}</td>
                          <td>{finding.score}</td>
                          <td>{finding.severity}</td>
                          <td>{finding.reason_codes.join(', ') || '—'}</td>
                          <td>
                            {finding.evidence_event_ids.join(', ') || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </section>
          ) : null}
        </>
      ) : null}
      <Notice title="Research integrity" className="evaluation-note">
        These results use synthetic fixtures and a provisional method. They do
        not establish real-world performance; detection delay and
        scenario-family comparisons are unavailable in the current data
        contract.
      </Notice>
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <article className="metric-card">
      <p className="metric-label">{label}</p>
      <strong className="metric-value">{value}</strong>
    </article>
  );
}

function Comparison({ metrics }: { metrics: Record<string, unknown> }) {
  const reports = detectors.map((name) => ({
    name,
    report: asRecord(asRecord(metrics[name])?.report),
  }));
  const scenarioRows = reports.flatMap(({ name, report }) => {
    const rows = report?.by_scenario;
    if (!Array.isArray(rows)) return [];
    return rows.flatMap((value) => {
      const scenario = asRecord(value);
      const scenarioMetrics = asRecord(scenario?.metrics);
      if (typeof scenario?.scenario_id !== 'string' || !scenarioMetrics) {
        return [];
      }
      return [
        {
          detector: name,
          scenarioId: scenario.scenario_id,
          metrics: scenarioMetrics,
        },
      ];
    });
  });

  return (
    <div className="evaluation-report-tables">
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">Method</th>
              <th scope="col">Alert threshold</th>
              <th scope="col">Precision</th>
              <th scope="col">Recall</th>
              <th scope="col">False-positive rate</th>
              <th scope="col">Alerts / 100 employee-days</th>
            </tr>
          </thead>
          <tbody>
            {reports.map(({ name, report }) => {
              const detectorResult = asRecord(metrics[name]);
              const scores = asRecord(report?.metrics);
              return (
                <tr key={name}>
                  <td>{name.replaceAll('_', ' ')}</td>
                  <td>{formatNumber(detectorResult?.threshold)}</td>
                  <td>{formatRatioWithCount(scores?.precision)}</td>
                  <td>{formatRatioWithCount(scores?.recall)}</td>
                  <td>{formatRatioWithCount(scores?.false_positive_rate)}</td>
                  <td>
                    {formatRateWithCount(scores?.alerts_per_100_employee_days)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <section aria-labelledby="confusion-title">
        <h3 id="confusion-title">Confusion counts</h3>
        <p className="field-help">
          Employee-days counted as true or false positives and negatives at each
          detector’s frozen threshold.
        </p>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Method</th>
                <th scope="col">True positives</th>
                <th scope="col">False positives</th>
                <th scope="col">True negatives</th>
                <th scope="col">False negatives</th>
                <th scope="col">Employee-days</th>
              </tr>
            </thead>
            <tbody>
              {reports.map(({ name, report }) => {
                const scores = asRecord(report?.metrics);
                const confusion = asRecord(scores?.confusion);
                return (
                  <tr key={name}>
                    <td>{name.replaceAll('_', ' ')}</td>
                    <td>{formatCount(confusion?.true_positive)}</td>
                    <td>{formatCount(confusion?.false_positive)}</td>
                    <td>{formatCount(confusion?.true_negative)}</td>
                    <td>{formatCount(confusion?.false_negative)}</td>
                    <td>{formatCount(scores?.unit_count)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="scenario-metrics-title">
        <h3 id="scenario-metrics-title">Per-scenario metrics</h3>
        <p className="field-help">
          Scenario-specific held-out results use the same employee-day unit as
          the aggregate comparison.
        </p>
        {scenarioRows.length === 0 ? (
          <p className="empty-state">
            Scenario-level results are unavailable for this run.
          </p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Method</th>
                  <th scope="col">Scenario</th>
                  <th scope="col">Employee-days</th>
                  <th scope="col">Precision</th>
                  <th scope="col">Recall</th>
                  <th scope="col">False-positive rate</th>
                </tr>
              </thead>
              <tbody>
                {scenarioRows.map(({ detector, scenarioId, metrics }) => (
                  <tr key={`${detector}:${scenarioId}`}>
                    <td>{detector.replaceAll('_', ' ')}</td>
                    <td>{scenarioId.replaceAll('_', ' ')}</td>
                    <td>{formatCount(metrics.unit_count)}</td>
                    <td>{formatRatioWithCount(metrics.precision)}</td>
                    <td>{formatRatioWithCount(metrics.recall)}</td>
                    <td>{formatRatioWithCount(metrics.false_positive_rate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function formatCount(value: unknown): string {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? String(value)
    : 'Unavailable';
}

function formatNumber(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value)
    ? String(value)
    : 'Unavailable';
}

function formatRatioWithCount(value: unknown): string {
  const ratio = asRecord(value);
  if (!ratio) return 'Unavailable';
  return `${formatMetricRatio(ratio)} (${formatCount(ratio.numerator)}/${formatCount(ratio.denominator)})`;
}

function formatRateWithCount(value: unknown): string {
  const ratio = asRecord(value);
  if (!ratio) return 'Unavailable';
  return `${formatAlertsPer100EmployeeDays(ratio)} (${formatCount(ratio.numerator)}/${formatCount(ratio.denominator)})`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : null;
}
