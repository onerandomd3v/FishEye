import { PageHeading } from '../shared';
import { ScenarioLab } from './scenario-lab';

export default function ScenariosPage() {
  return (
    <>
      <PageHeading
        title="Scenario lab"
        description="Choose a sample or upload files, run an evaluation, and review the results."
      />
      <ScenarioLab />
    </>
  );
}
