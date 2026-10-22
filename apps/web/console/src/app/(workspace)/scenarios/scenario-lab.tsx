'use client';

import { useState } from 'react';
import { Button } from '@fisheye/ui';
import { DatasetImport } from './dataset-import';
import { ScenarioPicker, type ScenarioPack } from './scenario-picker';

type SampleFiles = { csv: File; context: File };

export function ScenarioLab() {
  const [selected, setSelected] = useState<ScenarioPack | null>(null);
  const [files, setFiles] = useState<SampleFiles | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
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
      <ScenarioPicker
        selectedId={selected?.id ?? null}
        loadingId={loadingId}
        error={error}
        onSelect={selectScenario}
      />
      {files ? (
        <div className="sample-selection" role="status">
          {selected?.name} selected. Confirm the files are synthetic, then start
          the run below. Download the matching{' '}
          <a href={selected?.context} download>
            context JSON
          </a>{' '}
          if you need to inspect it.{' '}
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setSelected(null);
              setFiles(null);
            }}
          >
            Choose your own files
          </Button>
        </div>
      ) : null}
      <DatasetImport
        key={selected?.id ?? 'manual-upload'}
        initialCsv={files?.csv ?? null}
        initialContextFile={files?.context ?? null}
      />
    </>
  );
}
