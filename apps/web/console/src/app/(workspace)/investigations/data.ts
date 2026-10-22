import { createFishEyeApiClient } from '@fisheye/api-client';

export function apiBaseUrl(): string {
  if (process.env.NODE_ENV === 'test')
    return process.env.FISHEYE_TEST_API_URL ?? '';
  return '/api/backend';
}

export function apiErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  return fallback;
}

export function investigationApi() {
  return createFishEyeApiClient(apiBaseUrl());
}
