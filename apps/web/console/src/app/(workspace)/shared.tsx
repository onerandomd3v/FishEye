import type { ReactNode } from 'react';
import { Notice } from '@fisheye/ui';

export function PageHeading({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        {action}
      </div>
      <hr className="page-divider" />
    </>
  );
}

export function FixtureNotice() {
  return (
    <Notice
      title="Sample preview"
      className="fixture-notice"
    >
      These examples are for preview only. No data is saved and no scores are
      calculated.
    </Notice>
  );
}

export function MetricCard({
  label,
  value = 'Not available',
  help = 'Backend not connected',
}: {
  label: string;
  value?: string;
  help?: string;
}) {
  return (
    <article className="card metric-card">
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
      <div className="metric-help">{help}</div>
    </article>
  );
}

export function EmptyState({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div>
        <h2>{title}</h2>
        <p>{children}</p>
      </div>
    </div>
  );
}
