'use client';

import { useState, type FormEvent } from 'react';
import { Button } from '@fisheye/ui';
import { createFishEyeApiClient, type components } from '@fisheye/api-client';

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
  return `The development API request failed (${status}).`;
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

export function DatasetImport() {
  const [csv, setCsv] = useState<File | null>(null);
  const [contextFile, setContextFile] = useState<File | null>(null);
  const [confirmedSynthetic, setConfirmedSynthetic] = useState(false);
  const [state, setState] = useState<FlowState>({ status: 'idle' });

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
    const apiUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '');
    if (!apiUrl) {
      setState({
        status: 'error',
        message:
          'Development API is not configured. Set NEXT_PUBLIC_API_BASE_URL.',
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

      const validation = await client.POST(
        '/api/v1/datasets/imports/validate',
        {
          headers: {
            'Content-Type': 'text/csv',
            'X-FishEye-Synthetic-Data-Confirmed': 'true',
          },
          body: await csv.text(),
        },
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
        step: 'Importing the confirmed synthetic dataset…',
      });
      const imported = await client.POST('/api/v1/datasets/imports', {
        headers: {
          'Content-Type': 'text/csv',
          'X-FishEye-Synthetic-Data-Confirmed': 'true',
        },
        body: await csv.text(),
      });
      if (!imported.response.ok || !imported.data)
        throw new Error(apiMessage(imported.error, imported.response.status));

      const idempotencyKey = crypto.randomUUID();
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
          <p className="metric-label">DEVELOPMENT · SYNTHETIC DATA ONLY</p>
          <h2 id="dataset-import-title">Run an evaluation</h2>
          <p className="card-intro">
            Upload an events v2 CSV and its employee context JSON. The API
            stores the dataset, queues a durable run, and a worker processes it.
            The experimental method has not been benchmarked.
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
          <label htmlFor="synthetic-csv">Synthetic events CSV</label>
          <input
            id="synthetic-csv"
            type="file"
            accept=".csv,text/csv"
            disabled={state.status === 'working'}
            onChange={(event) => {
              setCsv(event.target.files?.[0] ?? null);
              setConfirmedSynthetic(false);
              setState({ status: 'idle' });
            }}
          />
          <p className="field-help">
            Events v2 with baseline, calibration, and evaluation partitions;
            maximum 10 MiB.
          </p>
        </div>
        <div className="field">
          <label htmlFor="synthetic-context">
            Synthetic employee context JSON
          </label>
          <input
            id="synthetic-context"
            type="file"
            accept=".json,application/json"
            disabled={state.status === 'working'}
            onChange={(event) => {
              setContextFile(event.target.files?.[0] ?? null);
              setState({ status: 'idle' });
            }}
          />
          <p className="field-help">
            Must define role permissions and schedules for every role and
            employee in the CSV.{' '}
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
            I confirm both files contain synthetic employee and event data only.
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
            {state.status === 'working'
              ? 'Processing…'
              : 'Import and run evaluation'}
          </Button>
          {csv ? (
            <span className="selected-file">
              {csv.name}
              {contextFile ? ` · ${contextFile.name}` : ''}
            </span>
          ) : null}
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
          ? 'Evaluation run completed'
          : run.status === 'failed'
            ? 'Evaluation run failed'
            : `Run ${run.status}`}
      </strong>
      <p>
        Dataset {datasetId} · Run {run.run_id} · {run.methodology_version}
      </p>
      {run.error_code ? <p>Worker error: {run.error_code}</p> : null}
      {run.metrics ? <RunMetrics metrics={run.metrics} /> : null}
      <p className="import-result-caveat">
        {run.claim_status}. Synthetic development result only; this is not
        evidence of real-world detection performance.
      </p>
    </div>
  );
}

function RunMetrics({ metrics }: { metrics: Record<string, unknown> }) {
  const comparisons = metrics.comparisons;
  if (typeof comparisons !== 'object' || comparisons === null) return null;
  return (
    <div className="table-wrap">
      <table className="data-table">
        <caption>Held-out synthetic employee-day comparison</caption>
        <thead>
          <tr>
            <th scope="col">Method</th>
            <th scope="col">Precision</th>
            <th scope="col">Recall</th>
            <th scope="col">False-positive rate</th>
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
            const ratio = (key: string) => {
              const item = values?.[key];
              return typeof item === 'object' && item !== null
                ? (item as Record<string, unknown>).value
                : undefined;
            };
            return (
              <tr key={name}>
                <td>{name.replaceAll('_', ' ')}</td>
                <td>{percent(ratio('precision'))}</td>
                <td>{percent(ratio('recall'))}</td>
                <td>{percent(ratio('false_positive_rate'))}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function percent(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value)
    ? `${(value * 100).toFixed(1)}%`
    : 'Unavailable';
}
