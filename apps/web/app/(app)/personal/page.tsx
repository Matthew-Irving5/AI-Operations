import { personalOperationsData } from '../../../lib/platform-data';

export default async function PersonalOperationsPage() {
  const { events, reminders, routines } = await personalOperationsData();
  const error = events.error ?? reminders.error ?? routines.error;
  return (
    <>
      <h1>Personal Operations</h1>
      <p className="notice">
        Calendar, reminders, routines, and planning data are kept private to your authenticated
        account. Connect Google or the Apple Shortcut before enabling schedules.
      </p>
      {error ? (
        <p role="alert" className="notice">
          {error}
        </p>
      ) : null}
      <section className="grid" aria-label="Personal Operations summary">
        <article className="card">
          <div className="label">Upcoming commitments</div>
          <div className="value">{events.data.length}</div>
        </article>
        <article className="card">
          <div className="label">Open reminders</div>
          <div className="value">{reminders.data.length}</div>
        </article>
        <article className="card">
          <div className="label">Active routines</div>
          <div className="value">{routines.data.length}</div>
        </article>
      </section>
      <h2>Upcoming calendar</h2>
      {events.data.length ? (
        <section className="stack">
          {events.data.map((event) => (
            <article className="card" key={event.id}>
              <div className="label">{event.source}</div>
              <h3>{event.title}</h3>
              <p>
                {new Date(event.starts_at).toLocaleString('en-GB', { timeZone: 'Europe/London' })} –{' '}
                {new Date(event.ends_at).toLocaleTimeString('en-GB', { timeZone: 'Europe/London' })}
              </p>
            </article>
          ))}
        </section>
      ) : (
        <p className="card">
          No upcoming calendar events. Connect a selected calendar or send an Apple Shortcut
          snapshot.
        </p>
      )}
      <h2>Reminders</h2>
      {reminders.data.length ? (
        <section className="stack">
          {reminders.data.map((reminder) => (
            <article className="card" key={reminder.id}>
              <h3>{reminder.title}</h3>
              <p className="label">
                {reminder.list_name} · priority {reminder.priority} ·{' '}
                {reminder.due_at
                  ? new Date(reminder.due_at).toLocaleString('en-GB', { timeZone: 'Europe/London' })
                  : 'No due date'}
              </p>
            </article>
          ))}
        </section>
      ) : (
        <p className="card">No open reminders have been imported.</p>
      )}
      <h2>Routines</h2>
      {routines.data.length ? (
        <ul>
          {routines.data.map((routine) => (
            <li key={routine.id}>
              {routine.title} — {routine.cadence}
            </li>
          ))}
        </ul>
      ) : (
        <p className="card">No routines configured.</p>
      )}
    </>
  );
}
