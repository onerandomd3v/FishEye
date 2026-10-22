'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Button, Notice } from '@fisheye/ui';
import { createFishEyeApiClient, type components } from '@fisheye/api-client';
import { PageHeading } from '../shared';
import { apiBaseUrl } from '../investigations/data';

type Run = components['schemas']['EvaluationRunResponse'];

export default function EvaluationPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
      if (!result.response.ok || !result.data) {
        throw new Error(`Run history could not be loaded (${result.response.status}).`);
      }
      setRuns(result.data.items);
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

  return (
    <>
      <PageHeading
        title="Evaluation"
        description="Choose a run to see its results."
        action={
          <div className="page-actions">
            <Link className="inline-guide-link" href="/guide#results">
              How to read results
            </Link>
            <Button type="button" onClick={() => void loadRuns()} disabled={loading}>
              {loading ? 'Refreshing…' : 'Refresh'}
            </Button>
          </div>
        }
      />
      <section className="card section-card" aria-labelledby="runs-title">
        <div className="section-title-row">
          <h2 id="runs-title">Runs</h2>
          {!loading && !error ? (
            <span className="section-count">{runs.length} shown</span>
          ) : null}
        </div>
        {loading && runs.length === 0 ? (
          <p className="below-table-note" role="status">
            Loading runs…
          </p>
        ) : null}
        {error ? (
          <div className="section-content" role="alert">
            <Notice title="Could not load runs">
              <p>{error}</p>
              <Button variant="secondary" onClick={() => void loadRuns()}>
                Try again
              </Button>
            </Notice>
          </div>
        ) : null}
        {!loading && !error && runs.length === 0 ? (
          <p className="empty-state">
            No runs yet. Start one in Scenario Lab.
            <span className="empty-state-action">
              <Link className="fe-button fe-button-primary" href="/scenarios">
                Start an evaluation
              </Link>
            </span>
          </p>
        ) : null}
        {runs.length > 0 ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Run</th>
                  <th scope="col">Status</th>
                  <th scope="col">Started</th>
                  <th scope="col">Details</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.run_id}>
                    <td>
                      <code>{run.run_id.slice(0, 8)}</code>
                    </td>
                    <td>{formatStatus(run.status)}</td>
                    <td>{new Date(run.created_at).toLocaleString()}</td>
                    <td>
                      <Link
                        className="fe-button fe-button-secondary"
                        href={`/evaluation/${encodeURIComponent(run.run_id)}`}
                        aria-label={`View run ${run.run_id.slice(0, 8)}`}
                      >
                        View run
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </>
  );
}

function formatStatus(status: string): string {
  const label = status.replaceAll('_', ' ');
  return `${label.charAt(0).toUpperCase()}${label.slice(1)}`;
}
