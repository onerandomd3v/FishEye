import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Button } from '@fisheye/ui';
import { fixtureEvents, investigationFixtures } from '../../fixtures';
import { FixtureNotice, PageHeading } from '../../shared';
import { ReviewPreview } from './review-preview';

export default async function InvestigationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const finding = investigationFixtures.find((item) => item.id === id);
  if (!finding) notFound();

  return (
    <>
      <PageHeading
        title="Investigate activity"
        description="Review the example context and source events. No detector has evaluated this account."
        action={
          <Link
            className="fe-button fe-button-secondary"
            href="/investigations"
          >
            Back to investigations
          </Link>
        }
      />
      <FixtureNotice />
      <div className="detail-meta">
        <span className="fixture-tag">{finding.id} · synthetic fixture</span>
        <span className="fixture-tag">Risk score: Not calculated</span>
      </div>
      <div className="two-column">
        <section className="card card-pad" aria-labelledby="signals-title">
          <h2 id="signals-title">Example signals</h2>
          <p className="card-intro">
            These are scenario descriptions, not detector findings or
            conclusions about intent.
          </p>
          <div className="evidence-list">
            {finding.signals.map((signal, index) => (
              <article className="evidence-row" key={signal}>
                <span className="evidence-number" aria-hidden="true">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <div>
                  <h3>{signal}</h3>
                  <p>
                    Included as an illustrative condition in a synthetic
                    scenario. Baseline comparison is not available.
                  </p>
                </div>
              </article>
            ))}
          </div>
          <h3 className="subheading">Underlying synthetic events</h3>
          <div className="table-wrap" id="event-table">
            <table className="data-table">
              <caption className="visually-hidden">
                Example event references for {finding.id}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Event ID</th>
                  <th scope="col">Time</th>
                  <th scope="col">Example event</th>
                </tr>
              </thead>
              <tbody>
                {fixtureEvents.map((event) => (
                  <tr key={event.id}>
                    <td>{event.id}</td>
                    <td>{event.time}</td>
                    <td>{event.event}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <aside className="card context-card" aria-label="Context and review">
          <h2>Context review</h2>
          <div className="context-block">
            <span className="context-label">Role-aware baseline</span>
            <p>
              Not connected. The product has no employee profile or role
              baseline yet.
            </p>
          </div>
          <div className="context-block">
            <span className="context-label">Interpretation</span>
            <strong>Review priority not assigned</strong>
            <p>
              Multiple unusual signals can warrant review, but do not establish
              intent.
            </p>
          </div>
          <ReviewPreview accountId={finding.id} />
          <div className="button-stack">
            <Button
              variant="secondary"
              type="button"
              onClick={() =>
                document
                  .getElementById('event-table')
                  ?.scrollIntoView({ behavior: 'smooth' })
              }
            >
              View underlying events
            </Button>
          </div>
        </aside>
      </div>
    </>
  );
}
