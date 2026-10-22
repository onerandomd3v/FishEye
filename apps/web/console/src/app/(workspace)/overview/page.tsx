import { PageHeading } from '../shared';
import { LiveOverview } from './live-overview';

export default function OverviewPage() {
  return (
    <>
      <PageHeading
        title="Risk overview"
        description="Review actual results from completed synthetic evaluation runs."
      />
      <LiveOverview />
    </>
  );
}
