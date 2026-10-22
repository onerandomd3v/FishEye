'use client';

import { useState } from 'react';
import { Button } from '@fisheye/ui';
import { DatasetImport } from './dataset-import';
import { ScenarioPicker, type ScenarioPack } from './scenario-picker';

type SampleFiles = { csv: File; context: File };

export function ScenarioLab() {
  const [inputMode, setInputMode] = useState<'sample' | 'upload'>('sample');
  const [selected, setSelected] = useState<ScenarioPack | null>(null);
  const [files, setFiles] = useState<SampleFiles | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [runWorking, setRunWorking] = useState(false);
  const [error, setError] = useState('');

  async function selectScenario(scenario: ScenarioPack) {
    if (selected?.id === scenario.id && files) return;
    setLoadingId(scenario.id);
    setError('');
    try {
      const [csvResponse, contextResponse] = await Promise.all([
        fetch(scenario.csv),
        fetch(scenario.context),
      ]);
      if (!csvResponse.ok || !contextResponse.ok) {
        throw new Error('The sample files could not be loaded. Try again.');
      }
      const [csvBlob, contextBlob] = await Promise.all([
        csvResponse.blob(),
        contextResponse.blob(),
      ]);
      if (scenario.id !== selected?.id || !files) {
        setFiles({
          csv: new File(
            [csvBlob],
            scenario.csv.split('/').at(-1) ?? 'sample.csv',
            {
              type: 'text/csv',
            },
          ),
          context: new File(
            [contextBlob],
            scenario.context.split('/').at(-1) ?? 'context.json',
            { type: 'application/json' },
          ),
        });
      }
      setSelected(scenario);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'The sample files could not be loaded.',
      );
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <>
      <div className="scenario-mode" role="group" aria-label="Choose how to start">
        <Button
          type="button"
          variant={inputMode === 'sample' ? 'primary' : 'secondary'}
          aria-pressed={inputMode === 'sample'}
          disabled={runWorking}
          onClick={() => {
            if (inputMode === 'upload') {
              setSelected(null);
              setFiles(null);
            }
            setInputMode('sample');
          }}
        >
          Use a sample
        </Button>
        <Button
          type="button"
          variant={inputMode === 'upload' ? 'primary' : 'secondary'}
          aria-pressed={inputMode === 'upload'}
          disabled={runWorking}
          onClick={() => {
            setInputMode('upload');
            setSelected(null);
            setFiles(null);
          }}
        >
          Upload files
        </Button>
      </div>

      {inputMode === 'sample' && !files ? (
        <ScenarioPicker
          selectedId={selected?.id ?? null}
          loadingId={loadingId}
          disabled={runWorking}
          error={error}
          onSelect={selectScenario}
        />
      ) : null}

      {inputMode === 'sample' && files ? (
        <section className="sample-selection" aria-label="Selected sample">
          <div>
            <span className="metric-label">Selected sample</span>
            <strong>{selected?.name}</strong>
          </div>
          <Button
            type="button"
            variant="secondary"
            disabled={runWorking}
            onClick={() => {
              setSelected(null);
              setFiles(null);
            }}
          >
            Change sample
          </Button>
        </section>
      ) : null}

      {inputMode === 'upload' || files ? (
        <DatasetImport
          key={selected?.id ?? 'manual-upload'}
          initialCsv={files?.csv ?? null}
          initialContextFile={files?.context ?? null}
          onWorkingChange={setRunWorking}
        />
      ) : null}
    </>
  );
}
