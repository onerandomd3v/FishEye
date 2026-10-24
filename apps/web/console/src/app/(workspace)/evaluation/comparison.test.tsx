import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EvaluationComparison } from './comparison';

describe('evaluation scenario comparison', () => {
  it('reports unavailable scenario details when the API omits them', () => {
    render(
      <EvaluationComparison
        metrics={{
          simple_rule: { report: {} },
          tuned_rules: { report: {} },
          contextual: { report: {} },
        }}
      />,
    );

    expect(
      screen.getByText('Scenario-level results are unavailable for this run.'),
    ).toBeTruthy();
  });

  it('reports an empty scenario result set when all reports provide arrays', () => {
    render(
      <EvaluationComparison
        metrics={{
          simple_rule: { report: { by_scenario: [] } },
          tuned_rules: { report: { by_scenario: [] } },
          contextual: { report: { by_scenario: [] } },
        }}
      />,
    );

    expect(
      screen.getByText('No scenario-level results were recorded for this run.'),
    ).toBeTruthy();
  });
});
