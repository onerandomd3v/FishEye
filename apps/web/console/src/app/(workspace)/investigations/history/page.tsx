import { PageHeading } from '../../shared';
import { InvestigationHistoryPage } from '../history-page';

export default function InvestigationReviewHistoryRoute() {
  return (
    <>
      <PageHeading
        title="Review history"
        description="See what analysts recorded across investigations."
      />
      <InvestigationHistoryPage />
    </>
  );
}
