import createClient from 'openapi-fetch';
import type { paths } from './generated/schema';

export function createFishEyeApiClient(baseUrl: string) {
  return createClient<paths>({
    baseUrl,
    bodySerializer: (body) =>
      typeof body === 'string' ? body : JSON.stringify(body),
  });
}
