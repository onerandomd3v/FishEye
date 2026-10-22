import createClient from 'openapi-fetch';
import type { components, paths } from './generated/schema';

type CsvImportPath = Extract<keyof paths, `/api/v1/datasets/imports${string}`>;
type CsvValidationResponse = components['schemas']['DatasetValidationResponse'];
type CsvDatasetResponse = components['schemas']['DatasetImportResponse'];
type CsvPostResult<Data> = {
  data?: Data;
  error?: unknown;
  response: Response;
};

export function createFishEyeApiClient(baseUrl: string) {
  return createClient<paths>({
    baseUrl,
    bodySerializer: (body: unknown) => {
      if (
        typeof body === 'string' ||
        (typeof Blob !== 'undefined' && body instanceof Blob) ||
        body instanceof ArrayBuffer ||
        ArrayBuffer.isView(body)
      ) {
        return body;
      }
      return JSON.stringify(body);
    },
  });
}

/** Send a selected CSV as its original bytes, without a text decode/re-encode pass. */
export function postCsv(
  client: ReturnType<typeof createFishEyeApiClient>,
  path: '/api/v1/datasets/imports/validate',
  file: Blob,
): Promise<CsvPostResult<CsvValidationResponse>>;
export function postCsv(
  client: ReturnType<typeof createFishEyeApiClient>,
  path: '/api/v1/datasets/imports',
  file: Blob,
): Promise<CsvPostResult<CsvDatasetResponse>>;
export function postCsv(
  client: ReturnType<typeof createFishEyeApiClient>,
  path: CsvImportPath,
  file: Blob,
): Promise<CsvPostResult<CsvValidationResponse | CsvDatasetResponse>>;
export function postCsv(
  client: ReturnType<typeof createFishEyeApiClient>,
  path: CsvImportPath,
  file: Blob,
): Promise<CsvPostResult<CsvValidationResponse | CsvDatasetResponse>> {
  const init = {
    headers: {
      'Content-Type': 'text/csv' as const,
      'X-FishEye-Synthetic-Data-Confirmed': 'true' as const,
    },
    body: file as unknown as string,
  };

  if (path === '/api/v1/datasets/imports/validate') {
    return client.POST(path, init) as Promise<
      CsvPostResult<CsvValidationResponse>
    >;
  }
  return client.POST(path, init) as Promise<CsvPostResult<CsvDatasetResponse>>;
}
