import { healthData } from '../../../lib/platform-data';

export default async function HealthPage() {
  const { summaries, importCount } = await healthData();
  return (
    <>
      <h1>Health &amp; Performance</h1>
      <p className="notice">
        Health data is private, retained with provenance, and presented for reflection—not diagnosis
        or treatment.
      </p>
      {(summaries.error ?? importCount.error) ? (
        <p role="alert" className="notice">
          {summaries.error ?? importCount.error}
        </p>
      ) : null}
      <section className="grid" aria-label="Health source status">
        <article className="card">
          <div className="label">Imported source bundles</div>
          <div className="value">{importCount.data}</div>
        </article>
        <article className="card">
          <div className="label">Daily summaries</div>
          <div className="value">{summaries.data.length}</div>
        </article>
      </section>
      <h2>Data completeness</h2>
      {summaries.data.length ? (
        <section className="stack">
          {summaries.data.map((summary) => (
            <article className="card" key={summary.summary_date}>
              <h3>{summary.summary_date}</h3>
              <p>
                Confidence: {summary.data_confidence}; completeness:{' '}
                {Math.round(summary.completeness * 100)}%.
              </p>
            </article>
          ))}
        </section>
      ) : (
        <p className="card">
          No Health export has been processed. Configure a supported Apple Health exporter; raw
          payloads are archived before processing.
        </p>
      )}
      <h2>Safety</h2>
      <p className="card">
        Reports expose missing data and unusual values for professional review. They do not diagnose
        conditions, prescribe treatment, or recommend dangerous deficits or abrupt training-load
        changes.
      </p>
    </>
  );
}
