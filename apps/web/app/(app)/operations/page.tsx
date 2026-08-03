import { operationsData, queueJobsData } from '../../../lib/platform-data';
import { CancelRun } from './cancel-run';

export default async function OperationsPage() {
  const [{ data, error }, { data: jobs, error: jobsError }] = await Promise.all([
    operationsData(),
    queueJobsData(),
  ]);
  const metrics = [
    ['Running now', data.running],
    ['Queued', data.queued],
    ['Failed', data.failed],
    ['Approvals waiting', data.approvals],
    ['Stale sources', data.stale],
  ];
  return (
    <>
      <h1>Operations Centre</h1>
      <section className="grid">
        {metrics.map(([label, value]) => (
          <article className="card" key={label}>
            <div className="label">{label}</div>
            <div className="value">{value}</div>
          </article>
        ))}
      </section>
      {(error ?? jobsError) ? (
        <p className="notice" role="alert">
          {error ?? jobsError}
        </p>
      ) : null}
      <h2>Queue</h2>
      {jobs.length === 0 ? (
        <p className="card">
          No queued work. Schedules remain disabled until onboarding acceptance.
        </p>
      ) : (
        <section className="stack" aria-label="Queue">
          <p>
            {data.queued} queued job{data.queued === 1 ? '' : 's'} awaiting a worker lease.
          </p>
          {jobs.map((job) => (
            <article className="card" key={job.id}>
              <div className="label">
                {job.status} · priority {job.priority} · attempt {job.attempt_count}
              </div>
              <h3>{job.workflow_runs?.workflow_definitions?.code ?? job.job_type}</h3>
              <p>
                {job.workflow_runs?.trigger ?? 'unknown trigger'} · available{' '}
                {new Date(job.available_at).toLocaleString('en-GB', { timeZone: 'Europe/London' })}
              </p>
              {job.status === 'queued' ? <CancelRun runId={job.run_id} /> : null}
            </article>
          ))}
        </section>
      )}
    </>
  );
}
