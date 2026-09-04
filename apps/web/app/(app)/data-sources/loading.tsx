export default function DataSourcesLoading() {
  return (
    <section aria-busy="true" aria-label="Loading data sources">
      <h1>Data Sources</h1>
      <p className="notice" role="status">
        Loading source permissions, device state, and freshness…
      </p>
      <div className="stack" aria-hidden="true">
        <div className="card loading-card" />
        <div className="card loading-card" />
      </div>
    </section>
  );
}
