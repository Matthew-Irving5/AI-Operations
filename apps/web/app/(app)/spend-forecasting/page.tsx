const metrics = [['Actual to date', '$0.00'], ['Expected to date', '$0.00'], ['Original month-end', '$0.00'], ['Adjusted forecast', '$0.00'], ['Recurring hard cap remaining', '$10.00'], ['Reserved but unspent', '$0.00']];
export default function SpendForecastingPage() {
  return <><h1>AI Spend &amp; Forecasting</h1><p className="notice">Actual, expected, and forecast figures are computed from immutable call and reservation records.</p><section className="grid">{metrics.map(([label, value]) => <article className="card" key={label}><div className="label">{label}</div><div className="value">{value}</div></article>)}</section><h2>Cost history</h2><p className="card">No completed AI calls yet.</p></>;
}
