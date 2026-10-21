'use client';

import { useState } from 'react';
import { Button } from '@fisheye/ui';
import { scenarioFixtures } from '../fixtures';

export function ScenarioPicker() {
  const [selected, setSelected] = useState(scenarioFixtures[0]?.id ?? '');
  const [message, setMessage] = useState('');
  const scenario = scenarioFixtures.find((item) => item.id === selected);

  return (
    <div className="scenario-grid">
      <section className="card card-pad" aria-labelledby="scenario-title">
        <h2 id="scenario-title">Select a synthetic case</h2>
        <div
          className="scenario-list"
          role="group"
          aria-label="Synthetic scenarios"
        >
          {scenarioFixtures.map((item) => (
            <button
              className="scenario-option"
              type="button"
              key={item.id}
              aria-pressed={selected === item.id}
              onClick={() => {
                setSelected(item.id);
                setMessage('');
              }}
            >
              <strong>
                {item.id} · {item.name}
              </strong>
              <span>{item.description}</span>
            </button>
          ))}
        </div>
        <div className="button-stack">
          <Button
            type="button"
            onClick={() =>
              setMessage(
                'The evaluation service is not connected. No run was started and no result was created.',
              )
            }
          >
            Start evaluation <span aria-hidden="true">→</span>
          </Button>
        </div>
        {message && (
          <p className="local-confirmation" role="status">
            {message}
          </p>
        )}
      </section>
      <section
        className="card card-pad scenario-result"
        aria-labelledby="scenario-preview-title"
      >
        <span className="fixture-tag">
          Scenario definition · no run created
        </span>
        {scenario ? (
          <div className="result-empty">
            <p className="metric-label">
              SELECTED SYNTHETIC CASE / {scenario.id}
            </p>
            <h2 id="scenario-preview-title">{scenario.name}</h2>
            <p className="scenario-description">{scenario.description}</p>
            <div className="context-block">
              <span className="context-label">Scoring result</span>
              <strong>Not available</strong>
              <p>
                No scoring engine or evaluation job is connected to this
                interface.
              </p>
            </div>
            <h3 className="subheading">Scenario constraints</h3>
            <ul className="plain-list">
              <li>Scenario text describes a synthetic test condition.</li>
              <li>Ground-truth labels must remain outside detector inputs.</li>
              <li>No score, priority or successful run is fabricated.</li>
            </ul>
          </div>
        ) : null}
      </section>
    </div>
  );
}
