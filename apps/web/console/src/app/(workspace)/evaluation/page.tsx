'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, Notice } from '@fisheye/ui';
import { createFishEyeApiClient, type components } from '@fisheye/api-client';
import { PageHeading } from '../shared';
import {
  formatAlertsPer100EmployeeDays,
  formatMetricRatio,
} from '../evaluation-format';

type Run = components['schemas']['EvaluationRunResponse'];
type Finding = components['schemas']['RunFindingResponse'];
type Detector = components['schemas']['RunFindingResponse']['detector'];

const detectors: Detector[] = ['simple_rule', 'tuned_rules', 'contextual'];
const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '');

export default function EvaluationPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [selectedRun, setSelectedRun] = useState<Run | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [detector, setDetector] = useState<Detector>('contextual');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [findingsLoading, setFindingsLoading] = useState(false);

  const loadRuns = useCallback(async () => {
    if (!baseUrl) {
      setError(
        'Development API is not configured. Set NEXT_PUBLIC_API_BASE_URL to load runs.',
      );
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
    if (!baseUrl || run.status !== 'completed') return;
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
      setFindings(result.data.items);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Findings could not be loaded.',
      );
    } finally {
      setFindingsLoading(false);
    }
  }

  function selectRun(run: Run) {
    setSelectedRun(run);
    setFindings([]);
    if (run.status === 'completed') void loadFindings(run, detector);
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
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th scope="col">Method</th>
            <th scope="col">Precision</th>
            <th scope="col">Recall</th>
            <th scope="col">False-positive rate</th>
            <th scope="col">Alerts / 100 employee-days</th>
          </tr>
        </thead>
        <tbody>
          {detectors.map((name) => {
            const item = asRecord(metrics[name]);
            const report = asRecord(item?.report);
            const scores = asRecord(report?.metrics);
            return (
              <tr key={name}>
                <td>{name.replaceAll('_', ' ')}</td>
                <td>{formatMetricRatio(scores?.precision)}</td>
                <td>{formatMetricRatio(scores?.recall)}</td>
                <td>{formatMetricRatio(scores?.false_positive_rate)}</td>
                <td>
                  {formatAlertsPer100EmployeeDays(
                    scores?.alerts_per_100_employee_days,
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
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
