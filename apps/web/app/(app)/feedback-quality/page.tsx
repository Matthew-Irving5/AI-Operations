import { feedbackData } from '../../../lib/platform-data';

export default async function FeedbackPage() {
  const { data: feedback, error } = await feedbackData();
  return (
    <>
      <h1>Feedback &amp; Quality</h1>
      <p className="notice">
        Feedback is versioned evidence for quality review; it cannot directly change a production
        prompt.
      </p>
      {error ? (
        <p className="notice" role="alert">
          {error}
        </p>
      ) : null}
      {feedback.length === 0 ? (
        <p className="card">No feedback has been submitted.</p>
      ) : (
        <section className="stack" aria-label="Feedback">
          {feedback.map((item) => (
            <article className="card" key={item.id}>
              <div className="label">
                {item.status} ·{' '}
                {new Date(item.created_at).toLocaleString('en-GB', { timeZone: 'Europe/London' })}
              </div>
              <h2>{item.reports?.title ?? 'Workflow feedback'}</h2>
              <p>
                {item.positive ? 'Helpful' : 'Needs improvement'} ·{' '}
                {item.categories.join(', ') || 'No categories'}
              </p>
            </article>
          ))}
        </section>
      )}
    </>
  );
}
