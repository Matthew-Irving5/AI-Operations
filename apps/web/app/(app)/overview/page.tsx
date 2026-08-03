import Link from 'next/link';
import { operationsData, reportsData, spendData } from '../../../lib/platform-data';

const money = (value: number) => `$${value.toFixed(2)}`;

export default async function Overview() {
  const [
    { data: operations, error: operationsError },
    { data: reports, error: reportsError },
    { forecast, calls },
  ] = await Promise.all([operationsData(), reportsData(), spendData()]);
  const cards = [
    ['Running now', String(operations.running)],
    ['Queued work', String(operations.queued)],
    ['Stale sources', String(operations.stale)],
    ['Monthly actual', money(forecast.data?.actual_spend ?? 0)],
    ['Adjusted forecast', money(forecast.data?.adjusted_month_end ?? 0)],
    ['Waiting approvals', String(operations.approvals)],
  ];
  return (
    <>
      <h1>Overview</h1>
      <p className="notice">
        AAL2 control-plane status is calculated from your own operational records. Schedules remain
        off until production onboarding is accepted.
      </p>
      {(operationsError ?? reportsError ?? forecast.error ?? calls.error) ? (
        <p className="notice" role="alert">
          {operationsError ?? reportsError ?? forecast.error ?? calls.error}
        </p>
      ) : null}
      <section className="grid">
        {cards.map(([label, value]) => (
          <article className="card" key={label}>
            <div className="label">{label}</div>
            <div className="value">{value}</div>
          </article>
        ))}
      </section>
      <h2>Latest reports</h2>
      {reports.length === 0 ? (
        <p className="card">
          No reports yet. Connect approved sources and use an individual bounded request or accepted
          schedule.
        </p>
      ) : (
        <section className="stack">
          {reports.slice(0, 5).map((report) => (
            <article className="card" key={report.id}>
              <div className="label">
                {report.report_type} ·{' '}
                {new Date(report.created_at).toLocaleString('en-GB', { timeZone: 'Europe/London' })}
              </div>
              <h3>{report.title}</h3>
              <p>{report.summary}</p>
            </article>
          ))}
        </section>
      )}
      <p className="card">
        Review <Link href="/operations">operations</Link>, <Link href="/approvals">approvals</Link>,
        and <Link href="/spend-forecasting">spend forecasts</Link> for actionable detail.
      </p>
    </>
  );
}
