import Link from 'next/link';

const states = [
  {
    title: 'No findings',
    text: 'No results are available. This preview has not connected to a findings service.',
    action: 'Clear filters',
    href: '/investigations',
  },
  {
    title: 'Checking activity',
    text: 'A loading pattern for a future backend request. No analysis is running in this preview.',
    action: 'Processing…',
    href: '/overview',
  },
  {
    title: 'Request unavailable',
    text: 'The backend service is not connected. No result was created.',
    action: 'Retry request',
    href: '/overview',
  },
  {
    title: 'Preview action',
    text: 'Actions in this workspace are local previews and are not saved to a server.',
    action: 'Return to overview',
    href: '/overview',
  },
];

export default function StatesPage() {
  return (
    <main className="state-page">
      <p className="metric-label">FISHEYE / UI STATES</p>
      <h1>System states</h1>
      <p className="state-intro">
        Shared patterns for loading, empty results, unavailable services and
        preview-only actions.
      </p>
      <div className="state-grid">
        {states.map((state, index) => (
          <section
            className="card state-card"
            key={state.title}
            aria-labelledby={`state-${index}`}
          >
            <h2 id={`state-${index}`}>{state.title}</h2>
            <p>{state.text}</p>
            {index === 1 ? (
              <span
                className="fe-button fe-button-secondary"
                aria-disabled="true"
              >
                {state.action}
              </span>
            ) : (
              <Link className="fe-button fe-button-secondary" href={state.href}>
                {state.action}
              </Link>
            )}
          </section>
        ))}
      </div>
      <p className="state-back">
        <Link href="/overview">Return to the workspace</Link>
      </p>
    </main>
  );
}
