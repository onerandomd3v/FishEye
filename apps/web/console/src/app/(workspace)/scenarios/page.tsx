import { FixtureNotice, PageHeading } from '../shared';
import { ScenarioPicker } from './scenario-picker';

export default function ScenariosPage() {
  return (
    <>
      <PageHeading
        title="Scenario lab"
        description="Review versioned synthetic case definitions before an evaluation service is connected."
      />
      <FixtureNotice />
      <ScenarioPicker />
    </>
  );
}
