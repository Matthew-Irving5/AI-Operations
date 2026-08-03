import { onDemandData } from '../../../lib/platform-data';

export default async function ProcurementPage() {
  const { runs } = await onDemandData('procurement');
  return (
    <>
      <h1>Consumer &amp; Procurement</h1>
      <p className="notice">
        Research is on-demand and bounded. Recommendations must retain compliance exclusions,
        citations, total ownership cost, warranty, returns, and uncertainty.
      </p>
      {runs.error ? (
        <p role="alert" className="notice">
          {runs.error}
        </p>
      ) : null}
      <h2>Research requests</h2>
      {runs.data.length ? (
        <section className="stack">
          {runs.data.map((run) => (
            <article className="card" key={run.id}>
              <h3>{run.status}</h3>
              <p>
                Cap: {run.hard_cap_minor} minor units; searches: {run.searches_used}/
                {run.search_limit}.
              </p>
            </article>
          ))}
        </section>
      ) : (
        <p className="card">
          No research request has been launched. Start with an item or service, purpose, hard
          requirements, budget, required date, and market.
        </p>
      )}
      <p className="card">
        The result distinguishes best overall, best value, and any justified premium option.
        Purchases and receipts can be retained to track return windows and warranties.
      </p>
    </>
  );
}
