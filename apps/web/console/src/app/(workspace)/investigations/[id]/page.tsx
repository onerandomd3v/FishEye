import { PageHeading } from '../../shared';
import { InvestigationDetail } from '../detail';

export default async function InvestigationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const findingId = id;

  return (
    <>
      <PageHeading
        title="Investigate finding"
        description="Inspect stored synthetic evidence and record a development review outcome."
      />
      <InvestigationDetail findingId={findingId} />
    </>
  );
}
