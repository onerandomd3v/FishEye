'use client';

import { useEffect, useRef, useState } from 'react';

type WorkspaceStatus = {
  enabled: boolean;
  run_count: number;
  dataset_count: number;
  review_count: number;
  active_run_count: number;
};

const CONFIRMATION = 'CLEAR ALL DATA';

export function ResetWorkspace() {
  const [status, setStatus] = useState<WorkspaceStatus | null>(null);
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    let current = true;
    void fetch('/api/backend/api/v1/local-workspace', {
      cache: 'no-store',
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('Workspace status is unavailable.');
        return (await response.json()) as WorkspaceStatus;
      })
      .then((value) => {
        if (current) setStatus(value);
      })
      .catch(() => {
        if (current)
          setStatus({
            enabled: false,
            run_count: 0,
            dataset_count: 0,
            review_count: 0,
            active_run_count: 0,
          });
      });
    return () => {
      current = false;
    };
  }, []);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  if (!status?.enabled) return null;

  async function reset() {
    if (confirmation !== CONFIRMATION || busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/backend/api/v1/local-workspace/data', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmation }),
      });
      const result = (await response.json()) as {
        detail?: string;
        deleted_run_count?: number;
        deleted_dataset_count?: number;
        deleted_review_count?: number;
        artifacts_removed?: boolean;
      };
      if (!response.ok)
        throw new Error(result.detail ?? 'Workspace could not be cleared.');
      setStatus({
        enabled: true,
        run_count: 0,
        dataset_count: 0,
        review_count: 0,
        active_run_count: 0,
      });
      setNotice(
        result.artifacts_removed
          ? 'Saved runs, reviews, datasets, and files were cleared.'
          : 'Saved records were cleared, but some stored files still need cleanup.',
      );
      setOpen(false);
      setConfirmation('');
      window.dispatchEvent(new Event('fisheye-workspace-reset'));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Workspace could not be cleared.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="workspace-reset-action">
        {notice && (
          <p className="reset-result" role="status">
            {notice}
          </p>
        )}
        <button
          className="fe-button fe-button-secondary"
          type="button"
          onClick={() => {
            setError('');
            setOpen(true);
          }}
          disabled={status.active_run_count > 0}
          title={
            status.active_run_count > 0
              ? 'Wait for active evaluations to finish.'
              : undefined
          }
        >
          Clear saved data
        </button>
      </div>
      <dialog
        ref={dialog}
        className="workspace-reset-dialog"
        aria-labelledby="workspace-reset-title"
        aria-describedby="workspace-reset-description"
        onCancel={() => setOpen(false)}
        onClose={() => setOpen(false)}
      >
        <h2 id="workspace-reset-title">Clear saved workspace data?</h2>
        <p id="workspace-reset-description">
          This permanently deletes {status.run_count}{' '}
          {status.run_count === 1 ? 'run' : 'runs'}, {status.review_count}{' '}
          {status.review_count === 1 ? 'review' : 'reviews'},{' '}
          {status.dataset_count}{' '}
          {status.dataset_count === 1 ? 'dataset' : 'datasets'}, and their
          stored files.
        </p>
        {status.active_run_count > 0 && (
          <p className="reset-error" role="alert">
            An evaluation is queued or running. Wait for it to finish before
            clearing data.
          </p>
        )}
        {error && (
          <p className="reset-error" role="alert">
            {error}
          </p>
        )}
        <label className="field" htmlFor="workspace-reset-confirmation">
          <span>Type CLEAR ALL DATA to continue</span>
          <input
            id="workspace-reset-confirmation"
            autoComplete="off"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
          />
        </label>
        <div className="workspace-reset-buttons">
          <button
            className="fe-button fe-button-secondary"
            type="button"
            onClick={() => setOpen(false)}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            className="fe-button fe-button-primary"
            type="button"
            onClick={() => void reset()}
            disabled={
              busy ||
              confirmation !== CONFIRMATION ||
              status.active_run_count > 0
            }
          >
            {busy ? 'Clearing…' : 'Clear everything'}
          </button>
        </div>
      </dialog>
    </>
  );
}
