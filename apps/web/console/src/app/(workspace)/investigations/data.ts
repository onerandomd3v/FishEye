import { createFishEyeApiClient } from '@fisheye/api-client';

export function normalizeFindingRouteId(value: string) {
  // Finding IDs use colons as separators. When the whole ID arrives from an
  // encoded route segment, decode that outer encoding once; employee IDs that
  // contain colons remain encoded because they were escaped before the whole
  // finding ID was encoded.
  if (value.includes(':') || !/%3a/i.test(value)) return value;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function reviewStatusLabel(
  status: 'unreviewed' | 'under_review' | 'reviewed_benign' | 'escalated',
) {
  switch (status) {
    case 'unreviewed':
      return 'Needs review';
    case 'under_review':
      return 'Under review';
    case 'reviewed_benign':
      return 'Resolved — activity expected';
    case 'escalated':
      return 'Escalated — needs follow-up';
  }
}

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
