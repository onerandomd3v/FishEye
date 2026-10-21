import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DatasetImport } from './dataset-import';

function syntheticFile(name = 'synthetic.csv') {
  const file = new File(['csv'], name, { type: 'text/csv' });
  Object.defineProperty(file, 'text', { value: async () => 'csv' });
  return file;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

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
      headers: new Headers({ 'Content-Length': '1' }),
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
        files: [syntheticFile()],
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
    expect(
      screen.getByText(/Import must be selected to save a dataset/),
    ).toBeTruthy();
    const request = fetchMock.mock.calls[0]?.[0] as Request;
    expect(request.url).toBe(
      'http://127.0.0.1:8000/api/v1/datasets/imports/validate',
    );
    expect(request.method).toBe('POST');
    expect(request.headers.get('Content-Type')).toBe('text/csv');
    expect(request.headers.get('X-FishEye-Synthetic-Data-Confirmed')).toBe(
      'true',
    );
    expect(await request.text()).toBe('csv');
  });

  it('imports a validated file and reports the backend dataset record without implying a run', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'http://127.0.0.1:8000');
    const csvFile = new File(
      [new Uint8Array([0xef, 0xbb, 0xbf, 0x63, 0x73, 0x76])],
      'synthetic-with-bom.csv',
      { type: 'text/csv' },
    );
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          valid: true,
          schema_version: 'fisheye.events.v1',
          row_count: 14,
          employee_day_count: 3,
          errors: [],
          persisted: false,
          run_created: false,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          dataset_id: 'd0a8f9b0-6b01-5e35-9019-87aee21dcbf0',
          status: 'imported',
          sha256: 'a'.repeat(64),
          manifest_sha256: 'b'.repeat(64),
          schema_version: 'fisheye.events.v1',
          row_count: 14,
          employee_day_count: 3,
          created_at: '2026-10-21T12:00:00Z',
          created: true,
          synthetic_only: true,
          run_created: false,
          risk_calculated: false,
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    render(<DatasetImport />);

    fireEvent.change(screen.getByLabelText('CSV file'), {
      target: { files: [csvFile] },
    });
    fireEvent.click(
      screen.getByLabelText(/I confirm this file contains synthetic/i),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Validate CSV' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Import dataset' }),
    );

    expect(await screen.findByText('Synthetic dataset saved')).toBeTruthy();
    expect(
      screen.getByText('d0a8f9b0-6b01-5e35-9019-87aee21dcbf0'),
    ).toBeTruthy();
    expect(screen.getByText('a'.repeat(64))).toBeTruthy();
    expect(screen.getByText('b'.repeat(64))).toBeTruthy();
    expect(
      screen.getByText(/No run was created and no risk score was calculated/),
    ).toBeTruthy();

    const validationRequest = fetchMock.mock.calls[0]?.[0] as Request;
    const importRequest = fetchMock.mock.calls[1]?.[0] as Request;
    expect(validationRequest.url).toBe(
      'http://127.0.0.1:8000/api/v1/datasets/imports/validate',
    );
    expect(importRequest.url).toBe(
      'http://127.0.0.1:8000/api/v1/datasets/imports',
    );
    expect(importRequest.method).toBe('POST');
    expect(importRequest.headers.get('Content-Type')).toBe('text/csv');
    expect(
      importRequest.headers.get('X-FishEye-Synthetic-Data-Confirmed'),
    ).toBe('true');
    const originalBytes = [0xef, 0xbb, 0xbf, 0x63, 0x73, 0x76];
    expect(
      Array.from(new Uint8Array(await validationRequest.arrayBuffer())),
    ).toEqual(originalBytes);
    expect(
      Array.from(new Uint8Array(await importRequest.arrayBuffer())),
    ).toEqual(originalBytes);
  });

  it('keeps the validated preview available and allows retry after an import error', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'http://127.0.0.1:8000');
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          valid: true,
          schema_version: 'fisheye.events.v1',
          row_count: 14,
          employee_day_count: 3,
          errors: [],
          persisted: false,
          run_created: false,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          { detail: 'Synthetic CSV import is not enabled on this API.' },
          503,
        ),
      );
    vi.stubGlobal('fetch', fetchMock);
    render(<DatasetImport />);

    fireEvent.change(screen.getByLabelText('CSV file'), {
      target: { files: [syntheticFile()] },
    });
    fireEvent.click(
      screen.getByLabelText(/I confirm this file contains synthetic/i),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Validate CSV' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Import dataset' }),
    );

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(
      screen.getByText('Synthetic CSV import is not enabled on this API.'),
    ).toBeTruthy();
    expect(screen.getByText('CSV schema is valid')).toBeTruthy();
    expect(
      screen
        .getByRole('button', { name: 'Import dataset' })
        .hasAttribute('disabled'),
    ).toBe(false);
  });

  it('shows API failures as a recoverable error', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'http://127.0.0.1:8000');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        headers: new Headers(),
        text: async () =>
          JSON.stringify({
            detail: 'CSV validation is not enabled on this API.',
          }),
      }),
    );
    render(<DatasetImport />);
    fireEvent.change(screen.getByLabelText('CSV file'), {
      target: {
        files: [syntheticFile()],
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

  it('uses the HTTP status when an error response is not JSON', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'http://127.0.0.1:8000');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        headers: new Headers(),
        text: async () => '<html>Gateway error</html>',
      }),
    );
    render(<DatasetImport />);
    fireEvent.change(screen.getByLabelText('CSV file'), {
      target: { files: [syntheticFile()] },
    });
    fireEvent.click(
      screen.getByLabelText(/I confirm this file contains synthetic/i),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Validate CSV' }));

    expect(
      await screen.findByText('Validation request failed (502).'),
    ).toBeTruthy();
  });

  it('reports malformed successful responses without exposing parser errors', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'http://127.0.0.1:8000');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ 'Content-Length': '4' }),
        json: async () => {
          throw new SyntaxError('Unexpected token');
        },
      }),
    );
    render(<DatasetImport />);
    fireEvent.change(screen.getByLabelText('CSV file'), {
      target: { files: [syntheticFile()] },
    });
    fireEvent.click(
      screen.getByLabelText(/I confirm this file contains synthetic/i),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Validate CSV' }));

    expect(
      await screen.findByText(
        'Validation API returned an unexpected response.',
      ),
    ).toBeTruthy();
  });

  it('requires a fresh synthetic-data confirmation when the file changes', () => {
    render(<DatasetImport />);
    const fileInput = screen.getByLabelText('CSV file');
    const confirmation = screen.getByLabelText(
      /I confirm this file contains synthetic/i,
    ) as HTMLInputElement;

    fireEvent.change(fileInput, { target: { files: [syntheticFile()] } });
    fireEvent.click(confirmation);
    expect(confirmation.checked).toBe(true);

    fireEvent.change(fileInput, {
      target: { files: [syntheticFile('replacement.csv')] },
    });

    expect(confirmation.checked).toBe(false);
  });
});
