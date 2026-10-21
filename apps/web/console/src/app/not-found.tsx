import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="state-page">
      <section className="card card-pad">
        <p className="metric-label">404 · PAGE NOT FOUND</p>
        <h1>This page isn’t here</h1>
        <p className="state-intro">
          The requested example may have been removed or the address may be
          incorrect.
        </p>
        <Link className="fe-button fe-button-primary" href="/overview">
          Return to overview
        </Link>
      </section>
    </main>
  );
}
