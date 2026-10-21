'use client';

import { useEffect } from 'react';
import { Button } from '@fisheye/ui';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="state-page">
      <section className="card card-pad">
        <p className="metric-label">REQUEST ERROR</p>
        <h1>We couldn’t open this page</h1>
        <p className="state-intro">
          The request failed. Your data was not changed. Try again or return to
          the workspace.
        </p>
        <Button type="button" onClick={reset}>
          Try again
        </Button>
      </section>
    </main>
  );
}
