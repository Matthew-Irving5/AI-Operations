import { onDemandData } from '../../../lib/platform-data';
import { procurementLaunchRequestSchema } from '@ai-operations/contracts';
import { OnDemandLaunchForm } from '../on-demand-launch-form';

export default async function ProcurementPage() {
  const { runs } = await onDemandData('procurement');
  const formatMoney = (minor: number | null, currency: string) =>
    minor === null
      ? 'Unknown'
      : new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(minor / 100);
  return (
    <>
      <h1>Consumer &amp; Procurement</h1>
      <p className="notice">
        Research is on-demand and bounded. Recommendations must retain compliance exclusions,
        citations, total ownership cost, warranty, returns, and uncertainty.
      </p>
      {runs.error ? (
        <p role="alert" className="notice">
          {runs.error}
        </p>
      ) : null}
      <h2>Research requests</h2>
      {runs.data.length ? (
        <section className="stack">
          {runs.data.map((run) => {
            const savedRequest = procurementLaunchRequestSchema.safeParse(run.request);
            const item =
              run.decision_record?.item ??
              (savedRequest.success ? savedRequest.data.item : 'Procurement research');
            const savedRequirements =
              run.decision_record ?? (savedRequest.success ? savedRequest.data : null);
            const selectedCandidateTitle = run.decision_record?.candidates.find(
              (candidate) => candidate.id === run.decision_record?.selectedCandidateId,
            )?.title;
            const priorRun = run.revises_research_run_id
              ? runs.data.find((candidate) => candidate.id === run.revises_research_run_id)
              : null;
            return (
              <article className="card" id={`procurement-run-${run.id}`} key={run.id}>
                <h3>
                  {item} — {run.status}
                </h3>
                <p>
                  Provider spend cap: {formatMoney(run.hard_cap_minor, 'USD')}; searches:{' '}
                  {run.searches_used}/{run.search_limit}.
                </p>
                {run.revises_research_run_id ? (
                  <p>
                    Revised from{' '}
                    <a href={`#procurement-run-${run.revises_research_run_id}`}>
                      {priorRun
                        ? `the saved request from ${new Date(priorRun.created_at).toLocaleString('en-GB', { timeZone: 'Europe/London' })}`
                        : 'a prior saved request'}
                    </a>
                    ; its decision and evidence remain available.
                  </p>
                ) : null}
                {savedRequirements ? (
                  <section className="stack" aria-label={`Saved procurement request for ${item}`}>
                    <p>{savedRequirements.purpose}</p>
                    <p>
                      Market: {savedRequirements.market}; product budget:{' '}
                      {formatMoney(savedRequirements.maxTotalCostMinor, savedRequirements.currency)}
                      ;
                      {savedRequirements.requiredBy
                        ? ` required by ${savedRequirements.requiredBy}.`
                        : ' no required date.'}
                    </p>
                    <h4>Requirements saved before ranking</h4>
                    <ul>
                      {savedRequirements.requirements.map((requirement) => (
                        <li key={requirement.id}>
                          {requirement.kind === 'hard'
                            ? 'Hard requirement'
                            : `Preference (weight ${requirement.weight})`}
                          : {requirement.label}
                        </li>
                      ))}
                    </ul>
                    {savedRequest.success && savedRequest.data.existingProducts.length ? (
                      <p>Already owned: {savedRequest.data.existingProducts.join(', ')}</p>
                    ) : null}
                  </section>
                ) : (
                  <p role="alert">Saved Procurement request details could not be read.</p>
                )}
                {run.decision_record ? (
                  <section
                    className="stack"
                    aria-label={`Comparison for ${run.decision_record.item}`}
                  >
                    <p>{run.decision_record.summary}</p>
                    <p>
                      All-in product budget:{' '}
                      {formatMoney(
                        run.decision_record.maxTotalCostMinor,
                        run.decision_record.currency,
                      )}
                      . Selected option:{' '}
                      {selectedCandidateTitle ?? 'No candidate passed all hard checks.'}
                    </p>
                    <h4>Candidate comparison</h4>
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Option</th>
                            <th>Eligibility and fit</th>
                            <th>All-in cost</th>
                            <th>Price evidence</th>
                          </tr>
                        </thead>
                        <tbody>
                          {run.decision_record.comparison.map((result) => {
                            const candidate = run.decision_record?.candidates.find(
                              (item) => item.id === result.candidateId,
                            );
                            if (!candidate || !run.decision_record) return null;
                            return (
                              <tr key={result.candidateId}>
                                <td>
                                  <a href={candidate.productUrl} target="_blank" rel="noreferrer">
                                    {candidate.title}
                                  </a>
                                  <p>{candidate.merchant}</p>
                                  {result.candidateId ===
                                  run.decision_record.selectedCandidateId ? (
                                    <strong>Recommended</strong>
                                  ) : null}
                                  {result.candidateId ===
                                    run.decision_record.bestValueCandidateId &&
                                  result.candidateId !== run.decision_record.selectedCandidateId ? (
                                    <p>Lowest all-in cost among eligible options</p>
                                  ) : null}
                                </td>
                                <td>
                                  <p>
                                    {result.status === 'eligible'
                                      ? `Rank ${result.rank}`
                                      : `Excluded: ${result.exclusionReasons.join(', ')}`}
                                  </p>
                                  <ul>
                                    {run.decision_record.requirements.map((requirement) => {
                                      const assessment = candidate.assessments.find(
                                        (item) => item.requirementId === requirement.id,
                                      );
                                      return (
                                        <li key={requirement.id}>
                                          {requirement.label}: {assessment?.result ?? 'unknown'}
                                        </li>
                                      );
                                    })}
                                  </ul>
                                  {candidate.reviews.length ? (
                                    <details>
                                      <summary>
                                        Review evidence ({result.independentReviewSources}{' '}
                                        independent sources)
                                      </summary>
                                      <ul>
                                        {candidate.reviews.map((review, index) => (
                                          <li key={`${review.sourceUrl}-${index}`}>
                                            <a
                                              href={review.sourceUrl}
                                              target="_blank"
                                              rel="noreferrer"
                                            >
                                              {review.sourceKind} source
                                            </a>
                                            : {review.summary}
                                            {review.rating === null ? '' : ` ${review.rating}/5`}
                                            {review.reviewCount === null
                                              ? ''
                                              : ` from ${review.reviewCount} reviews`}
                                            .
                                          </li>
                                        ))}
                                      </ul>
                                    </details>
                                  ) : (
                                    <p>Review evidence unavailable.</p>
                                  )}
                                </td>
                                <td>
                                  <strong>
                                    {formatMoney(
                                      result.totalCostMinor,
                                      run.decision_record.currency,
                                    )}
                                  </strong>
                                  <ul>
                                    <li>
                                      Item:{' '}
                                      {formatMoney(
                                        candidate.offer.itemPriceMinor,
                                        run.decision_record.currency,
                                      )}
                                    </li>
                                    <li>
                                      Delivery:{' '}
                                      {formatMoney(
                                        candidate.offer.deliveryMinor,
                                        run.decision_record.currency,
                                      )}
                                    </li>
                                    <li>
                                      Required accessories:{' '}
                                      {formatMoney(
                                        candidate.offer.requiredAccessoriesMinor,
                                        run.decision_record.currency,
                                      )}
                                    </li>
                                    <li>
                                      Mandatory fees:{' '}
                                      {formatMoney(
                                        candidate.offer.mandatoryFeesMinor,
                                        run.decision_record.currency,
                                      )}
                                    </li>
                                  </ul>
                                  {candidate.warrantySummary ? (
                                    <p>Warranty: {candidate.warrantySummary}</p>
                                  ) : (
                                    <p>Warranty terms unknown.</p>
                                  )}
                                  {candidate.returnsSummary ? (
                                    <p>Returns: {candidate.returnsSummary}</p>
                                  ) : (
                                    <p>Returns terms unknown.</p>
                                  )}
                                </td>
                                <td>
                                  <p>{result.priceConfidence.replaceAll('_', ' ')}</p>
                                  <p>
                                    {candidate.offer.observedAt
                                      ? `Retrieved ${new Date(candidate.offer.observedAt).toLocaleString('en-GB', { timeZone: 'Europe/London' })}`
                                      : candidate.offer.priceType}
                                  </p>
                                  <ul>
                                    {[
                                      ...new Set([
                                        candidate.productUrl,
                                        ...candidate.offer.sourceUrls,
                                        ...candidate.assessments.flatMap(
                                          (item) => item.evidenceUrls,
                                        ),
                                        ...candidate.reviews.map((item) => item.sourceUrl),
                                        ...candidate.warrantyAndReturnsSourceUrls,
                                      ]),
                                    ].map((url) => (
                                      <li key={url}>
                                        <a href={url} target="_blank" rel="noreferrer">
                                          Source
                                        </a>
                                      </li>
                                    ))}
                                  </ul>
                                  <p>
                                    {result.exclusionReasons.length
                                      ? result.exclusionReasons.join('; ')
                                      : candidate.rationale}
                                  </p>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <p>{run.decision_record.rationale}</p>
                    <p>Prices and availability can change. No order or payment was made.</p>
                  </section>
                ) : null}
                {run.status === 'complete' && savedRequest.success ? (
                  <details>
                    <summary>Revise this request</summary>
                    <OnDemandLaunchForm
                      manager="procurement"
                      initialProcurementRequest={savedRequest.data}
                      initialHardCapMinor={run.hard_cap_minor}
                      initialSearchCeiling={run.search_limit}
                      initialModelCeiling={run.model_ceiling}
                      revisionOfResearchRunId={run.id}
                    />
                  </details>
                ) : null}
              </article>
            );
          })}
        </section>
      ) : (
        <p className="card">
          No research request has been launched. Start with an item or service, purpose, hard
          requirements, budget, required date, and market.
        </p>
      )}
      <OnDemandLaunchForm manager="procurement" />
      <p className="card">
        The saved comparison includes citations, price and review uncertainty, warranty and return
        terms. It does not submit an order or payment.
      </p>
    </>
  );
}
