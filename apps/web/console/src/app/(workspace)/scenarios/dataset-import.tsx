'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Button } from '@fisheye/ui';
import {
  createFishEyeApiClient,
  postCsv,
  type components,
} from '@fisheye/api-client';
import { apiBaseUrl } from '../investigations/data';
import { formatDetectorName } from '../evaluation-format';

type ValidationResponse = components['schemas']['DatasetValidationResponse'];
type RunResponse = components['schemas']['EvaluationRunResponse'];
type FlowState =
  | { status: 'idle' }
  | { status: 'working'; step: string }
  | { status: 'error'; message: string }
  | { status: 'invalid'; result: ValidationResponse }
  | { status: 'completed'; datasetId: string; run: RunResponse };

const maximumBytes = 10 * 1024 * 1024;
const pause = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

function apiMessage(error: unknown, status: number): string {
  if (typeof error === 'object' && error !== null && 'detail' in error) {
    const detail = (error as { detail?: unknown }).detail;
    if (typeof detail === 'string') return detail;
    if (typeof detail === 'object' && detail !== null && 'errors' in detail) {
      const errors = (detail as { errors?: unknown }).errors;
      if (Array.isArray(errors)) return errors.join(' ');
    }
  }
  return `The API request failed (${status}).`;
}

function isValidationResponse(value: unknown): value is ValidationResponse {
  if (typeof value !== 'object' || value === null) return false;
  const result = value as Record<string, unknown>;
  return (
    typeof result.valid === 'boolean' &&
    typeof result.schema_version === 'string' &&
    typeof result.row_count === 'number' &&
    typeof result.employee_day_count === 'number' &&
    Array.isArray(result.errors)
  );
}

