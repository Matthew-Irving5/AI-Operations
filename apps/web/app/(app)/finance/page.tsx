import { financeData } from '../../../lib/platform-data';
import { createSupabaseServerClient } from '../../../lib/supabase-server';
import FinanceMappingForm from './finance-mapping-form';

export default async function FinancePage() {
  const { closes, transactionCount, accounts, categories, adapters } = await financeData();
  const supabase = await createSupabaseServerClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const factorId = factors?.totp?.find((factor) => factor.status === 'verified')?.id;
  return (
    <>
      <h1>Finance Operations</h1>
      <p className="notice">
        Statements are archived before parsing. The system never makes payments, transfers,
        investments, or account-setting changes.
      </p>
      {(closes.error ??
      transactionCount.error ??
      accounts.error ??
      categories.error ??
      adapters.error) ? (
        <p role="alert" className="notice">
          {closes.error ??
            transactionCount.error ??
            accounts.error ??
            categories.error ??
            adapters.error}
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
          No close has been prepared. Save an account/source mapping, then import the controlled
          four-column CSV shown below through the archive-first route.
        </p>
      )}
      <p className="card">
        Raw statement download and export require fresh MFA and remain unavailable from this
        overview.
      </p>
      <FinanceMappingForm
        accounts={accounts.data}
        categories={categories.data}
        adapters={adapters.data}
        {...(factorId ? { factorId } : {})}
      />
    </>
  );
}
