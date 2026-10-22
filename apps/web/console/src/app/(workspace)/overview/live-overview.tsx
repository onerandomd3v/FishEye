'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { components } from '@fisheye/api-client';
import { Button, Notice } from '@fisheye/ui';
import { EmptyState, MetricCard } from '../shared';
import { apiBaseUrl, investigationApi } from '../investigations/data';

type Run = components['schemas']['EvaluationRunResponse'];
type Finding = components['schemas']['RunFindingResponse'];

function object(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

function count(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value)
    ? value.toLocaleString()
    : 'Not available';
}

export function LiveOverview() {
  const [run, setRun] = useState<Run | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [findingTotal, setFindingTotal] = useState(0);
  const [loading, setLoading] = useState(Boolean(apiBaseUrl()));
  const [error, setError] = useState(
    apiBaseUrl() ? '' : 'The FishEye API is not configured.',
  );
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let current = true;
    if (!apiBaseUrl()) return;
    void (async () => {
      try {
        let offset = 0;
        let latest: Run | undefined;
        let hasMore = true;
        while (hasMore) {
          const runsResult = await investigationApi().GET('/api/v1/runs', {
            params: { query: { limit: 50, offset } },
          });
          if (!runsResult.response.ok || !runsResult.data)
            throw new Error(
              `Evaluation runs could not be loaded (${runsResult.response.status}).`,
            );
          latest = runsResult.data.items.find(
            (item) => item.status === 'completed',
          );
          if (latest) break;
          hasMore =
            runsResult.data.has_more && runsResult.data.items.length > 0;
          offset += runsResult.data.items.length;
        }
        if (!latest) {
          if (current) {
            setRun(null);
            setFindings([]);
            setFindingTotal(0);
            setLoading(false);
          }
          return;
        }
        const findingsResult = await investigationApi().GET(
          '/api/v1/runs/{run_id}/findings',
          {
            params: {
              path: { run_id: latest.run_id },
              query: { detector: 'contextual', limit: 5, offset: 0 },
            },
          },
        );
        if (!findingsResult.response.ok || !findingsResult.data)
          throw new Error(
            `Findings could not be loaded (${findingsResult.response.status}).`,
          );
        if (!current) return;
        setRun(latest);
        setFindings(findingsResult.data.items);
        setFindingTotal(findingsResult.data.total);
        setLoading(false);
      } catch (cause) {
        if (!current) return;
        setError(
          cause instanceof Error
            ? cause.message
            : 'Overview data could not be loaded.',
        );
        setLoading(false);
      }
    })();
    return () => {
      current = false;
    };
  }, [reload]);

  function retry() {
    if (!apiBaseUrl()) {
      setError('The FishEye API is not configured.');
      return;
    }
    setLoading(true);
    setError('');
    setReload((value) => value + 1);
  }

  if (loading)
    return (
      <p className="card section-card" role="status">
        Loading stored evaluation results…
      </p>
    );
  if (error) {
    return (
      <div role="alert">
        <Notice title="Overview data could not be loaded">
          <p>{error}</p>
          <Button variant="secondary" onClick={retry}>
            Retry
          </Button>
        </Notice>
      </div>
    );
  }
  if (!run) {
    return (
      <EmptyState title="No completed evaluation runs">
        Overview counts and findings will appear after a development worker
        completes a run.
        <span className="empty-state-action">
          <Link className="fe-button fe-button-primary" href="/scenarios">
            Start a synthetic evaluation
          </Link>
        </span>
      </EmptyState>
    );
  }

  const metrics = object(run.metrics);
  const contextual = object(object(metrics.comparisons).contextual);
  const report = object(contextual.report);
  const reportMetrics = object(report.metrics);
  const confusion = object(reportMetrics.confusion);

  return (
    <>
      <Notice title="Synthetic development results">
        Run {run.run_id} · {run.claim_status}. These provisional results are not
        benchmark claims and are not validated on real banking activity.
      </Notice>
      <section
        className="metrics-grid"
        aria-label="Latest completed evaluation run metrics"
      >
        <MetricCard
          label="Employee-days evaluated"
          value={count(metrics.evaluation_unit_count)}
          help="Unit: employee-day UTC"
        />
        <MetricCard
          label="Contextual findings"
          value={findingTotal.toLocaleString()}
          help="From this completed run"
        />
        <MetricCard
          label="False positives"
          value={count(confusion.false_positive)}
          help="Evaluation split; contextual detector"
        />
        <MetricCard
          label="Missed threats"
          value={count(confusion.false_negative)}
          help="Evaluation split; contextual detector"
        />
      </section>
      <section className="card section-card" aria-labelledby="priority-title">
        <div className="section-title-row">
          <div>
            <h2 id="priority-title">Latest contextual findings</h2>
            <p className="card-intro">
              Stored employee-day findings from run {run.run_id.slice(0, 8)}.
            </p>
          </div>
          <span className="fixture-tag">Synthetic data</span>
        </div>
        {findings.length === 0 ? (
          <p className="below-table-note">
            No findings were returned for this detector in the selected run.
          </p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <caption className="visually-hidden">
                Latest contextual findings in a completed synthetic evaluation
                run
              </caption>
              <thead>
                <tr>
                  <th scope="col">Employee</th>
                  <th scope="col">UTC day</th>
                  <th scope="col">Score</th>
                  <th scope="col">Severity</th>
                  <th scope="col">Reasons</th>
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
                      {finding.reason_codes.join(', ') || 'No reason codes'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="below-table-note">
          Showing {findings.length} of {findingTotal.toLocaleString()} findings.
          Priority is not proof of intent.
        </p>
        <div className="table-actions">
          <Link className="fe-button fe-button-primary" href="/investigations">
            Review all findings
          </Link>
          <Link className="fe-button fe-button-secondary" href="/evaluation">
            View evaluation details
          </Link>
        </div>
      </section>
    </>
  );
}
