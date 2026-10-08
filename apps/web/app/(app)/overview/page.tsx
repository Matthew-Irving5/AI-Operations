import Link from 'next/link';
import { operationsData, reportsData, spendData } from '../../../lib/platform-data';
import { Alert, EmptyState, Heading, Surface, Text } from '@ai-operations/ui';

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
      <Heading level={1}>Overview</Heading>
      <Text className="notice">
        AAL2 control-plane status is calculated from your own operational records. Schedules remain
        off until production onboarding is accepted.
      </Text>
      {(operationsError ?? reportsError ?? forecast.error ?? calls.error) ? (
        <Alert tone="danger" title="Overview data is incomplete">
          {operationsError ?? reportsError ?? forecast.error ?? calls.error}
        </Alert>
      ) : null}
      <section aria-label="Operations summary" className="ui-metric-grid">
        {cards.map(([label, value]) => (
          <Surface as="article" className="ui-metric" key={label}>
            <Text className="label" size="meta" tone="secondary">
              {label}
            </Text>
            <strong className="ui-metric__value tabular-nums">{value}</strong>
          </Surface>
        ))}
      </section>
      <Heading level={2}>Latest reports</Heading>
      {reports.length === 0 ? (
        <EmptyState title="No reports yet">
          Connect approved sources and use an individual bounded request or accepted schedule.
        </EmptyState>
      ) : (
        <section aria-label="Latest reports" className="ui-report-list">
          {reports.slice(0, 5).map((report) => (
            <Surface as="article" className="ui-report" key={report.id}>
              <Text className="label" size="meta" tone="secondary">
                {report.report_type} ·{' '}
                {new Date(report.created_at).toLocaleString('en-GB', { timeZone: 'Europe/London' })}
              </Text>
              <Heading level={3}>{report.title}</Heading>
              <Text>{report.summary}</Text>
            </Surface>
          ))}
        </section>
      )}
      <Surface as="aside" variant="subtle">
        Review <Link href="/operations">operations</Link>, <Link href="/approvals">approvals</Link>,
        and <Link href="/spend-forecasting">spend forecasts</Link> for actionable detail.
      </Surface>
    </>
  );
}
