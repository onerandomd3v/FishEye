import { FixtureNotice, PageHeading } from '../shared';
import { InvestigationList } from './list';

export default function InvestigationsPage() {
  return (
    <>
      <PageHeading
        title="Investigations"
        description="Review the synthetic examples and the evidence a future detector would need to explain."
      />
      <FixtureNotice />
      <InvestigationList />
    </>
  );
}
