import { PageHeading } from '../shared';
import { ScenarioLab } from './scenario-lab';

export default function ScenariosPage() {
  return (
    <>
      <PageHeading
        title="Scenario lab"
        description="Run a bundled synthetic sample or upload your own synthetic dataset, then inspect the worker's actual results."
      />
      <ScenarioLab />
    </>
  );
}
