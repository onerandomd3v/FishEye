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
        metrics: null,
      },
    ];
    const fetchMock = vi.fn((input: Request | string) => {
      const url = input instanceof Request ? input.url : input;
      if (url.includes('/api/v1/runs/run-a/findings'))
        return runAResponse.promise;
      if (url.includes('/api/v1/runs/run-b/findings'))
        return runBResponse.promise;
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
    fireEvent.click(screen.getByRole('button', { name: 'Download manifest' }));
    expect(
      await screen.findByText(/Manifest download failed \(503\)/),
    ).toBeTruthy();
  });
});
