import Link from 'next/link';
import { FixtureNotice, MetricCard, PageHeading } from '../shared';
import { investigationFixtures } from '../fixtures';

export default function OverviewPage() {
  return (
    <>
      <PageHeading
        title="Risk overview"
        description="Prioritize meaningful alerts without overreacting to legitimate activity."
      />
      <FixtureNotice />
      <section className="metrics-grid" aria-label="Overview metrics">
        <MetricCard label="Accounts monitored" />
        <MetricCard label="Flagged accounts" />
        <MetricCard label="High priority" />
        <MetricCard
          label="False alerts per run"
          help="No evaluation run available"
        />
      </section>
      <section className="card section-card" aria-labelledby="priority-title">
        <div className="section-title-row">
          <h2 id="priority-title">Example findings</h2>
          <span className="fixture-tag">Synthetic fixtures</span>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <caption className="visually-hidden">
              Illustrative synthetic account examples. No detector has scored
              these examples.
            </caption>
            <thead>
              <tr>
                <th scope="col">Account</th>
                <th scope="col">Example context</th>
                <th scope="col">Risk score</th>
                <th scope="col">Priority</th>
              </tr>
            </thead>
            <tbody>
              {investigationFixtures.map((item) => (
                <tr key={item.id}>
                  <td>
                    <Link href={`/investigations/${item.id}`}>{item.id}</Link>
                  </td>
                  <td>{item.description}</td>
                  <td>Not calculated</td>
                  <td>
                    <span className="fixture-tag">Not assigned</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="below-table-note">
          Priority is not calculated in this preview. A review priority is not
          proof of employee wrongdoing.
        </p>
        <div className="table-actions">
          <Link className="fe-button fe-button-primary" href="/investigations">
            Review examples <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>
    </>
  );
}
