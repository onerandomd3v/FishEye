'use client';

import { useState, type FormEvent } from 'react';
import { Button } from '@fisheye/ui';

type ValidationResponse = {
  valid: boolean;
  schema_version: string;
  row_count: number;
  employee_day_count: number;
  errors: string[];
  persisted: false;
  run_created: false;
};

type ImportState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'success'; result: ValidationResponse }
  | { status: 'invalid'; result: ValidationResponse }
  | { status: 'error'; message: string };

const maximumBytes = 10 * 1024 * 1024;

export function DatasetImport() {
  const [file, setFile] = useState<File | null>(null);
  const [confirmedSynthetic, setConfirmedSynthetic] = useState(false);
  const [state, setState] = useState<ImportState>({ status: 'idle' });

  async function validate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || !confirmedSynthetic) return;
    if (file.size > maximumBytes) {
      setState({
        status: 'error',
        message: 'Choose a CSV file smaller than 10 MiB.',
      });
      return;
    }

    const apiUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '');
    if (!apiUrl) {
      setState({
        status: 'error',
        message:
          'CSV validation API is not configured. Set NEXT_PUBLIC_API_BASE_URL and enable development CSV validation on the API.',
      });
      return;
    }

    setState({ status: 'submitting' });
    try {
      const response = await fetch(
        `${apiUrl}/api/v1/datasets/imports/validate`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'text/csv',
            'X-FishEye-Synthetic-Data-Confirmed': 'true',
          },
          body: file,
        },
      );
      const body = (await response.json()) as
        ValidationResponse | { detail?: string };

      if (!response.ok) {
        throw new Error(
          'detail' in body && body.detail
            ? body.detail
            : `Validation request failed (${response.status}).`,
        );
      }

      const result = body as ValidationResponse;
      setState({
        status: result.valid ? 'success' : 'invalid',
        result,
      });
    } catch (error) {
      setState({
        status: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Could not reach the validation API. Check the connection and try again.',
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
          <p className="metric-label">SYNTHETIC DATA · SCHEMA V1</p>
          <h2 id="dataset-import-title">Validate a CSV dataset</h2>
          <p className="card-intro">
            Check the event format before an import workflow is available.
            Validation does not save the file or start a detection run.
          </p>
        </div>
        <a
          className="template-link"
          href="/templates/fisheye-events-v1.csv"
          download
        >
          Download CSV template
        </a>
      </div>

      <form className="dataset-import-form" onSubmit={validate}>
        <div className="field">
          <label htmlFor="synthetic-csv">CSV file</label>
          <input
            id="synthetic-csv"
            type="file"
            accept=".csv,text/csv"
            aria-describedby="csv-file-help"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setState({ status: 'idle' });
            }}
          />
          <p className="field-help" id="csv-file-help">
            UTF-8 CSV, maximum 10 MiB. Uses the employee-day evaluation unit.
          </p>
        </div>

        <label className="synthetic-confirmation">
          <input
            type="checkbox"
            checked={confirmedSynthetic}
            onChange={(event) => setConfirmedSynthetic(event.target.checked)}
          />
          <span>
            I confirm this file contains synthetic employee and event data only.
          </span>
        </label>
        <p className="field-help synthetic-caveat">
          FishEye cannot verify data provenance from CSV contents. Do not upload
          real employee, customer, bank, credential, or production log data.
        </p>

        <div className="dataset-import-actions">
          <Button
            type="submit"
            disabled={
              !file || !confirmedSynthetic || state.status === 'submitting'
            }
          >
            {state.status === 'submitting' ? 'Checking CSV…' : 'Validate CSV'}
          </Button>
          {file ? <span className="selected-file">{file.name}</span> : null}
        </div>
      </form>

      {state.status === 'submitting' ? (
        <p className="import-state" role="status">
          Checking the CSV schema…
        </p>
      ) : null}
      {state.status === 'error' ? (
        <div className="import-state import-state-error" role="alert">
          <strong>Validation could not be completed</strong>
          <p>{state.message}</p>
        </div>
      ) : null}
      {state.status === 'invalid' ? (
        <ValidationSummary result={state.result} />
      ) : null}
      {state.status === 'success' ? (
        <ValidationSummary result={state.result} />
      ) : null}
    </section>
  );
}

function ValidationSummary({ result }: { result: ValidationResponse }) {
  return (
    <div
      className={`import-state${result.valid ? '' : ' import-state-error'}`}
      role={result.valid ? 'status' : 'alert'}
    >
      <strong>
        {result.valid ? 'CSV schema is valid' : 'CSV needs corrections'}
      </strong>
      <p>
        {result.row_count} event rows · {result.employee_day_count}{' '}
        employee-days · {result.schema_version}
      </p>
      {result.errors.length > 0 ? (
        <ul className="import-errors">
          {result.errors.map((error, index) => (
            <li key={`${index}-${error}`}>{error}</li>
          ))}
        </ul>
      ) : null}
      <p className="import-result-caveat">
        This is a format check only. No dataset was saved, no detector ran, and
        no risk score or evaluation result was created.
      </p>
    </div>
  );
}
