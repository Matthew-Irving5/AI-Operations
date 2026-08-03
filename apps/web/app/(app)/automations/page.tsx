import { schedulesData } from '../../../lib/platform-data';
import { ScheduleToggle } from './schedule-toggle';

export default async function AutomationsPage() {
  const { data: schedules, error } = await schedulesData();
  return (
    <>
      <h1>Automations</h1>
      <p className="notice">
        Schedules are disabled until onboarding acceptance. Time calculations use Europe/London.
      </p>
      {error ? (
        <p className="notice" role="alert">
          {error}
        </p>
      ) : null}
      {schedules.length === 0 ? (
        <p className="card">No schedules are configured.</p>
      ) : (
        <section className="stack" aria-label="Workflow schedules">
          {schedules.map((schedule) => (
            <article className="card" key={schedule.id}>
              <div className="label">
                {schedule.enabled ? 'Enabled' : 'Disabled'} · {schedule.timezone}
              </div>
              <h2>{schedule.workflow_definitions?.code ?? 'Workflow'}</h2>
              <p>
                <code>{schedule.cron_expression}</code> · next due{' '}
                {schedule.next_due_at
                  ? new Date(schedule.next_due_at).toLocaleString('en-GB', {
                      timeZone: 'Europe/London',
                    })
                  : 'not scheduled'}
              </p>
              <ScheduleToggle scheduleId={schedule.id} enabled={schedule.enabled} />
            </article>
          ))}
        </section>
      )}
    </>
  );
}
