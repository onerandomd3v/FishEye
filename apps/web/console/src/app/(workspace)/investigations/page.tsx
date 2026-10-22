import { PageHeading } from '../shared';
import { InvestigationList } from './list';

const detectors = ['simple_rule', 'tuned_rules', 'contextual'] as const;

export default async function InvestigationsPage({
  searchParams,
}: {
  searchParams: Promise<{
    run_id?: string | string[];
    detector?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const runId = Array.isArray(params.run_id) ? params.run_id[0] : params.run_id;
  const requestedDetector = Array.isArray(params.detector)
    ? params.detector[0]
    : params.detector;
  const detector = detectors.find((item) => item === requestedDetector);

  return (
    <>
      <PageHeading
        title="Investigations"
        description="Review flagged activity, record what you learn, and track follow-up."
      />
      <InvestigationList initialRunId={runId} initialDetector={detector} />
    </>
  );
}
