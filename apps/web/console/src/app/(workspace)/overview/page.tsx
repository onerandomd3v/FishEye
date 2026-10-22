import { PageHeading } from '../shared';
import { LiveOverview } from './live-overview';

export default function OverviewPage() {
  return (
    <>
      <PageHeading
        title="Risk overview"
        description="See the latest results and findings from completed runs."
      />
      <LiveOverview />
    </>
  );
}
