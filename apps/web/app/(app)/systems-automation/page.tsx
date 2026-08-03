import Link from 'next/link';
import { operationsData, schedulesData } from '../../../lib/platform-data';

export default async function SystemsAutomationPage() {
  const [{ data: schedules }, { data: operations, error }] = await Promise.all([
    schedulesData(),
    operationsData(),
  ]);
  const activeSchedules = schedules.filter((schedule) => schedule.enabled).length;

  return (
    <>
      <h1>Systems &amp; Automation</h1>
      <p className="notice">
        Schedules stay disabled until the production onboarding acceptance is recorded with fresh
        MFA.
      </p>
      <section className="grid">
        <article className="card">
          <div className="label">Enabled schedules</div>
          <div className="value">{activeSchedules}</div>
        </article>
        <article className="card">
          <div className="label">Running workflows</div>
          <div className="value">{operations.running}</div>
        </article>
        <article className="card">
          <div className="label">Automation safety</div>
          <div className="value">Approval-gated</div>
        </article>
      </section>
      {error ? (
        <p className="notice" role="alert">
          {error}
        </p>
      ) : null}
      <h2>Control surfaces</h2>
      <p className="card">
        Manage schedule state in <Link href="/automations">Automations</Link>. Workflow
        cancellation, approvals, and audit history remain available from their dedicated
        authenticated views.
      </p>
    </>
  );
}