export function DatasetImport({
  initialCsv = null,
  initialContextFile = null,
  onWorkingChange,
}: {
  initialCsv?: File | null;
  initialContextFile?: File | null;
  onWorkingChange?: (working: boolean) => void;
} = {}) {
  const idempotencyKeyRef = useRef<string | null>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const contextInputRef = useRef<HTMLInputElement>(null);
  const [csv, setCsv] = useState<File | null>(initialCsv);
  const [contextFile, setContextFile] = useState<File | null>(
    initialContextFile,
  );
  const [confirmedSynthetic, setConfirmedSynthetic] = useState(false);
  const [state, setState] = useState<FlowState>({ status: 'idle' });

  function removeCsv() {
    setCsv(null);
    if (csvInputRef.current) csvInputRef.current.value = '';
    setConfirmedSynthetic(false);
    idempotencyKeyRef.current = null;
    setState({ status: 'idle' });
  }

  function removeContextFile() {
    setContextFile(null);
    if (contextInputRef.current) contextInputRef.current.value = '';
    setConfirmedSynthetic(false);
    idempotencyKeyRef.current = null;
    setState({ status: 'idle' });
  }

  useEffect(() => {
    onWorkingChange?.(state.status === 'working');
  }, [onWorkingChange, state.status]);

  async function startEvaluation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!csv || !contextFile || !confirmedSynthetic) return;
    if (csv.size > maximumBytes || contextFile.size > 256 * 1024) {
      setState({
        status: 'error',
        message:
          'CSV files must be under 10 MiB and context JSON under 256 KiB.',
      });
      return;
    }
    const apiUrl = apiBaseUrl();
    if (!apiUrl) {
      setState({
        status: 'error',
        message: 'The FishEye API is not configured.',
      });
      return;
    }
    const client = createFishEyeApiClient(apiUrl);
    setState({
      status: 'working',
      step: 'Checking the CSV and context files…',
    });
    try {
      let context: unknown;
      try {
        context = JSON.parse(await contextFile.text());
      } catch {
        throw new Error('Context file must contain valid JSON.');
      }
      if (
        typeof context !== 'object' ||
        context === null ||
        Array.isArray(context)
      ) {
        throw new Error(
          'Context JSON must be an object matching the FishEye context template.',
        );
      }
      const syntheticContext = context as Record<string, unknown>;

      const validation = await postCsv(
        client,
        '/api/v1/datasets/imports/validate',
        csv,
      );
      if (!validation.response.ok)
        throw new Error(
          apiMessage(validation.error, validation.response.status),
        );
      if (!isValidationResponse(validation.data))
        throw new Error('CSV validation returned an unexpected response.');
      if (!validation.data.valid) {
        setState({ status: 'invalid', result: validation.data });
        return;
      }
      if (validation.data.schema_version !== 'fisheye.events.v2') {
        throw new Error(
          'Evaluation runs require an events v2 CSV with baseline, calibration, and evaluation partitions.',
        );
      }

      setState({
        status: 'working',
        step: 'Importing your files…',
      });
      const imported = await postCsv(client, '/api/v1/datasets/imports', csv);
      if (!imported.response.ok || !imported.data)
        throw new Error(apiMessage(imported.error, imported.response.status));

      const idempotencyKey = (idempotencyKeyRef.current ??=
        crypto.randomUUID());
      setState({
        status: 'working',
        step: 'Creating a durable evaluation run…',
      });
      const queued = await client.POST('/api/v1/runs', {
        headers: { 'Idempotency-Key': idempotencyKey },
        body: {
          dataset_id: imported.data.dataset_id,
          synthetic_context: syntheticContext,
        },
      });
      if (!queued.response.ok || !queued.data)
        throw new Error(apiMessage(queued.error, queued.response.status));

      let run = queued.data;
      for (
        let attempt = 0;
        attempt < 60 && (run.status === 'queued' || run.status === 'running');
        attempt += 1
      ) {
        setState({
          status: 'working',
          step:
            run.status === 'queued'
              ? 'Waiting for a worker to claim this run…'
              : 'Worker is processing the evaluation…',
        });
        await pause(2000);
        const latest = await client.GET('/api/v1/runs/{run_id}', {
          params: { path: { run_id: run.run_id } },
        });
        if (!latest.response.ok || !latest.data)
          throw new Error(apiMessage(latest.error, latest.response.status));
        run = latest.data;
      }
      if (run.status === 'queued' || run.status === 'running') {
        throw new Error(
          'This run is still processing. Retry with the same files to reconnect to it.',
        );
      }
      idempotencyKeyRef.current = null;
      setState({
        status: 'completed',
        datasetId: imported.data.dataset_id,
        run,
      });
    } catch (error) {
      setState({
        status: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'The evaluation could not be started.',
      });
    }
  }

  return (
    <section
      className="card card-pad dataset-import"
      aria-labelledby="dataset-import-title"
    >
      <div className="dataset-import-heading">
        <div>
          <h2 id="dataset-import-title">Run an evaluation</h2>
          <p className="card-intro">
            Choose an events CSV and a file with employee roles and schedules.
          </p>
        </div>
        <a
          className="template-link"
          href="/templates/fisheye-events-v2.csv"
          download
        >
          Download CSV template
        </a>
      </div>

      <form className="dataset-import-form" onSubmit={startEvaluation}>
        <div className="field">
          <label htmlFor="synthetic-csv">Events CSV</label>
          <input
            ref={csvInputRef}
            id="synthetic-csv"
            type="file"
            accept=".csv,text/csv"
            disabled={state.status === 'working'}
            onChange={(event) => {
              setCsv(event.target.files?.[0] ?? null);
              idempotencyKeyRef.current = null;
              setConfirmedSynthetic(false);
              setState({ status: 'idle' });
            }}
          />
          {csv ? (
            <div className="selected-upload">
              <span className="selected-file">{csv.name}</span>
              <button
                className="file-remove-button"
                type="button"
                disabled={state.status === 'working'}
                onClick={removeCsv}
                aria-label={`Remove events CSV ${csv.name}`}
              >
                Remove
              </button>
            </div>
          ) : null}
          <p className="field-help">
            Include baseline data, calibration data for tuning, and evaluation
            data for comparison. Maximum 10 MiB.
          </p>
        </div>
        <div className="field">
          <label htmlFor="synthetic-context">Roles and schedules (JSON)</label>
          <input
            ref={contextInputRef}
            id="synthetic-context"
            type="file"
            accept=".json,application/json"
            disabled={state.status === 'working'}
            onChange={(event) => {
              setContextFile(event.target.files?.[0] ?? null);
              idempotencyKeyRef.current = null;
              setConfirmedSynthetic(false);
              setState({ status: 'idle' });
            }}
          />
          {contextFile ? (
            <div className="selected-upload">
              <span className="selected-file">{contextFile.name}</span>
              <button
                className="file-remove-button"
                type="button"
                disabled={state.status === 'working'}
                onClick={removeContextFile}
                aria-label={`Remove context JSON ${contextFile.name}`}
              >
                Remove
              </button>
            </div>
          ) : null}
          <p className="field-help">
            List each role&apos;s allowed systems and each employee&apos;s work
            hours.{' '}
            <a href="/templates/fisheye-context-v1.json" download>
              Download context template
            </a>
          </p>
        </div>
        <label className="synthetic-confirmation">
          <input
            type="checkbox"
            checked={confirmedSynthetic}
            onChange={(event) => setConfirmedSynthetic(event.target.checked)}
          />
          <span>
            I confirm both files contain fictional people and activity only.
          </span>
        </label>
        <p className="field-help synthetic-caveat">
          Do not upload real employee, customer, bank, credential, or production
          log data.
        </p>
        <div className="dataset-import-actions">
          <Button
            type="submit"
            disabled={
              !csv ||
              !contextFile ||
              !confirmedSynthetic ||
              state.status === 'working'
            }
          >
            {state.status === 'working' ? 'Processing…' : 'Run evaluation'}
          </Button>
        </div>
      </form>

      {state.status === 'working' ? (
        <p className="import-state" role="status">
          {state.step}
        </p>
      ) : null}
      {state.status === 'error' ? (
        <div className="import-state import-state-error" role="alert">
          <strong>Evaluation could not be completed</strong>
          <p>{state.message}</p>
        </div>
      ) : null}
      {state.status === 'invalid' ? (
        <div className="import-state import-state-error" role="alert">
          <strong>CSV needs corrections</strong>
          <p>{state.result.errors.join(' ') || 'The CSV is invalid.'}</p>
        </div>
      ) : null}
      {state.status === 'completed' ? (
        <RunSummary datasetId={state.datasetId} run={state.run} />
      ) : null}
    </section>
  );
}

