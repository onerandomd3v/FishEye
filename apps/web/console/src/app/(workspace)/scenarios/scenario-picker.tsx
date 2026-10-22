'use client';

import { Button } from '@fisheye/ui';
import { scenarioPacks } from './packs';

export type ScenarioPack = (typeof scenarioPacks)[number];

export function ScenarioPicker({
  selectedId,
  loadingId,
  error,
  onSelect,
}: {
  selectedId: string | null;
  loadingId: string | null;
  error: string;
  onSelect: (scenario: ScenarioPack) => void;
}) {
  return (
    <section className="card section-card" aria-labelledby="scenario-title">
      <div className="section-title-row">
        <div>
          <p className="metric-label">DEVELOPMENT · SYNTHETIC DATA ONLY</p>
          <h2 id="scenario-title">Choose a sample dataset</h2>
          <p className="card-intro">
            Each sample includes an events CSV and matching context file. It
            uses the same validation and worker flow as your own synthetic data.
          </p>
        </div>
        <a
          className="template-link"
          href="/templates/fisheye-events-v2.csv"
          download
        >
          Download events v2 template
        </a>
      </div>
      <div
        className="scenario-list"
        role="list"
        aria-label="Synthetic sample datasets"
      >
        {scenarioPacks.map((scenario) => (
          <article
            className="scenario-option"
            key={scenario.id}
            role="listitem"
          >
            <div>
              <strong>{scenario.name}</strong>
              <span>{scenario.description}</span>
            </div>
            <Button
              type="button"
              variant={selectedId === scenario.id ? 'secondary' : 'primary'}
              aria-pressed={selectedId === scenario.id}
              disabled={loadingId !== null}
              onClick={() => onSelect(scenario)}
            >
              {loadingId === scenario.id
                ? 'Loading sample…'
                : selectedId === scenario.id
                  ? 'Selected'
                  : 'Use sample'}
            </Button>
            <div className="sample-downloads">
              <a href={scenario.csv} download className="sample-download">
                Download CSV
              </a>
              <a href={scenario.context} download className="sample-download">
                Download context
              </a>
            </div>
          </article>
        ))}
      </div>
      {error ? (
        <p className="import-state import-state-error" role="alert">
          {error}
        </p>
      ) : null}
      <p className="below-table-note">
        Samples are illustrative synthetic inputs. FishEye does not claim these
        results represent real employees, banks, or production performance.
      </p>
    </section>
  );
}
