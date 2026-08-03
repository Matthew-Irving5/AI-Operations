import { financeData } from '../../../lib/platform-data';

export default async function FinancePage() {
  const { closes, transactionCount } = await financeData();
  return (
    <>
      <h1>Finance Operations</h1>
      <p className="notice">
        Statements are archived before parsing. The system never makes payments, transfers,
        investments, or account-setting changes.
      </p>
      {(closes.error ?? transactionCount.error) ? (
        <p role="alert" className="notice">
          {closes.error ?? transactionCount.error}
        </p>
      ) : null}
      <section className="grid" aria-label="Finance status">
        <article className="card">
          <div className="label">Retained transactions</div>
          <div className="value">{transactionCount.data}</div>
        </article>
        <article className="card">
          <div className="label">Close periods</div>
          <div className="value">{closes.data.length}</div>
        </article>
      </section>
      <h2>Close readiness</h2>
      {closes.data.length ? (
        <section className="stack">
          {closes.data.map((close) => (
            <article className="card" key={close.id}>
              <h3>
                {close.close_kind} close: {close.period_start} – {close.period_end}
              </h3>
              <p>
                {close.readiness}; reconciliation {close.reconciled ? 'complete' : 'pending'}.
              </p>
            </article>
          ))}
        </section>
      ) : (
        <p className="card">
          No close has been prepared. Upload a supported CSV, OFX/QIF, PDF, or XLSX statement
          through the secure ingestion route.
        </p>
      )}
      <p className="card">
        Raw statement download and export require fresh MFA and remain unavailable from this
        overview.
      </p>
    </>
  );
}
