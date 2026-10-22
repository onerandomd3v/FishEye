import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

function response(status: number, body: unknown, onJson?: () => void) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => {
      onJson?.();
      return body;
    },
    text: async () => {
      onJson?.();
      return JSON.stringify(body);
    },
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('evaluation findings requests', () => {
  it('does not let a slower response from a previous run replace the selected run findings', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'http://127.0.0.1:8000');
    vi.resetModules();
    const { default: EvaluationPage } = await import('./evaluation/page');
    const runAResponse = deferred<Awaited<ReturnType<typeof response>>>();
    const runBResponse = deferred<Awaited<ReturnType<typeof response>>>();
    const manifestAResponse = deferred<Awaited<ReturnType<typeof response>>>();
    const runAResponseConsumed = deferred<void>();
    const runs = [
      {
        run_id: 'run-a',
        dataset_id: 'dataset-a',
        status: 'completed',
        methodology_version: 'method-v1',
        claim_status: 'provisional',
        created_at: '2026-01-01T00:00:00Z',
        result_manifest_sha256: 'a'.repeat(64),
        synthetic_only: true,
        metrics: null,
      },
      {
        run_id: 'run-b',
        dataset_id: 'dataset-b',
        status: 'completed',
        methodology_version: 'method-v1',
        claim_status: 'provisional',
        created_at: '2026-01-02T00:00:00Z',
        result_manifest_sha256: 'b'.repeat(64),
        synthetic_only: true,
        metrics: {
          evaluation_unit: 'employee_day_utc',
          evaluation_unit_count: 2,
          comparisons: {
            contextual: {
              threshold: 65,
              report: {
                metrics: {
                  unit_count: 2,
                  confusion: {
                    true_positive: 1,
                    false_positive: 0,
                    true_negative: 1,
                    false_negative: 0,
                  },
                  precision: { value: 1, numerator: 1, denominator: 1 },
                  recall: { value: 1, numerator: 1, denominator: 1 },
                  false_positive_rate: {
                    value: 0,
                    numerator: 0,
                    denominator: 1,
                  },
                  alerts_per_100_employee_days: {
                    value: 50,
                    numerator: 1,
                    denominator: 2,
                  },
                },
                by_scenario: [],
              },
            },
          },
        },
      },
    ];
    const fetchMock = vi.fn((input: Request | string) => {
      const url = input instanceof Request ? input.url : input;
      if (url.includes('/api/v1/runs/run-a/findings'))
        return runAResponse.promise;
      if (url.includes('/api/v1/runs/run-b/findings'))
        return runBResponse.promise;
      if (url.includes('/api/v1/runs/run-a/manifest'))
        return manifestAResponse.promise;
      if (url.includes('/api/v1/runs/run-b/manifest'))
        return response(503, { detail: 'Unavailable' });
      return response(200, {
        items: runs,
        limit: 50,
        offset: 0,
        total: 2,
        has_more: false,
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<EvaluationPage />);
    const viewButtons = await screen.findAllByRole('button', {
      name: 'View run',
    });
    fireEvent.click(viewButtons[0]!);
    fireEvent.click(viewButtons[1]!);

    runBResponse.resolve(
      await response(200, {
        items: [
          {
            finding_id: 'finding-b',
            employee_id: 'employee-b',
            employee_day_utc: '2026-01-02',
            score: 70,
            severity: 'Medium',
            reason_codes: ['new_device'],
            evidence_event_ids: ['event-b'],
          },
        ],
        limit: 100,
        offset: 0,
        total: 1,
        has_more: false,
      }),
    );
    expect(await screen.findByText('employee-b')).toBeTruthy();

    await act(async () => {
      runAResponse.resolve(
        await response(
          200,
          {
            items: [
              {
                finding_id: 'finding-a',
                employee_id: 'employee-a',
                employee_day_utc: '2026-01-01',
                score: 80,
                severity: 'High',
                reason_codes: ['out_of_role_access'],
                evidence_event_ids: ['event-a'],
              },
            ],
            limit: 100,
            offset: 0,
            total: 1,
            has_more: false,
          },
          () => runAResponseConsumed.resolve(),
        ),
      );
      await runAResponseConsumed.promise;
    });

    expect(screen.queryByText('employee-a')).toBeNull();
    expect(screen.getByText('employee-b')).toBeTruthy();
    expect(
      screen.getByRole('heading', { name: 'Confusion counts' }),
    ).toBeTruthy();
    expect(screen.getByText('True positives')).toBeTruthy();
    expect(screen.getByText('Alert threshold')).toBeTruthy();
    expect(screen.getByText('65')).toBeTruthy();
    expect(screen.getAllByText('100.0% (1/1)')).toHaveLength(2);
    expect(screen.getByText('50.0 (1/2)')).toBeTruthy();
    expect(
      screen.getByText('Scenario-level results are unavailable for this run.'),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'View run' }));
    fireEvent.click(screen.getByRole('button', { name: 'Download manifest' }));
    fireEvent.click(screen.getByRole('button', { name: 'View run' }));
    await act(async () => {
      manifestAResponse.resolve(
        await response(503, { detail: 'Run A manifest unavailable.' }),
      );
    });
    expect(screen.queryByText(/Manifest download failed/)).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Download manifest' }),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Download manifest' }));
    expect(
      await screen.findByText(/Manifest download failed \(503\)/),
    ).toBeTruthy();
  });
});
