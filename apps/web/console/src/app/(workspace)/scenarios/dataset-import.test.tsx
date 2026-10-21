import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DatasetImport } from './dataset-import';

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('synthetic CSV validation', () => {
  it('requires a selected file and synthetic-data confirmation', () => {
    render(<DatasetImport />);
    expect(
      screen
        .getByRole('button', { name: 'Validate CSV' })
        .hasAttribute('disabled'),
    ).toBe(true);
    expect(screen.getByText(/cannot verify data provenance/i)).toBeTruthy();
  });

  it('shows the backend validation result without implying import or scoring', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'http://127.0.0.1:8000');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        valid: true,
        schema_version: 'fisheye.events.v1',
        row_count: 14,
        employee_day_count: 3,
        errors: [],
        persisted: false,
        run_created: false,
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<DatasetImport />);

    fireEvent.change(screen.getByLabelText('CSV file'), {
      target: {
        files: [new File(['csv'], 'synthetic.csv', { type: 'text/csv' })],
      },
    });
    fireEvent.click(
      screen.getByLabelText(/I confirm this file contains synthetic/i),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Validate CSV' }));

    await waitFor(() =>
      expect(screen.getByText('CSV schema is valid')).toBeTruthy(),
    );
    expect(screen.getByText(/14 event rows · 3 employee-days/)).toBeTruthy();
    expect(screen.getByText(/No dataset was saved/)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8000/api/v1/datasets/imports/validate',
      expect.objectContaining({ method: 'POST', headers: expect.any(Object) }),
    );
  });

  it('shows API failures as a recoverable error', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'http://127.0.0.1:8000');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({
          detail: 'CSV validation is not enabled on this API.',
        }),
      }),
    );
    render(<DatasetImport />);
    fireEvent.change(screen.getByLabelText('CSV file'), {
      target: {
        files: [new File(['csv'], 'synthetic.csv', { type: 'text/csv' })],
      },
    });
    fireEvent.click(
      screen.getByLabelText(/I confirm this file contains synthetic/i),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Validate CSV' }));

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(
      screen.getByText('CSV validation is not enabled on this API.'),
    ).toBeTruthy();
  });
});
