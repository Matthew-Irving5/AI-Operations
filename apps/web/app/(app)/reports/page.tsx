import { feedbackCategoriesData, reportsData } from '../../../lib/platform-data';
import { FeedbackForm } from './feedback-form';

export default async function ReportsPage() {
  const [{ data: reports, error }, { data: categories }] = await Promise.all([
    reportsData(),
    feedbackCategoriesData(),
  ]);
  return (
    <>
      <h1>Reports</h1>
      <p className="notice">
        Validated reports retain their correlation, prompt, model, evidence, and feedback context.
      </p>
      {error ? (
        <p className="notice" role="alert">
          {error}
        </p>
      ) : null}
      {reports.length === 0 ? (
        <p className="card">No validated reports are available yet.</p>
      ) : (
        <section className="stack" aria-label="Reports">
          {reports.map((report) => (
            <article className="card" key={report.id}>
              <div className="label">
                {report.status} ·{' '}
                {new Date(report.created_at).toLocaleString('en-GB', { timeZone: 'Europe/London' })}
              </div>
              <h2>{report.title}</h2>
              <p>{report.summary}</p>
              <FeedbackForm
                reportId={report.id}
                categories={categories
                  .filter((category) => category.workflow_code === report.report_type)
                  .map((category) => category.label)}
              />
            </article>
          ))}
        </section>
      )}
    </>
  );
}