function RunSummary({
  datasetId,
  run,
}: {
  datasetId: string;
  run: RunResponse;
}) {
  return (
    <div className="import-state" role="status">
      <strong>
        {run.status === 'completed'
          ? 'Evaluation complete'
          : run.status === 'failed'
            ? 'Evaluation failed'
            : `Run ${run.status}`}
      </strong>
      {run.status === 'failed' ? (
        <p>The run could not be processed. Check the files and try again.</p>
      ) : null}
      {run.metrics ? <RunMetrics metrics={run.metrics} /> : null}
      <Link className="inline-guide-link" href="/guide#results">
        About evaluation results
      </Link>
      <details className="run-technical-details">
        <summary>Run details</summary>
        <dl className="dataset-import-details">
          <div>
            <dt>Dataset</dt>
            <dd>{datasetId}</dd>
          </div>
          <div>
            <dt>Run</dt>
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
      </details>
    </div>
  );
}

function RunMetrics({ metrics }: { metrics: Record<string, unknown> }) {
  const comparisons = metrics.comparisons;
  if (typeof comparisons !== 'object' || comparisons === null) return null;
  return (
    <div className="table-wrap">
      <table className="data-table">
        <caption>Results on the evaluation data</caption>
        <thead>
          <tr>
            <th scope="col">Method</th>
            <th scope="col">Alerts correct</th>
            <th scope="col">Threats caught</th>
            <th scope="col">False alarm rate</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(comparisons).map(([name, item]) => {
            const report =
              typeof item === 'object' && item !== null
                ? (item as Record<string, unknown>).report
                : null;
            const values =
              typeof report === 'object' && report !== null
                ? ((report as Record<string, unknown>).metrics as
                    Record<string, unknown> | undefined)
                : undefined;
            return (
              <tr key={name}>
                <td>{formatDetectorName(name)}</td>
                <td>{formatRatio(values?.precision)}</td>
                <td>{formatRatio(values?.recall)}</td>
                <td>{formatRatio(values?.false_positive_rate)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function formatRatio(value: unknown): string {
  if (typeof value !== 'object' || value === null) return 'Unavailable';
  const ratio = value as Record<string, unknown>;
  if (typeof ratio.value !== 'number' || !Number.isFinite(ratio.value)) {
    return 'Unavailable';
  }
  const percent = `${(ratio.value * 100).toFixed(1)}%`;
  return typeof ratio.numerator === 'number' &&
    typeof ratio.denominator === 'number'
    ? `${percent} (${ratio.numerator} of ${ratio.denominator})`
    : percent;
}
