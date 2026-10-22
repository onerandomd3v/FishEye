function metricValue(value: unknown): number | null {
  if (typeof value !== 'object' || value === null || !('value' in value)) {
    return null;
  }
  const number = (value as { value?: unknown }).value;
  return typeof number === 'number' && Number.isFinite(number) ? number : null;
}

export function formatDetectorName(value: string): string {
  switch (value) {
    case 'simple_rule':
      return 'Simple rules';
    case 'tuned_rules':
      return 'Tuned rules';
    case 'contextual':
      return 'Contextual scoring';
    default:
      return value.replaceAll('_', ' ');
  }
}

export function formatMetricRatio(value: unknown): string {
  const record = asRecord(value);
  if (
    record?.value === null &&
    typeof record.undefined_reason === 'string' &&
    record.undefined_reason.trim().length > 0
  ) {
    return `Not defined — ${record.undefined_reason}`;
  }
  const number = metricValue(value);
  return number === null ? 'Unavailable' : `${(number * 100).toFixed(1)}%`;
}

export function formatMetricRatioWithCount(value: unknown): string {
  const record = asRecord(value);
  const formatted = formatMetricRatio(value);
  if (
    typeof record?.numerator !== 'number' ||
    typeof record.denominator !== 'number' ||
    formatted === 'Unavailable' ||
    formatted.startsWith('Not defined')
  ) {
    return formatted;
  }
  return `${formatted} (${record.numerator} of ${record.denominator})`;
}

export function formatAlertsPer100EmployeeDays(value: unknown): string {
  const number = metricValue(value);
  return number === null ? 'Unavailable' : number.toFixed(1);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null;
}
