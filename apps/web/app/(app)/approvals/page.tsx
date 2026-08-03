import { approvalsData } from '../../../lib/platform-data';
import { ApprovalDecisionForm } from './decision-form';

export default async function ApprovalsPage() {
  const { data: approvals, error } = await approvalsData();
  return (
    <>
      <h1>Approvals</h1>
      <p className="notice">
        Approving or rejecting a sensitive action requires MFA completed within the last five
        minutes.
      </p>
      {error ? (
        <p className="notice" role="alert">
          {error}
        </p>
      ) : null}
      {approvals.length === 0 ? (
        <p className="card">No approvals are waiting for a decision.</p>
      ) : (
        <section className="stack" aria-label="Approvals">
          {approvals.map((approval) => (
            <article className="card" key={approval.id}>
              <div className="label">
                {approval.decision} · expires{' '}
                {new Date(approval.expires_at).toLocaleString('en-GB', {
                  timeZone: 'Europe/London',
                })}
              </div>
              <h2>{approval.actions?.title ?? 'Sensitive action'}</h2>
              <p>
                Risk: {approval.actions?.risk_class ?? 'unknown'} · Required assurance:{' '}
                {approval.required_aal}
              </p>
              {approval.decision === 'pending' ? (
                <ApprovalDecisionForm approvalId={approval.id} />
              ) : null}
            </article>
          ))}
        </section>
      )}
    </>
  );
}
