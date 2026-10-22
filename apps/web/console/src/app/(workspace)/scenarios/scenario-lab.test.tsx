import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { Blob as NodeBlob, File as NodeFile } from 'node:buffer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ScenarioLab } from './scenario-lab';

function response(status: number, body: unknown) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => body,
    text: async () => JSON.stringify(body),
    blob: async () =>
      new NodeBlob([typeof body === 'string' ? body : JSON.stringify(body)]),
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('scenario lab sample workflow', () => {
  it('sends a selected sample through validation, import, and the real run API', async () => {
    vi.stubEnv('FISHEYE_TEST_API_URL', 'http://127.0.0.1:8000');
    vi.stubGlobal('File', NodeFile);
    const apiCalls: string[] = [];
    const fetchMock = vi.fn((input: Request | string) => {
      const url = input instanceof Request ? input.url : input;
      if (url.includes('/demo-samples/')) {
        return response(
          200,
          url.endsWith('.csv')
            ? 'event_id,value\nevent-1,synthetic'
            : '{"schema_version":"fisheye.context.v1"}',
        );
      }
      const request = input instanceof Request ? input : new Request(input);
      apiCalls.push(`${request.method} ${new URL(request.url).pathname}`);
      const path = new URL(request.url).pathname;
      if (path.endsWith('/datasets/imports/validate')) {
        return response(200, {
          valid: true,
          schema_version: 'fisheye.events.v2',
          row_count: 12,
          employee_day_count: 10,
          errors: [],
        });
      }
      if (path.endsWith('/datasets/imports')) {
        return response(201, { dataset_id: 'dataset-imported' });
      }
      if (path === '/api/v1/runs') {
        return response(202, {
          run_id: 'run-created',
          dataset_id: 'dataset-imported',
          status: 'completed',
          methodology_version: 'method-v1',
          claim_status: 'provisional_experiment; not_benchmarked',
          created_at: '2026-01-02T00:00:00Z',
          synthetic_only: true,
          metrics: null,
        });
      }
      return response(500, { detail: 'Unexpected request.' });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<ScenarioLab />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Use sample' })[0]!);

    expect(
      await screen.findByText('Overtime and out-of-role activity'),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole('checkbox', {
        name: /I confirm both files contain fictional people and activity only/i,
      }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Run evaluation' }),
    );

    expect(await screen.findByText('Evaluation complete')).toBeTruthy();
    await waitFor(() => {
      expect(apiCalls).toEqual([
        'POST /api/v1/datasets/imports/validate',
        'POST /api/v1/datasets/imports',
        'POST /api/v1/runs',
      ]);
    });
  });
});
