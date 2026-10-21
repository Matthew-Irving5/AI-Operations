import {
  procurementDecisionInputSchema,
  procurementLaunchRequestSchema,
  procurementResearchOutputSchema,
  type ProcurementCandidate,
} from "@ai-operations/contracts";
import { compareProcurementCandidates } from "@ai-operations/manager-core";
import type { WebSearchCitation } from "../_shared/openai-contract.ts";

export type ProcurementDecisionCommit = Readonly<{
  summary: string;
  markdown: string;
  decision: Record<string, unknown>;
  sources: Array<Record<string, string>>;
  evidenceReferences: Array<Record<string, string>>;
}>;

const candidateSourceUrls = (candidate: ProcurementCandidate): string[] => [
  candidate.productUrl,
  ...candidate.offer.sourceUrls,
  ...candidate.assessments.flatMap((assessment) => assessment.evidenceUrls),
  ...candidate.reviews.map((review) => review.sourceUrl),
  ...candidate.warrantyAndReturnsSourceUrls,
];
const canonicalUrl = (value: string): string => new URL(value).toString();

export function prepareProcurementDecision(
  requestValue: unknown,
  outputValue: unknown,
  citations: readonly WebSearchCitation[],
  now: string,
): ProcurementDecisionCommit | null {
  const request = procurementLaunchRequestSchema.safeParse(requestValue);
  const output = procurementResearchOutputSchema.safeParse(outputValue);
  const nowMs = Date.parse(now);
  if (!request.success || !output.success || !Number.isFinite(nowMs) || citations.length > 100) {
    return null;
  }

  const citationByUrl = new Map(citations.map((citation) => [citation.url, citation]));
  const candidates: ProcurementCandidate[] = output.data.candidates.map((candidate) => ({
    ...candidate,
    offer: {
      ...candidate.offer,
      observedAt: candidate.offer.priceType === "current_offer" ? now : null,
    },
    reviews: candidate.reviews.map((review) => ({ ...review, retrievedAt: now })),
  }));
  for (const candidate of candidates) {
    if (candidateSourceUrls(candidate).some((url) => !citationByUrl.has(canonicalUrl(url)))) return null;
    if (candidate.offer.priceType === "current_offer" && candidate.offer.sourceUrls.length === 0) {
      return null;
    }
  }

  const parsedDecision = procurementDecisionInputSchema.safeParse({
    currency: request.data.currency,
    maxTotalCostMinor: request.data.maxTotalCostMinor,
    requirements: request.data.requirements,
    candidates,
    rationale: output.data.rationale,
  });
  if (!parsedDecision.success) return null;
  const comparison = compareProcurementCandidates(parsedDecision.data, now);
  const eligible = comparison.candidates.filter((candidate) => candidate.status === "eligible");
  const bestValueId = [...eligible].sort((left, right) =>
    (left.totalCostMinor ?? Number.MAX_SAFE_INTEGER) - (right.totalCostMinor ?? Number.MAX_SAFE_INTEGER) ||
    Number(right.priceConfidence === "current_verified") - Number(left.priceConfidence === "current_verified") ||
    left.candidateId.localeCompare(right.candidateId)
  )[0]?.candidateId ?? null;
  const premiumId = eligible.length > 1
    ? [...eligible].sort((left, right) =>
      (right.totalCostMinor ?? 0) - (left.totalCostMinor ?? 0) || left.candidateId.localeCompare(right.candidateId)
    )[0]?.candidateId ?? null
    : null;
  const candidateById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const recommendations = comparison.candidates.map((result) => {
    const candidate = candidateById.get(result.candidateId);
    if (!candidate) throw new Error("procurement_candidate_missing_after_validation");
    const badges = [
      ...(result.candidateId === comparison.selectedCandidateId ? ["best_overall"] : []),
      ...(result.candidateId === bestValueId ? ["best_value"] : []),
      ...(result.candidateId === premiumId && result.candidateId !== bestValueId ? ["premium"] : []),
    ];
    const recommendationKind = result.status === "excluded"
      ? "excluded"
      : result.candidateId === comparison.selectedCandidateId
      ? "best_overall"
      : result.candidateId === bestValueId
      ? "best_value"
      : result.candidateId === premiumId
      ? "premium"
      : "comparison";
    const assessmentUnknown = candidate.assessments
      .filter((assessment) => assessment.result === "unknown")
      .map((assessment) => assessment.requirementId);
    const uncertainty = [
      ...result.exclusionReasons,
      ...(result.priceConfidence !== "current_verified" ? [`price_${result.priceConfidence}`] : []),
      ...(result.independentReviewSources < 2 ? ["limited_independent_review_sources"] : []),
      ...(assessmentUnknown.length ? [`unknown_assessments:${assessmentUnknown.join(",")}`] : []),
    ].join("; ") || "Verify merchant availability and terms before purchase.";
    const candidateCitations = [...new Set(candidateSourceUrls(candidate))]
      .flatMap((url) => citationByUrl.has(canonicalUrl(url)) ? [citationByUrl.get(canonicalUrl(url))!] : []);
    return {
      recommendation_kind: recommendationKind,
      candidate_id: candidate.id,
      decision_rank: result.rank,
      title: candidate.title,
      total_cost_minor: result.totalCostMinor,
      currency: candidate.offer.currency,
      compliance_passed: result.status === "eligible",
      warranty_summary: candidate.warrantySummary,
      returns_summary: candidate.returnsSummary,
      uncertainty,
      citations: candidateCitations,
      details: { candidate, comparison: result, badges },
    };
  });
  const sources = [...citationByUrl.values()].map((citation) => ({
    title: citation.title,
    source_url: citation.url,
    source_quality: "unreviewed",
    citation_text: `${citation.title} — ${citation.url}`,
  }));
  const evidenceReferences = sources.map(({ title, source_url }) => ({ title, url: source_url }));
  const decision = {
    version: 1,
    item: request.data.item,
    purpose: request.data.purpose,
    market: request.data.market,
    requiredBy: request.data.requiredBy,
    currency: request.data.currency,
    maxTotalCostMinor: request.data.maxTotalCostMinor,
    requirements: request.data.requirements,
    summary: output.data.summary,
    rationale: comparison.rationale,
    selectedCandidateId: comparison.selectedCandidateId,
    candidates,
    comparison: comparison.candidates,
    bestValueCandidateId: bestValueId,
    recommendations,
  };
  const ranked = [...comparison.candidates].sort((left, right) =>
    (left.rank ?? Number.MAX_SAFE_INTEGER) - (right.rank ?? Number.MAX_SAFE_INTEGER)
  );
  const markdownLines = [
    `## Requirement-first procurement comparison: ${request.data.item}`,
    "",
    output.data.summary,
    "",
    `**Maximum all-in cost:** ${request.data.currency} ${(request.data.maxTotalCostMinor / 100).toFixed(2)}`,
    `**Selected option:** ${comparison.selectedCandidateId ?? "No candidate satisfies the hard requirements and complete-cost checks."}`,
    "",
    "### Requirements",
    ...request.data.requirements.map((requirement) => `- ${requirement.kind === "hard" ? "Hard" : "Preference"}: ${requirement.label}`),
    "",
    "### Comparison",
    ...ranked.map((result) => {
      const candidate = candidateById.get(result.candidateId);
      const total = result.totalCostMinor === null
        ? "all-in cost unknown"
        : `${request.data.currency} ${(result.totalCostMinor / 100).toFixed(2)}`;
      const status = result.status === "excluded"
        ? `Excluded: ${result.exclusionReasons.join(", ")}`
        : `Rank ${result.rank}; ${result.priceConfidence}; ${result.independentReviewSources} independent review sources`;
      return `- ${candidate?.title ?? result.candidateId} (${candidate?.merchant ?? "merchant unknown"}) — ${total}. ${status}.`;
    }),
    "",
    "### Decision rationale",
    comparison.rationale,
    "",
    "Prices and availability can change. This report does not place an order or submit payment.",
  ];
  return {
    summary: output.data.summary,
    markdown: markdownLines.join("\n"),
    decision,
    sources,
    evidenceReferences,
  };
}
