import { onDemandData } from '../../../lib/platform-data';

export default async function TravelPage() {
  const { runs, watches } = await onDemandData('travel');
  return (
    <>
      <h1>Travel Planning</h1>
      <p className="notice">
        Each plan is on-demand: its hard cap, search limit, model ceiling, dates, origin,
        travellers, budget, and constraints are recorded before research starts.
      </p>
      {(runs.error ?? watches.error) ? (
        <p role="alert" className="notice">
          {runs.error ?? watches.error}
        </p>
      ) : null}
      <h2>Planning runs</h2>
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
          No plan has been launched. A plan cannot run without an individual hard cap and bounded
          research limit.
        </p>
      )}
      <h2>Price, disruption, readiness and weather watches</h2>
      {watches.data.length ? (
        <section className="stack">
          {watches.data.map((watch) => (
            <article className="card" key={watch.id}>
              <h3>{watch.watch_kind}</h3>
              <p>
                {watch.active ? 'Active' : 'Inactive'}; expires{' '}
                {new Date(watch.expiry_at).toLocaleDateString('en-GB')}.
              </p>
            </article>
          ))}
        </section>
      ) : (
        <p className="card">
          No watches are active. Notifications are sent only for material trigger changes before
          expiry.
        </p>
      )}
      <p className="card">
        Reports include cited sources, itinerary options, expected costs, checks, booking
        dependencies, and a calendar proposal. Booking remains user-controlled.
      </p>
    </>
  );
}
