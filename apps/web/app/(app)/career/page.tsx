import { careerData } from '../../../lib/platform-data';
import { selectMfaFactors } from '../../../lib/mfa-factor-selection';
import { createSupabaseServerClient } from '../../../lib/supabase-server';
import { GithubSyncControl } from './github-sync-control';

export default async function CareerPage() {
  const { evidence, sourceCount, evidenceSnapshot } = await careerData();
  const supabase = await createSupabaseServerClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const factorSelection = selectMfaFactors(factors?.totp);
  return (
    <>
      <h1>Career Operations</h1>
      <p className="notice">
        GitHub is read-only and restricted to the configured personal account. No outreach is ever
        sent automatically.
      </p>
      <GithubSyncControl
        availableFactors={factorSelection.availableFactors}
        {...(factorSelection.defaultFactorId
          ? { defaultFactorId: factorSelection.defaultFactorId }
          : {})}
      />
      {(evidence.error ?? sourceCount.error) ? (
        <p role="alert" className="notice">
          {evidence.error ?? sourceCount.error}
        </p>
      ) : null}
      <section className="grid" aria-label="Career evidence status">
        <article className="card">
          <div className="label">GitHub evidence records</div>
          <div className="value">{evidence.data.length}</div>
        </article>
        <article className="card">
          <div className="label">Cited market sources</div>
          <div className="value">{sourceCount.data}</div>
        </article>
      </section>
      <h2>Evidence and source provenance</h2>
      {evidence.data.length ? (
        <section className="stack">
          {evidence.data.map((item) => (
            <article
              className="card"
              key={`${item.repository_name}:${item.evidence_kind}:${item.source_url}`}
            >
              <h3>{item.repository_name}</h3>
              <p>
                {item.evidence_kind}; source dated{' '}
                {item.source_date
                  ? new Date(item.source_date).toLocaleString('en-GB', {
                      timeZone: 'Europe/London',
                    })
                  : 'date unavailable'}
                ; retrieved{' '}
                {new Date(item.retrieved_at).toLocaleString('en-GB', { timeZone: 'Europe/London' })}
                .
              </p>
              <a href={item.source_url} target="_blank" rel="noreferrer">
                View personal GitHub evidence
              </a>
            </article>
          ))}
        </section>
      ) : (
        <p className="card">
          No personal repository evidence is retained yet. Connect the read-only GitHub integration
          to start a daily evidence sync.
        </p>
      )}
      <h2>Career evidence snapshot</h2>
      {evidenceSnapshot.error ? (
        <p role="alert" className="notice">
          {evidenceSnapshot.error}
        </p>
      ) : evidenceSnapshot.data ? (
        <section className="stack" aria-label="Career evidence snapshot">
          <p className="notice">{evidenceSnapshot.data.statement}</p>
          <h3>Observed technologies</h3>
          {evidenceSnapshot.data.observedTechnologies.map((technology) => (
            <article className="card" key={technology.code}>
              <h4>{technology.label}</h4>
              <p>
                Evidence type: {technology.evidenceStrength.replaceAll('-', ' ')}. This supports
                observed repository use and does not measure proficiency.
              </p>
              <ul>
                {technology.citations.map((citation) => (
                  <li key={citation.evidenceId}>
                    <a href={citation.sourceUrl} target="_blank" rel="noreferrer">
                      {citation.repositoryName} · source dated{' '}
                      {new Date(citation.sourceDate).toLocaleString('en-GB', {
                        timeZone: 'Europe/London',
                      })}
                    </a>
                    <p>
                      Retrieved{' '}
                      {new Date(citation.retrievedAt).toLocaleString('en-GB', {
                        timeZone: 'Europe/London',
                      })}
                    </p>
                  </li>
                ))}
              </ul>
            </article>
          ))}
          <h3>Demonstrated skills</h3>
          {evidenceSnapshot.data.demonstratedSkills.length > 0 ? (
            evidenceSnapshot.data.demonstratedSkills.map((skill) => (
              <article className="card" key={skill.code}>
                <h4>{skill.label}</h4>
                <p>
                  Evidence type: {skill.evidenceStrength.replaceAll('-', ' ')}. This supports a
                  specific authored code contribution, not a proficiency score.
                </p>
                <ul>
                  {skill.citations.map((citation) => (
                    <li key={citation.evidenceId}>
                      <a href={citation.sourceUrl} target="_blank" rel="noreferrer">
                        {citation.repositoryName} pull request · merged{' '}
                        {new Date(citation.sourceDate).toLocaleString('en-GB', {
                          timeZone: 'Europe/London',
                        })}
                      </a>
                      <p>
                        Retrieved{' '}
                        {new Date(citation.retrievedAt).toLocaleString('en-GB', {
                          timeZone: 'Europe/London',
                        })}
                      </p>
                      <ul>
                        {citation.changedFiles.map((file) => (
                          <li key={file.blobUrl}>
                            <a href={file.blobUrl} target="_blank" rel="noreferrer">
                              {file.path}
                            </a>{' '}
                            ({file.additions} added lines)
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              </article>
            ))
          ) : (
            <p className="card">
              Current sync evidence does not support a demonstrated-skill claim. Authored merged
              pull requests need linked source-file changes before a skill appears here.
            </p>
          )}
        </section>
      ) : (
        <p className="card">
          No dated personal repository language evidence is available yet. Sync the read-only GitHub
          integration to assemble an evidence snapshot. Demonstrated-skill claims require evidence
          that supports a specific skill.
        </p>
      )}
      <p className="card">
        Skills, goals, opportunities, market claims, and salary ranges must retain attributable
        evidence and current citations before inclusion in a report.
      </p>
    </>
  );
}
