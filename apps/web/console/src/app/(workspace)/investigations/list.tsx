'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { components } from '@fisheye/api-client';
import { Button, Notice } from '@fisheye/ui';
import { EmptyState } from '../shared';
import { apiBaseUrl, apiErrorMessage, investigationApi } from './data';

type Run = components['schemas']['EvaluationRunResponse'];
type Finding = components['schemas']['RunFindingResponse'];
type RequestState = 'loading' | 'ready' | 'error';

export function InvestigationList() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [selectedRunId, setSelectedRunId] = useState('');
  const [detector, setDetector] = useState<Finding['detector']>('contextual');
  const [findings, setFindings] = useState<Finding[]>([]);
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [runState, setRunState] = useState<RequestState>(
    apiBaseUrl ? 'loading' : 'error',
  );
  const [findingsState, setFindingsState] = useState<RequestState>('loading');
  const [error, setError] = useState(
    apiBaseUrl
      ? ''
      : 'Set NEXT_PUBLIC_API_BASE_URL to connect the development API.',
  );
  const [reload, setReload] = useState(0);
  const limit = 50;
  const selectedRun = runs.find((run) => run.run_id === selectedRunId);

  useEffect(() => {
    let current = true;
    if (!apiBaseUrl) return;
    void (async () => {
      try {
        const {
          data,
          error: apiError,
          response,
        } = await investigationApi().GET('/api/v1/runs', {
          params: { query: { limit: 50, offset: 0 } },
        });
        if (!response.ok || !data)
          throw new Error(
            typeof apiError?.detail === 'string'
              ? apiError.detail
              : `Evaluation runs could not be loaded (${response.status}).`,
          );
        if (!current) return;
        setRuns(data.items);
        setFindingsState('loading');
        setSelectedRunId((currentId) => {
          if (data.items.some((run) => run.run_id === currentId))
            return currentId;
          return (
            data.items.find((run) => run.status === 'completed')?.run_id ??
            data.items[0]?.run_id ??
            ''
          );
        });
        setRunState('ready');
      } catch (cause) {
        if (!current) return;
        setError(
          apiErrorMessage(cause, 'Evaluation runs could not be loaded.'),
        );
        setRunState('error');
      }
    })();
    return () => {
      current = false;
    };
  }, [reload]);

  useEffect(() => {
    let current = true;
    if (!selectedRun || selectedRun.status !== 'completed') {
      return () => {
        current = false;
      };
    }
    void (async () => {
      try {
        const {
          data,
          error: apiError,
          response,
        } = await investigationApi().GET('/api/v1/runs/{run_id}/findings', {
          params: {
            path: { run_id: selectedRun.run_id },
            query: { detector, limit, offset },
          },
        });
        if (!response.ok || !data)
          throw new Error(
            typeof apiError?.detail === 'string'
              ? apiError.detail
              : `Findings could not be loaded (${response.status}).`,
          );
        if (!current) return;
        setFindings(data.items);
        setTotal(data.total);
        setFindingsState('ready');
      } catch (cause) {
        if (!current) return;
        setError(apiErrorMessage(cause, 'Findings could not be loaded.'));
        setFindingsState('error');
      }
    })();
    return () => {
      current = false;
    };
  }, [detector, offset, selectedRun, reload]);

  const visibleFindings = useMemo(
    () =>
      findings.filter((finding) =>
        `${finding.employee_id} ${finding.employee_day_utc} ${finding.reason_codes.join(' ')}`
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
    [findings, search],
  );

  function retry() {
    if (!apiBaseUrl) {
      setRunState('error');
      setError('Set NEXT_PUBLIC_API_BASE_URL to connect the development API.');
      return;
    }
    setRunState('loading');
    setError('');
    setReload((value) => value + 1);
  }

  if (runState === 'loading') {
    return (
      <p className="card section-card" role="status">
        Loading evaluation runs…
      </p>
    );
  }
  if (runState === 'error') {
    return (
      <div role="alert">
        <Notice title="Could not connect to evaluation runs">
          <p>{error}</p>
          <Button variant="secondary" onClick={retry}>
            Retry
          </Button>
        </Notice>
      </div>
    );
  }
  if (runs.length === 0) {
    return (
      <EmptyState title="No evaluation runs yet">
        Start a development evaluation with a synthetic CSV and employee
        context. Completed findings will appear here.
        <span className="empty-state-action">
          <Link className="fe-button fe-button-primary" href="/scenarios">
            Open scenario lab
          </Link>
        </span>
      </EmptyState>
    );
  }

  return (
    <section
      className="card section-card"
      aria-labelledby="investigations-table-title"
    >
      <div className="section-title-row">
        <div>
          <h2 id="investigations-table-title">Findings from evaluation runs</h2>
          <p className="card-intro">
            Stored employee-day findings, evidence-led and synthetic only.
          </p>
        </div>
        <span className="fixture-tag">Synthetic data</span>
      </div>
      <Notice title="Development data">
        The current API and local demo session are for development only. Reviews
        are recorded as unauthenticated local-development activity.
      </Notice>
      <div className="filters">
        <div className="field">
          <label htmlFor="investigation-run">Evaluation run</label>
          <select
            id="investigation-run"
            value={selectedRunId}
            onChange={(event) => {
              setSelectedRunId(event.target.value);
              setFindings([]);
              setFindingsState('loading');
              setTotal(0);
              setOffset(0);
            }}
          >
            {runs.map((run) => (
              <option key={run.run_id} value={run.run_id}>
                {run.run_id.slice(0, 8)} · {run.status} · {run.created_at}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="investigation-detector">Detector</label>
          <select
            id="investigation-detector"
            value={detector}
            onChange={(event) => {
              setDetector(event.target.value as Finding['detector']);
              setFindingsState('loading');
              setOffset(0);
            }}
          >
            <option value="contextual">FishEye contextual</option>
            <option value="simple_rule">Simple rules</option>
            <option value="tuned_rules">Tuned rules</option>
          </select>
        </div>
        <div className="field search-field">
          <label htmlFor="investigation-search">Search this page</label>
          <input
            id="investigation-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Employee, date or reason code"
          />
        </div>
      </div>

      {selectedRun?.status !== 'completed' ? (
        <EmptyState title={`Run ${selectedRun?.status ?? 'unavailable'}`}>
          Findings appear only after the worker has completed this evaluation.
        </EmptyState>
      ) : findingsState === 'loading' ? (
        <p role="status" className="below-table-note">
          Loading stored findings…
        </p>
      ) : findingsState === 'error' ? (
        <div role="alert">
          <Notice title="Findings could not be loaded">
            <p>{error}</p>
            <Button variant="secondary" onClick={retry}>
              Retry
            </Button>
          </Notice>
        </div>
      ) : total === 0 ? (
        <EmptyState title="No findings in this run and detector">
          This is a real result from the selected completed run. A zero finding
          count does not mean that the dataset contains no threats; review the
          evaluation metrics and missed examples.
        </EmptyState>
      ) : (
        <>
          <p className="below-table-note" role="status">
            Showing {offset + 1}–{Math.min(offset + limit, total)} of {total}{' '}
            findings. Search filters the rows on this page only.
          </p>
          <div className="table-wrap">
            <table className="data-table">
              <caption className="visually-hidden">
                Stored findings for run {selectedRun.run_id}, detector{' '}
                {detector}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Employee</th>
                  <th scope="col">UTC day</th>
                  <th scope="col">Priority score</th>
                  <th scope="col">Severity</th>
                  <th scope="col">Reason codes</th>
                  <th scope="col">Evidence</th>
                </tr>
              </thead>
              <tbody>
                {visibleFindings.map((finding) => (
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
                    <td>{finding.evidence_event_ids.length} source events</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {visibleFindings.length === 0 && (
            <p className="below-table-note" role="status">
              No findings on this page match that search.
            </p>
          )}
          <div className="table-actions">
            <Button
              variant="secondary"
              disabled={offset === 0}
              onClick={() => {
                setFindingsState('loading');
                setOffset(Math.max(0, offset - limit));
              }}
            >
              Previous page
            </Button>
            <Button
              variant="secondary"
              disabled={offset + limit >= total}
              onClick={() => {
                setFindingsState('loading');
                setOffset(offset + limit);
              }}
            >
              Next page
            </Button>
          </div>
        </>
      )}
      <p className="below-table-note">
        Run {selectedRun?.run_id}; {selectedRun?.claim_status}. Scores are
        investigation priority, not proof of intent.
      </p>
    </section>
  );
}
