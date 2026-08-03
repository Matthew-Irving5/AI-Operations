const metrics = [
  ['Running now', '0'],
  ['Queued', '0'],
  ['Next 24 hours', '0'],
  ['Failed (7 days)', '0'],
  ['Approvals waiting', '0'],
  ['Stale sources', '0'],
];
export default function OperationsPage() {
  return (
    <>
      <h1>Operations Centre</h1>
      <section className="grid">
        {metrics.map(([label, value]) => (
          <article className="card" key={label}>
            <div className="label">{label}</div>
            <div className="value">{value}</div>
          </article>
        ))}
      </section>
      <h2>Queue</h2>
      <p className="card">No queued work. Schedules remain disabled until onboarding acceptance.</p>
    </>
  );
}
