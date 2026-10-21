import { tracesData } from '../../../lib/platform-data';
import { createSupabaseServerClient } from '../../../lib/supabase-server';
import { ArchivedPayload } from './archived-payload';

export default async function TracesPage() {
  const { data: traces, error } = await tracesData();
  const supabase = await createSupabaseServerClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const factorId = factors?.totp?.find((factor) => factor.status === 'verified')?.id;
  return (
    <>
      <h1>AI Traces &amp; Audit</h1>
      <p className="notice">
        Trace payloads are redacted by default. Full sensitive payloads require fresh MFA.
      </p>
      {error ? (
        <p className="notice" role="alert">
          {error}
        </p>
      ) : null}
      {traces.length === 0 ? (
        <p className="card">No workflow traces yet.</p>
      ) : (
        <section className="stack" aria-label="Workflow traces">
          {traces.map((trace) => (
            <article className="card" key={trace.id}>
              <div className="label">
                {trace.severity} ·{' '}
                {new Date(trace.occurred_at ?? trace.created_at).toLocaleString('en-GB', {
                  timeZone: 'Europe/London',
                })}
              </div>
              <h2>{trace.event_type}</h2>
              <p>
                Correlation: <code>{trace.correlation_id}</code>
              </p>
              {trace.run_id ? (
                <p>
                  Run: <code>{trace.run_id}</code>
                </p>
              ) : null}
              {trace.step_id ? (
                <p>
                  Step: <code>{trace.step_id}</code>
                </p>
              ) : null}
              {trace.ai_call_id ? (
                <p>
                  AI call: <code>{trace.ai_call_id}</code>
                </p>
              ) : null}
              {trace.parent_event_id ? (
                <p>
                  Parent event: <code>{trace.parent_event_id}</code>
                </p>
              ) : null}
              {trace.environment || trace.build_version ? (
                <p>
                  {trace.environment ?? 'Environment unknown'}
                  {trace.build_version ? ` · ${trace.build_version}` : ''}
                </p>
              ) : null}
              {trace.archive_reference ? (
                <ArchivedPayload
                  objectKey={trace.archive_reference.objectKey}
                  {...(factorId ? { factorId } : {})}
                />
              ) : null}
            </article>
          ))}
        </section>
      )}
    </>
  );
}
