import type { ReactNode } from 'react';

export function Notice({
  title,
  children,
  className = '',
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <aside className={`fe-notice ${className}`} role="note">
      <span className="fe-notice-mark" aria-hidden="true">
        i
      </span>
      <div>
        <strong>{title}</strong>
        <div className="fe-notice-copy">{children}</div>
      </div>
    </aside>
  );
}
