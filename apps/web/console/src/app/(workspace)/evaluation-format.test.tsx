import { describe, expect, it } from 'vitest';
import {
  formatAlertsPer100EmployeeDays,
  formatMetricRatio,
} from './evaluation-format';

describe('evaluation metric formatting', () => {
  it('formats ratios as percentages', () => {
    expect(formatMetricRatio({ value: 0.5 })).toBe('50.0%');
  });

  it('keeps alert burden in alerts per 100 employee-days', () => {
    expect(formatAlertsPer100EmployeeDays({ value: 50 })).toBe('50.0');
  });

  it('shows undefined metrics and the backend reason explicitly', () => {
    expect(
      formatMetricRatio({
        value: null,
        undefined_reason: 'No employee-days were predicted positive.',
      }),
    ).toBe('Not defined — No employee-days were predicted positive.');
  });

  it('keeps unavailable distinct when the API supplies no undefined reason', () => {
    expect(formatMetricRatio({ value: null })).toBe('Unavailable');
  });
});
