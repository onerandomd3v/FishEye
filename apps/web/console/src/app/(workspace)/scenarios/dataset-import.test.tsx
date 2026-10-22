import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DatasetImport } from './dataset-import';

function file(name: string, content: string, type: string) {
  const result = new File([content], name, { type });
  Object.defineProperty(result, 'text', { value: async () => content });
  return result;
}

const context = JSON.stringify({
  schema_version: 'fisheye.context.v1',
  roles: [],
  employee_schedules: [],
});

function response(status: number, body: unknown) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => body,
    text: async () => JSON.stringify(body),
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('development evaluation run flow', () => {
  it('requires CSV, context JSON, and synthetic-data confirmation', () => {
    render(<DatasetImport />);
    expect(
      screen
        .getByRole('button', { name: 'Run evaluation' })
        .hasAttribute('disabled'),
    ).toBe(true);
    expect(
      screen
        .getByRole('link', { name: 'Download CSV template' })
        .getAttribute('href'),
    ).toBe('/templates/fisheye-events-v2.csv');
    expect(screen.getByText(/Do not upload real employee/i)).toBeTruthy();
  });

  it('imports the validated data, creates a durable run, and displays worker metrics', async () => {
    vi.stubEnv('FISHEYE_TEST_API_URL', 'http://127.0.0.1:8000');
    const run = {
      run_id: 'run-1',
      dataset_id: 'dataset-1',
      status: 'completed',
      methodology_version: 'fisheye.employee-day-experimental.v1',
      claim_status: 'provisional_experiment; not_benchmarked',
      created_at: '2026-01-01T00:00:00Z',
      synthetic_only: true,
      metrics: {
        comparisons: {
          contextual: {
            report: {
              metrics: {
                precision: { value: 0.5 },
                recall: { value: 1 },
                false_positive_rate: { value: 0.1 },
              },
            },
          },
        },
      },
    };
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() =>
        response(200, {
          valid: true,
          schema_version: 'fisheye.events.v2',
          row_count: 6,
          employee_day_count: 6,
          errors: [],
        }),
      )
      .mockImplementationOnce(() =>
        response(201, {
          dataset_id: 'dataset-1',
          status: 'imported',
          sha256: 'abc',
          manifest_sha256: 'def',
          schema_version: 'fisheye.events.v2',
          row_count: 6,
          employee_day_count: 6,
          created_at: '2026-01-01T00:00:00Z',
          created: true,
        }),
      )
      .mockImplementationOnce(() =>
        response(202, { ...run, status: 'queued', metrics: null }),
      )
      .mockImplementationOnce(() => response(200, run));
    vi.stubGlobal('fetch', fetchMock);
    render(<DatasetImport />);
    fireEvent.change(screen.getByLabelText('Events CSV'), {
      target: {
        files: [
          new File(
            [new Uint8Array([0xef, 0xbb, 0xbf, 0x63, 0x73, 0x76])],
            'events.csv',
            { type: 'text/csv' },
          ),
        ],
      },
    });
    fireEvent.change(screen.getByLabelText('Roles and schedules (JSON)'), {
      target: { files: [file('context.json', context, 'application/json')] },
    });
    fireEvent.click(screen.getByLabelText(/I confirm both files/i));
    fireEvent.click(
      screen.getByRole('button', { name: 'Run evaluation' }),
    );

    expect(
      await screen.findByText(
        'Evaluation complete',
        {},
        { timeout: 5000 },
      ),
    ).toBeTruthy();
    expect(screen.getByText('50.0%')).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'About evaluation results' }).getAttribute('href'),
    ).toBe('/guide#results');
    expect(fetchMock).toHaveBeenCalledTimes(4);
    const createRequest = fetchMock.mock.calls[2]?.[0] as Request;
    expect(createRequest.url).toContain('/api/v1/runs');
    expect(createRequest.headers.get('Idempotency-Key')).toBeTruthy();
    const validationRequest = fetchMock.mock.calls[0]?.[0] as Request;
    const importRequest = fetchMock.mock.calls[1]?.[0] as Request;
    const originalCsvBytes = [0xef, 0xbb, 0xbf, 0x63, 0x73, 0x76];
    expect(
      Array.from(new Uint8Array(await validationRequest.arrayBuffer())),
    ).toEqual(originalCsvBytes);
    expect(
      Array.from(new Uint8Array(await importRequest.arrayBuffer())),
    ).toEqual(originalCsvBytes);
  });

  it('reuses the run idempotency key when retrying the same submission after an uncertain response', async () => {
    vi.stubEnv('FISHEYE_TEST_API_URL', 'http://127.0.0.1:8000');
    const terminalRun = {
      run_id: 'run-retried',
      dataset_id: 'dataset-1',
      status: 'completed',
      methodology_version: 'fisheye.employee-day-experimental.v1',
      claim_status: 'provisional_experiment; not_benchmarked',
      created_at: '2026-01-01T00:00:00Z',
      synthetic_only: true,
      metrics: null,
    };
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() =>
        response(200, {
          valid: true,
          schema_version: 'fisheye.events.v2',
          row_count: 6,
          employee_day_count: 6,
          errors: [],
        }),
      )
      .mockImplementationOnce(() =>
        response(201, {
          dataset_id: 'dataset-1',
          status: 'imported',
          sha256: 'abc',
          manifest_sha256: 'def',
          schema_version: 'fisheye.events.v2',
          row_count: 6,
          employee_day_count: 6,
          created_at: '2026-01-01T00:00:00Z',
          created: true,
        }),
      )
      .mockImplementationOnce(() => response(503, { detail: 'Try again.' }))
      .mockImplementationOnce(() =>
        response(200, {
          valid: true,
          schema_version: 'fisheye.events.v2',
          row_count: 6,
          employee_day_count: 6,
          errors: [],
        }),
      )
      .mockImplementationOnce(() =>
        response(200, {
          dataset_id: 'dataset-1',
          status: 'imported',
          sha256: 'abc',
          manifest_sha256: 'def',
          schema_version: 'fisheye.events.v2',
          row_count: 6,
          employee_day_count: 6,
          created_at: '2026-01-01T00:00:00Z',
          created: false,
        }),
      )
      .mockImplementationOnce(() => response(202, terminalRun));
    vi.stubGlobal('fetch', fetchMock);
    render(<DatasetImport />);
    fireEvent.change(screen.getByLabelText('Events CSV'), {
      target: { files: [file('events.csv', 'csv', 'text/csv')] },
    });
    fireEvent.change(screen.getByLabelText('Roles and schedules (JSON)'), {
      target: { files: [file('context.json', context, 'application/json')] },
    });
    fireEvent.click(screen.getByLabelText(/I confirm both files/i));

    const submit = screen.getByRole('button', {
      name: 'Run evaluation',
    });
    fireEvent.click(submit);
    expect(await screen.findByRole('alert')).toBeTruthy();
    fireEvent.click(submit);
    expect(await screen.findByText('Evaluation complete')).toBeTruthy();

    const firstRunRequest = fetchMock.mock.calls[2]?.[0] as Request;
    const retryRunRequest = fetchMock.mock.calls[5]?.[0] as Request;
    expect(firstRunRequest.headers.get('Idempotency-Key')).toBeTruthy();
    expect(retryRunRequest.headers.get('Idempotency-Key')).toBe(
      firstRunRequest.headers.get('Idempotency-Key'),
    );
  });

  it('surfaces a clear API configuration error', async () => {
    render(<DatasetImport />);
    fireEvent.change(screen.getByLabelText('Events CSV'), {
      target: { files: [file('events.csv', 'csv', 'text/csv')] },
    });
    fireEvent.change(screen.getByLabelText('Roles and schedules (JSON)'), {
      target: { files: [file('context.json', context, 'application/json')] },
    });
    fireEvent.click(screen.getByLabelText(/I confirm both files/i));
    fireEvent.click(
      screen.getByRole('button', { name: 'Run evaluation' }),
    );
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain(
        'FishEye API is not configured',
      ),
    );
  });
});
