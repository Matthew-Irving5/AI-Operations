import { spendData } from '../../../lib/platform-data';
import { CostChart } from './cost-chart';

const money = (value: number) => `$${value.toFixed(2)}`;

export default async function SpendForecastingPage() {
  const { forecast, calls } = await spendData();
  const metrics = forecast.data
    ? [
        ['Actual to date', money(forecast.data.actual_spend)],
        ['Expected to date', money(forecast.data.expected_completed)],
        ['Original month-end', money(forecast.data.original_month_end)],
        ['Adjusted forecast', money(forecast.data.adjusted_month_end)],
        ['Forecast confidence', forecast.data.confidence],
      ]
    : [
        ['Actual to date', '$0.00'],
        ['Expected to date', '$0.00'],
        ['Original month-end', '$0.00'],
        ['Adjusted forecast', '$0.00'],
        ['Forecast confidence', 'Low'],
      ];
  return (
    <>
      <h1>AI Spend &amp; Forecasting</h1>
      <p className="notice">
        Actual, expected, and forecast figures are computed from immutable call and reservation
        records.
      </p>
      {(forecast.error ?? calls.error) ? (
        <p className="notice" role="alert">
          {forecast.error ?? calls.error}
        </p>
      ) : null}
      <section className="grid">
        {metrics.map(([label, value]) => (
          <article className="card" key={label}>
            <div className="label">{label}</div>
            <div className="value">{value}</div>
          </article>
        ))}
      </section>
      <h2>Cost history</h2>
      <CostChart
        points={[...calls.data]
          .reverse()
          .map((call) => ({
            createdAt: call.created_at,
            actual: call.actual_cost,
            estimated: call.estimated_cost,
          }))}
      />
      {calls.data.length === 0 ? (
        <p className="card">No completed AI calls yet.</p>
      ) : (
        <section className="stack" aria-label="AI call cost history">
          {calls.data.map((call) => (
            <article className="card" key={call.id}>
              <div className="label">
                {call.status} ·{' '}
                {new Date(call.created_at).toLocaleString('en-GB', { timeZone: 'Europe/London' })}
              </div>
              <h3>{call.model_id}</h3>
              <p>
                Actual {money(call.actual_cost)} · estimated {money(call.estimated_cost)}
              </p>
            </article>
          ))}
        </section>
      )}
    </>
  );
}
