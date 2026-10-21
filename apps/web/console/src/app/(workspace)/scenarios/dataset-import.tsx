'use client';

import { useState, type FormEvent } from 'react';
import { Button } from '@fisheye/ui';
import { createFishEyeApiClient, type components } from '@fisheye/api-client';

type ValidationResponse = components['schemas']['DatasetValidationResponse'];
type DatasetImportResponse = components['schemas']['DatasetImportResponse'];

type ImportState =
  | { status: 'idle' }
  | { status: 'validating' }
  | { status: 'validated'; validation: ValidationResponse }
  | { status: 'invalid'; validation: ValidationResponse }
  | { status: 'importing'; validation: ValidationResponse }
  | {
      status: 'imported';
      validation: ValidationResponse;
      result: DatasetImportResponse;
    }
  | {
      status: 'error';
      operation: 'validation' | 'import';
      message: string;
      validation?: ValidationResponse;
    };

const maximumBytes = 10 * 1024 * 1024;

function isValidationResponse(value: unknown): value is ValidationResponse {
  if (typeof value !== 'object' || value === null) return false;
  const result = value as Record<string, unknown>;
  return (
    typeof result.valid === 'boolean' &&
    typeof result.schema_version === 'string' &&
    typeof result.row_count === 'number' &&
    typeof result.employee_day_count === 'number' &&
    Array.isArray(result.errors) &&
    result.errors.every((error) => typeof error === 'string') &&
    typeof result.persisted === 'boolean' &&
    typeof result.run_created === 'boolean'
  );
}

function isDatasetImportResponse(
  value: unknown,
): value is DatasetImportResponse {
  if (typeof value !== 'object' || value === null) return false;
  const result = value as Record<string, unknown>;
  return (
    typeof result.dataset_id === 'string' &&
    typeof result.status === 'string' &&
    typeof result.sha256 === 'string' &&
    typeof result.manifest_sha256 === 'string' &&
    typeof result.schema_version === 'string' &&
    typeof result.row_count === 'number' &&
    typeof result.employee_day_count === 'number' &&
    typeof result.created_at === 'string' &&
    typeof result.created === 'boolean' &&
    typeof result.synthetic_only === 'boolean' &&
    typeof result.run_created === 'boolean' &&
    typeof result.risk_calculated === 'boolean'
  );
}

function getApiErrorMessage(
  error: unknown,
  status: number,
  action: string,
): string {
  if (typeof error === 'object' && error !== null && 'detail' in error) {
    const { detail } = error;
    if (typeof detail === 'string') return detail;
    if (typeof detail === 'object' && detail !== null && 'errors' in detail) {
      const { errors } = detail;
      if (
        Array.isArray(errors) &&
        errors.every((item) => typeof item === 'string')
      ) {
        return errors.join(' ');
      }
    }
    if (Array.isArray(detail)) {
      const messages = detail.flatMap((item) =>
        typeof item === 'object' &&
        item !== null &&
        'msg' in item &&
        typeof item.msg === 'string'
          ? [item.msg]
          : [],
      );
      if (messages.length > 0) return messages.join(' ');
    }
  }
  return `${action} request failed (${status}).`;
}

function getConnectionErrorMessage(error: unknown, action: string): string {
  if (error instanceof TypeError) {
    return `Could not reach the ${action} API. Check the connection and try again.`;
  }
  if (error instanceof SyntaxError) {
    return `${action.charAt(0).toUpperCase()}${action.slice(1)} API returned an unexpected response.`;
  }
  return error instanceof Error
    ? error.message
    : `Could not complete the ${action.toLowerCase()}. Try again.`;
}

function getApiUrl(): string | null {
  return process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '') || null;
}

