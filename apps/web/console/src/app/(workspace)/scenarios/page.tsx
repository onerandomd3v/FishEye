import { PageHeading } from '../shared';
import { ScenarioLab } from './scenario-lab';

export default function ScenariosPage() {
  return (
    <>
      <PageHeading
        title="Scenario lab"
        description="Run an evaluation with a sample or your own files."
      />
      <ScenarioLab />
    </>
  );
}
