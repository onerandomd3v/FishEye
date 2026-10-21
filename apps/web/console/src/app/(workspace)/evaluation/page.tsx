import { Notice } from '@fisheye/ui';
import { FixtureNotice, MetricCard, PageHeading } from '../shared';

const methods = ['Simple rules', 'Tuned rules', 'FishEye contextual scoring'];
const metrics = [
  'Precision',
  'Recall',
  'False-positive rate',
  'Alerts per 100 employee-days',
  'Detection delay',
];

export default function EvaluationPage() {
  return (
    <>
      <PageHeading
        title="Model evaluation"
        description="A fair comparison uses the same synthetic dataset and held-out test inputs for every method."
      />
      <FixtureNotice />
      <section className="metrics-grid" aria-label="Evaluation summary">
        <MetricCard label="Evaluation runs" />
        <MetricCard
          label="Scenario set"
          value="Not selected"
          help="No dataset is connected"
        />
        <MetricCard
          label="Recall tolerance"
          value="Not defined"
          help="Requires a frozen protocol"
        />
        <MetricCard
          label="Results"
          value="Not available"
          help="No completed run"
        />
      </section>
      <div className="evaluation-layout">
        <section
          className="card section-card"
          aria-labelledby="comparison-title"
        >
          <div className="section-title-row">
            <h2 id="comparison-title">Detector comparison</h2>
            <span className="fixture-tag">No run selected</span>
          </div>
          <div className="table-wrap">
            <table className="data-table evaluation-table">
              <caption className="visually-hidden">
                Evaluation metrics are unavailable because the backend and
                evaluation protocol are not connected.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Method</th>
                  {metrics.map((metric) => (
                    <th scope="col" key={metric}>
                      {metric}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {methods.map((method) => (
                  <tr key={method}>
                    <td>{method}</td>
                    {metrics.map((metric) => (
                      <td key={metric}>Not available</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="below-table-note">
            Metrics will appear only after a real, versioned evaluation run
            returns from the backend.
          </p>
        </section>
        <aside className="card card-pad">
          <h2>What we measure</h2>
          <div className="context-block">
            <strong>Precision</strong>
            <p>How many flagged items are true positives?</p>
          </div>
          <div className="context-block">
            <strong>Recall</strong>
            <p>How many injected threats were found?</p>
          </div>
          <div className="context-block">
            <strong>False-positive rate</strong>
            <p>How often is harmless activity flagged?</p>
          </div>
          <div className="context-block">
            <strong>Detection delay</strong>
            <p>How quickly are threats identified?</p>
          </div>
        </aside>
      </div>
      <Notice title="Research integrity" className="evaluation-note">
        A lower alert count alone is not evidence of improvement. Compare
        methods at a predeclared recall tolerance and show missed threats,
        denominators and synthetic-data limitations.
      </Notice>
    </>
  );
}
