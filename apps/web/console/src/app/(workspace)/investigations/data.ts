import { createFishEyeApiClient } from '@fisheye/api-client';

export const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? '';

export function apiErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  return fallback;
}

export function investigationApi() {
  return createFishEyeApiClient(apiBaseUrl);
}
