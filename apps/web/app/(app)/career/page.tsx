import { careerData } from '../../../lib/platform-data';

export default async function CareerPage() {
  const { evidence, sourceCount } = await careerData();
  return (
    <>
      <h1>Career Operations</h1>
      <p className="notice">
        GitHub is read-only and restricted to the configured personal account. No outreach is ever
        sent automatically.
      </p>
      {(evidence.error ?? sourceCount.error) ? (
        <p role="alert" className="notice">
          {evidence.error ?? sourceCount.error}
        </p>
      ) : null}
      <section className="grid" aria-label="Career evidence status">
        <article className="card">
          <div className="label">GitHub evidence records</div>
          <div className="value">{evidence.data.length}</div>
        </article>
        <article className="card">
          <div className="label">Cited market sources</div>
          <div className="value">{sourceCount.data}</div>
        </article>
      </section>
      <h2>Evidence and source provenance</h2>
      {evidence.data.length ? (
        <section className="stack">
          {evidence.data.map((item) => (
            <article className="card" key={`${item.repository_name}:${item.evidence_kind}`}>
              <h3>{item.repository_name}</h3>
              <p>
                {item.evidence_kind}; retrieved{' '}
                {new Date(item.retrieved_at).toLocaleString('en-GB')}.
              </p>
            </article>
          ))}
        </section>
      ) : (
        <p className="card">
          No personal repository evidence is retained yet. Connect the read-only GitHub integration
          to start a daily evidence sync.
        </p>
      )}
      <p className="card">
        Skills, goals, opportunities, market claims, and salary ranges must retain attributable
        evidence and current citations before inclusion in a report.
      </p>
    </>
  );
}
