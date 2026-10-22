import { PageHeading } from '../../../shared';
import { normalizeFindingRouteId } from '../../data';
import { InvestigationHistory } from '../../history';

export default async function InvestigationHistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    run_id?: string | string[];
    detector?: string | string[];
  }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const runId = Array.isArray(query.run_id) ? query.run_id[0] : query.run_id;
  const requestedDetector = Array.isArray(query.detector)
    ? query.detector[0]
    : query.detector;
  const detector = ['simple_rule', 'tuned_rules', 'contextual'].find(
    (item) => item === requestedDetector,
  );
  const queueHref =
    runId && /^[\da-f-]{36}$/i.test(runId) && detector
      ? `/investigations?run_id=${encodeURIComponent(runId)}&detector=${detector}`
      : '/investigations';
  const findingHref = `/investigations/${encodeURIComponent(normalizeFindingRouteId(id))}${
    runId && /^[\da-f-]{36}$/i.test(runId) && detector
      ? `?run_id=${encodeURIComponent(runId)}&detector=${detector}`
      : ''
  }`;

  return (
    <>
      <PageHeading
        title="Review history"
        description="See what was recorded for this finding and when."
      />
      <InvestigationHistory
        findingId={id}
        findingHref={findingHref}
        queueHref={queueHref}
      />
    </>
  );
}
