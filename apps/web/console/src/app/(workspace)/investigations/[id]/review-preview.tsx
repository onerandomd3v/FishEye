'use client';

import { useState, type FormEvent } from 'react';
import { Button, Notice } from '@fisheye/ui';

export function ReviewPreview({ accountId }: { accountId: string }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [decision, setDecision] = useState('');

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!decision) return;
    setMessage(
      `Preview only: “${decision}” was not saved for ${accountId}. The review API is not connected.`,
    );
  }

  if (message)
    return (
      <p className="local-confirmation" role="status">
        {message}
      </p>
    );
  if (!open)
    return (
      <div className="button-stack">
        <Button type="button" onClick={() => setOpen(true)}>
          Preview review form
        </Button>
      </div>
    );

  return (
    <form className="review-form" onSubmit={submit}>
      <div className="field">
        <label htmlFor="review-decision">Example review decision</label>
        <select
          id="review-decision"
          required
          value={decision}
          onChange={(event) => setDecision(event.target.value)}
        >
          <option value="">Choose a decision</option>
          <option value="under review">Under review</option>
          <option value="benign">Benign</option>
          <option value="escalate for review">Escalate for review</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="review-note">Note (optional)</label>
        <textarea
          id="review-note"
          placeholder="Add a short note for this preview"
        />
      </div>
      <Notice title="Preview only">
        Submitting this form changes no stored review state. No review is sent
        or saved.
      </Notice>
      <div className="button-stack">
        <Button type="submit">Preview response</Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => setOpen(false)}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
