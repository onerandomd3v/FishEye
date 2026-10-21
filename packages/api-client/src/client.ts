import createClient from 'openapi-fetch';
import type { paths } from './generated/schema';

type CsvImportPath = Extract<keyof paths, `/api/v1/datasets/imports${string}`>;

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
  path: CsvImportPath,
  file: Blob,
) {
  // OpenAPI models `text/csv` binary content as string. Keep generated response
  // typing while the serializer sends this Blob without transforming bytes.
  return client.POST(path, {
    headers: {
      'Content-Type': 'text/csv',
      'X-FishEye-Synthetic-Data-Confirmed': 'true',
    },
    body: file as unknown as string,
  });
}
