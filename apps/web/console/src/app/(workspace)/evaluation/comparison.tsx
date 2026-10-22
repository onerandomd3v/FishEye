import {
  formatAlertsPer100EmployeeDays,
  formatDetectorName,
  formatMetricRatioWithCount,
} from '../evaluation-format';

const detectors = ['simple_rule', 'tuned_rules', 'contextual'] as const;

export function EvaluationComparison({
  metrics,
}: {
  metrics: Record<string, unknown>;
}) {
  const reports = detectors.map((name) => ({
    name,
    report: asRecord(asRecord(metrics[name])?.report),
  }));
  const scenarioRows = reports.flatMap(({ name, report }) => {
    const rows = report?.by_scenario;
    if (!Array.isArray(rows)) return [];
    return rows.flatMap((value) => {
      const scenario = asRecord(value);
      const scenarioMetrics = asRecord(scenario?.metrics);
      if (typeof scenario?.scenario_id !== 'string' || !scenarioMetrics) {
        return [];
      }
      return [
        {
          detector: name,
          scenarioId: scenario.scenario_id,
          metrics: scenarioMetrics,
        },
      ];
    });
  });

  return (
    <div className="evaluation-report-tables">
      <div className="table-wrap">
        <table className="data-table evaluation-comparison-table">
          <thead>
            <tr>
              <th scope="col">Method</th>
              <th scope="col">Score cutoff</th>
              <th scope="col">Alerts correct</th>
              <th scope="col">Threats caught</th>
              <th scope="col">False alarm rate</th>
              <th scope="col">Alerts per 100 person-days</th>
            </tr>
          </thead>
          <tbody>
            {reports.map(({ name, report }) => {
              const detectorResult = asRecord(metrics[name]);
              const scores = asRecord(report?.metrics);
              return (
                <tr key={name}>
                  <td>{formatDetectorName(name)}</td>
                  <td>{formatNumber(detectorResult?.threshold)}</td>
                  <td>{formatMetricRatioWithCount(scores?.precision)}</td>
                  <td>{formatMetricRatioWithCount(scores?.recall)}</td>
                  <td>
                    {formatMetricRatioWithCount(scores?.false_positive_rate)}
                  </td>
                  <td>
                    {formatRateWithCount(scores?.alerts_per_100_employee_days)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="field-help">
        “Alerts correct” shows how often an alert was right. “Threats caught”
        shows how many threat days were flagged. “False alarm rate” shows how
        often benign days were flagged. Counts appear as “1 of 3”.
      </p>

      <details className="evaluation-detail">
        <summary>See outcome counts</summary>
        <section aria-labelledby="confusion-title">
          <h3 id="confusion-title">What happened</h3>
          <p className="field-help">
            Each person-day is counted once. See what each method caught,
            missed, and flagged by mistake.
          </p>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Method</th>
                  <th scope="col">Threats caught</th>
                  <th scope="col">False alarms</th>
                  <th scope="col">Benign days cleared</th>
                  <th scope="col">Threats missed</th>
                  <th scope="col">Person-days checked</th>
                </tr>
              </thead>
              <tbody>
                {reports.map(({ name, report }) => {
                  const scores = asRecord(report?.metrics);
                  const confusion = asRecord(scores?.confusion);
                  return (
                    <tr key={name}>
                      <td>{formatDetectorName(name)}</td>
                      <td>{formatCount(confusion?.true_positive)}</td>
                      <td>{formatCount(confusion?.false_positive)}</td>
                      <td>{formatCount(confusion?.true_negative)}</td>
                      <td>{formatCount(confusion?.false_negative)}</td>
                      <td>{formatCount(scores?.unit_count)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </details>

      <details className="evaluation-detail">
        <summary>See results by scenario</summary>
        <section aria-labelledby="scenario-metrics-title">
          <h3 id="scenario-metrics-title">Results by scenario</h3>
          {scenarioRows.length === 0 ? (
            <p className="empty-state">
              Scenario-level results are unavailable for this run.
            </p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Method</th>
                    <th scope="col">Scenario</th>
                    <th scope="col">Person-days</th>
                    <th scope="col">Alerts correct</th>
                    <th scope="col">Threats caught</th>
                    <th scope="col">False alarm rate</th>
                  </tr>
                </thead>
                <tbody>
                  {scenarioRows.map(({ detector, scenarioId, metrics }) => (
                    <tr key={`${detector}:${scenarioId}`}>
                      <td>{formatDetectorName(detector)}</td>
                      <td>{scenarioId.replaceAll('_', ' ')}</td>
                      <td>{formatCount(metrics.unit_count)}</td>
                      <td>{formatMetricRatioWithCount(metrics.precision)}</td>
                      <td>{formatMetricRatioWithCount(metrics.recall)}</td>
                      <td>
                        {formatMetricRatioWithCount(metrics.false_positive_rate)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </details>
    </div>
  );
}

function formatCount(value: unknown): string {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? String(value)
    : 'Unavailable';
}

function formatNumber(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value)
    ? String(value)
    : 'Unavailable';
}

function formatRateWithCount(value: unknown): string {
  const ratio = asRecord(value);
  if (!ratio) return 'Unavailable';
  return `${formatAlertsPer100EmployeeDays(ratio)} (${formatCount(ratio.numerator)} of ${formatCount(ratio.denominator)})`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null;
}
