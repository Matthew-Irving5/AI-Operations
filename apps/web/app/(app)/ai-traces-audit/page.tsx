import { tracesData } from '../../../lib/platform-data';

export default async function TracesPage() {
  const { data: traces, error } = await tracesData();
  return (
    <>
      <h1>AI Traces &amp; Audit</h1>
      <p className="notice">
        Trace payloads are redacted by default. Full sensitive payloads require fresh MFA.
      </p>
      {error ? (
        <p className="notice" role="alert">
          {error}
        </p>
      ) : null}
      {traces.length === 0 ? (
        <p className="card">No workflow traces yet.</p>
      ) : (
        <section className="stack" aria-label="Workflow traces">
          {traces.map((trace) => (
            <article className="card" key={trace.id}>
              <div className="label">
                {trace.severity} ·{' '}
                {new Date(trace.created_at).toLocaleString('en-GB', { timeZone: 'Europe/London' })}
              </div>
              <h2>{trace.event_type}</h2>
              <p>
                Correlation: <code>{trace.correlation_id}</code>
              </p>
            </article>
          ))}
        </section>
      )}
    </>
  );
}