export function DatasetImport() {
  const [file, setFile] = useState<File | null>(null);
  const [confirmedSynthetic, setConfirmedSynthetic] = useState(false);
  const [state, setState] = useState<ImportState>({ status: 'idle' });
  const isBusy = state.status === 'validating' || state.status === 'importing';
  const validation =
    state.status === 'validated' ||
    state.status === 'invalid' ||
    state.status === 'importing' ||
    state.status === 'imported' ||
    (state.status === 'error' && state.validation)
      ? state.validation
      : undefined;
  const canImport = validation?.valid === true && confirmedSynthetic && file;

  async function validate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || !confirmedSynthetic || isBusy) return;
    if (file.size > maximumBytes) {
      setState({
        status: 'error',
        operation: 'validation',
        message: 'Choose a CSV file smaller than 10 MiB.',
      });
      return;
    }

    const apiUrl = getApiUrl();
    if (!apiUrl) {
      setState({
        status: 'error',
        operation: 'validation',
        message:
          'CSV validation is not configured. Set NEXT_PUBLIC_API_BASE_URL and enable development CSV validation on the API.',
      });
      return;
    }

    setState({ status: 'validating' });
    try {
      const client = createFishEyeApiClient(apiUrl);
      const { data, error, response } = await client.POST(
        '/api/v1/datasets/imports/validate',
        {
          headers: {
            'Content-Type': 'text/csv',
            'X-FishEye-Synthetic-Data-Confirmed': 'true',
          },
          body: await file.text(),
        },
      );

      if (!response.ok) {
        throw new Error(
          getApiErrorMessage(error, response.status, 'Validation'),
        );
      }
      if (!isValidationResponse(data)) {
        throw new Error('Validation API returned an unexpected response.');
      }

      setState({
        status: data.valid ? 'validated' : 'invalid',
        validation: data,
      });
    } catch (error) {
      setState({
        status: 'error',
        operation: 'validation',
        message: getConnectionErrorMessage(error, 'validation'),
      });
    }
  }

  async function importDataset() {
    if (!file || !confirmedSynthetic || !validation?.valid || isBusy) return;
    const apiUrl = getApiUrl();
    if (!apiUrl) {
      setState({
        status: 'error',
        operation: 'import',
        validation,
        message:
          'Dataset import is not configured. Set NEXT_PUBLIC_API_BASE_URL and enable development CSV import on the API.',
      });
      return;
    }

    const confirmedValidation = validation;
    setState({ status: 'importing', validation: confirmedValidation });
    try {
      const client = createFishEyeApiClient(apiUrl);
      const { data, error, response } = await client.POST(
        '/api/v1/datasets/imports',
        {
          headers: {
            'Content-Type': 'text/csv',
            'X-FishEye-Synthetic-Data-Confirmed': 'true',
          },
          body: await file.text(),
        },
      );

      if (!response.ok) {
        throw new Error(getApiErrorMessage(error, response.status, 'Import'));
      }
      if (!isDatasetImportResponse(data)) {
        throw new Error('Import API returned an unexpected response.');
      }
      if (
        data.synthetic_only !== true ||
        data.run_created !== false ||
        data.risk_calculated !== false
      ) {
        throw new Error(
          'Import API returned a response that conflicts with the development import contract.',
        );
      }

      setState({
        status: 'imported',
        validation: confirmedValidation,
        result: data,
      });
    } catch (error) {
      setState({
        status: 'error',
        operation: 'import',
        validation: confirmedValidation,
        message: getConnectionErrorMessage(error, 'import'),
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
          <h2 id="dataset-import-title">Import a synthetic CSV dataset</h2>
          <p className="card-intro">
            Validate the event format, then save the file as a development
            dataset. Import does not start a detection run or calculate risk.
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
            disabled={isBusy}
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setConfirmedSynthetic(false);
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
            disabled={isBusy}
            onChange={(event) => setConfirmedSynthetic(event.target.checked)}
          />
          <span>
            I confirm this file contains synthetic employee and event data only.
          </span>
        </label>
        <p className="field-help synthetic-caveat">
          FishEye cannot verify data provenance from CSV contents. Do not upload
          real employee, customer, bank, credential, or production log data.
          Dataset import is available only when the API is configured for
          development.
        </p>

        <div className="dataset-import-actions">
          <Button
            type="submit"
            disabled={!file || !confirmedSynthetic || isBusy}
          >
            {state.status === 'validating' ? 'Checking CSV…' : 'Validate CSV'}
          </Button>
          {canImport ? (
            <Button
              type="button"
              disabled={isBusy || state.status === 'imported'}
              onClick={importDataset}
            >
              {state.status === 'importing'
                ? 'Saving dataset…'
                : 'Import dataset'}
            </Button>
          ) : null}
          {file ? <span className="selected-file">{file.name}</span> : null}
        </div>
      </form>

      {state.status === 'validating' ? (
        <p className="import-state" role="status">
          Checking the CSV schema…
        </p>
      ) : null}
      {state.status === 'importing' ? (
        <p className="import-state" role="status">
          Saving the validated dataset…
        </p>
      ) : null}
      {state.status === 'error' ? (
        <div className="import-state import-state-error" role="alert">
          <strong>
            {state.operation === 'validation'
              ? 'Validation could not be completed'
              : 'Dataset import could not be completed'}
          </strong>
          <p>{state.message}</p>
        </div>
      ) : null}
      {validation && state.status !== 'imported' ? (
        <ValidationSummary result={validation} />
      ) : null}
      {state.status === 'imported' ? (
        <ImportSummary result={state.result} />
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
        Validation only checks the file format. Import must be selected to save
        a dataset. No detector or risk calculation runs during validation or
        import.
      </p>
    </div>
  );
}

function ImportSummary({ result }: { result: DatasetImportResponse }) {
  const createdAt = new Date(result.created_at);
  const formattedCreatedAt = Number.isNaN(createdAt.getTime())
    ? result.created_at
    : new Intl.DateTimeFormat(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short',
      }).format(createdAt);

  return (
    <div className="import-state" role="status">
      <strong>
        {result.created
          ? 'Synthetic dataset saved'
          : 'Dataset already imported'}
      </strong>
      <p>
        {result.row_count} event rows · {result.employee_day_count}{' '}
        employee-days · {result.schema_version}
      </p>
      <dl className="dataset-import-details">
        <div>
          <dt>Dataset ID</dt>
          <dd>{result.dataset_id}</dd>
        </div>
        <div>
          <dt>Source checksum</dt>
          <dd>{result.sha256}</dd>
        </div>
        <div>
          <dt>Manifest checksum</dt>
          <dd>{result.manifest_sha256}</dd>
        </div>
        <div>
          <dt>Imported</dt>
          <dd>{formattedCreatedAt}</dd>
        </div>
      </dl>
      <p className="import-result-caveat">
        This synthetic dataset is stored for a future processing step. No run
        was created and no risk score was calculated.
      </p>
    </div>
  );
}
