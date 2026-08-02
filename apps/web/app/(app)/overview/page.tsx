const cards = [
  ['Today', 'No scheduled actions'],
  ['Urgent actions', '0'],
  ['Data freshness', 'No sources connected'],
  ['Monthly spend', '$0.00'],
  ['Forecast', '$0.00'],
  ['Waiting approvals', '0'],
];
export default function Overview() {
  return (
    <>
      <h1>Overview</h1>
      <p className="notice">
        Your control plane is ready. Connect sources during onboarding before enabling schedules.
      </p>
      <section className="grid">
        {cards.map(([label, value]) => (
          <article className="card" key={label}>
            <div className="label">{label}</div>
            <div className="value">{value}</div>
          </article>
        ))}
      </section>
      <h2>Latest reports</h2>
      <p className="card">
        No reports yet. Scheduled runs remain disabled until onboarding is accepted.
      </p>
    </>
  );
}
