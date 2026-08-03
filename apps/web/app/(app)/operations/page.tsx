import { operationsData } from '../../../lib/platform-data';

export default async function OperationsPage() {
  const { data, error } = await operationsData();
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
      {error ? (
        <p className="notice" role="alert">
          {error}
        </p>
      ) : null}
      <h2>Queue</h2>
      <p className="card">
        {data.queued === 0
          ? 'No queued work. Schedules remain disabled until onboarding acceptance.'
          : `${data.queued} queued job${data.queued === 1 ? '' : 's'} awaiting a worker lease.`}
      </p>
    </>
  );
}
