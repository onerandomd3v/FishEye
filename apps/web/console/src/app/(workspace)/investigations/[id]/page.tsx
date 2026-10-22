import { PageHeading } from '../../shared';
import { InvestigationDetail } from '../detail';
import { normalizeFindingRouteId } from '../data';

export default async function InvestigationDetailPage({
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
  const canonicalId = normalizeFindingRouteId(id);
  const querySuffix =
    runId && /^[\da-f-]{36}$/i.test(runId) && detector
      ? `?run_id=${encodeURIComponent(runId)}&detector=${detector}`
      : '';
  const historyHref = `/investigations/${encodeURIComponent(canonicalId)}/history${querySuffix}`;

  return (
    <>
      <PageHeading
        title="Investigate finding"
        description="Review the evidence and add your assessment."
      />
      <InvestigationDetail
        findingId={id}
        queueHref={queueHref}
        historyHref={historyHref}
      />
    </>
  );
}
