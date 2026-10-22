import { PageHeading } from '../shared';
import { InvestigationList } from './list';

export default function InvestigationsPage() {
  return (
    <>
      <PageHeading
        title="Investigations"
        description="Review stored findings from completed synthetic evaluation runs."
      />
      <InvestigationList />
    </>
  );
}
