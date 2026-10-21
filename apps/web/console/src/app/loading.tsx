export default function Loading() {
  return (
    <main className="state-page" aria-label="Loading page">
      <div className="loading-skeleton" style={{ width: '28%', height: 28 }} />
      <div
        className="loading-skeleton"
        style={{ width: '50%', marginTop: 18 }}
      />
      <div
        className="loading-skeleton"
        style={{ width: '100%', height: 150, marginTop: 34 }}
      />
    </main>
  );
}
