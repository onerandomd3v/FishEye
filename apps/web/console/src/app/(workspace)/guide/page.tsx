import Link from 'next/link';
import { PageHeading } from '../shared';

const methods = [
  {
    title: 'Simple rules',
    text: 'A fixed starting point. It adds points for out-of-role access, unusually high activity, or five or more failed sign-ins. A score of 40 or more is flagged.',
  },
  {
    title: 'Tuned rules',
    text: 'Uses the same rule score, but chooses its cutoff from the calibration data. It aims to reduce alerts while keeping threat-catching within five percentage points of the simple rules on that calibration data.',
  },
  {
    title: 'Contextual scoring',
    text: 'Combines role permissions, personal or role activity history, failed sign-ins, device and location familiarity, and work schedule. More context can help explain unusual activity.',
  },
];

const metrics = [
  {
    term: 'Score cutoff',
    definition: 'The minimum score that creates a finding.',
  },
  {
    term: 'Alerts correct',
    definition:
      'Of the findings raised, how many were threat days. The count shows correct alerts out of all alerts.',
  },
  {
    term: 'Threats caught',
    definition:
      'Of the threat days in the evaluation, how many were flagged. The count shows threats caught out of all threat days.',
  },
  {
    term: 'False alarm rate',
    definition: 'Of the benign days, how many were flagged by mistake.',
  },
  {
    term: 'Alerts per 100 person-days',
    definition:
      'The number of findings scaled to 100 person-days. This is a rate, not a percentage.',
  },
  {
    term: 'Person-day',
    definition:
      'One employee on one UTC calendar day. Each method counts that day once.',
  },
];

export default function GuidePage() {
  return (
    <>
      <PageHeading
        title="Guide"
        description="A quick guide to methods and evaluation results."
      />

      <div className="guide-content">
        <section className="guide-section" id="methods">
          <h2>How the methods work</h2>
          <p className="guide-intro">
            All three methods are compared on the same evaluation data.
          </p>
          <div className="guide-method-list">
            {methods.map((method) => (
              <article key={method.title}>
                <h3>{method.title}</h3>
                <p>{method.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="guide-section" id="results">
          <h2>How to read results</h2>
          <dl className="guide-definitions">
            {metrics.map((metric) => (
              <div key={metric.term}>
                <dt>{metric.term}</dt>
                <dd>{metric.definition}</dd>
              </div>
            ))}
          </dl>
          <p className="guide-note">
            These results are experimental. They describe this dataset and do
            not establish real-world performance.
          </p>
        </section>

        <Link className="guide-back-link" href="/evaluation">
          Back to evaluation
        </Link>
      </div>
    </>
  );
}
