import type { ProcurementCandidate, ProcurementDecisionInput } from '@ai-operations/contracts';

export type ProcurementCandidateResult = {
  candidateId: string;
  status: 'eligible' | 'excluded';
  rank: number | null;
  totalCostMinor: number | null;
  priceConfidence: 'current_verified' | 'indicative' | 'historical' | 'unknown';
  preferenceScore: number;
  independentReviewSources: number;
  exclusionReasons: readonly string[];
};

export type ProcurementDecision = Readonly<{
  currency: string;
  selectedCandidateId: string | null;
  rationale: string;
  candidates: readonly ProcurementCandidateResult[];
}>;

function totalCost(candidate: ProcurementCandidate): number | null {
  const amounts = [
    candidate.offer.itemPriceMinor,
    candidate.offer.deliveryMinor,
    candidate.offer.requiredAccessoriesMinor,
    candidate.offer.mandatoryFeesMinor,
  ];
  if (amounts.some((amount) => amount === null)) return null;
  const total = (amounts as number[]).reduce((sum, amount) => sum + amount, 0);
  return Number.isSafeInteger(total) ? total : null;
}

function priceConfidence(
  candidate: ProcurementCandidate,
  nowMs: number,
): ProcurementCandidateResult['priceConfidence'] {
  if (candidate.offer.priceType === 'historical') return 'historical';
  if (candidate.offer.priceType !== 'current_offer') return 'indicative';
  const retrieved = candidate.offer.observedAt ? Date.parse(candidate.offer.observedAt) : NaN;
  return Number.isFinite(retrieved) &&
    retrieved <= nowMs &&
    nowMs - retrieved <= 86_400_000 &&
    candidate.offer.sourceUrls.length > 0
    ? 'current_verified'
    : 'indicative';
}

export function compareProcurementCandidates(
  input: ProcurementDecisionInput,
  now: string,
): ProcurementDecision {
  const nowMs = Date.parse(now);
  if (!Number.isFinite(nowMs)) throw new Error('procurement_comparison_time_invalid');

  const candidates: ProcurementCandidateResult[] = input.candidates.map((candidate) => {
    const assessments = new Map(
      candidate.assessments.map((item) => [item.requirementId, item.result]),
    );
    const hardRequirements = input.requirements.filter(
      (requirement) => requirement.kind === 'hard',
    );
    const exclusionReasons = hardRequirements.flatMap((requirement) => {
      const result = assessments.get(requirement.id) ?? 'unknown';
      return result === 'compatible' ? [] : [`hard_requirement_${result}:${requirement.id}`];
    });
    const candidateTotalCost = totalCost(candidate);
    if (candidateTotalCost === null) exclusionReasons.push('all_in_cost_unknown');
    else if (candidateTotalCost > input.maxTotalCostMinor)
      exclusionReasons.push('hard_budget_exceeded');
    const preferenceScore = input.requirements.reduce((score, requirement) => {
      if (requirement.kind !== 'preference') return score;
      return assessments.get(requirement.id) === 'compatible' ? score + requirement.weight : score;
    }, 0);
    return {
      candidateId: candidate.id,
      status: exclusionReasons.length ? ('excluded' as const) : ('eligible' as const),
      rank: null,
      totalCostMinor: candidateTotalCost,
      priceConfidence: priceConfidence(candidate, nowMs),
      preferenceScore,
      independentReviewSources: new Set(
        candidate.reviews
          .filter((review) => review.sourceKind === 'independent')
          .map((review) => new URL(review.sourceUrl).hostname.toLowerCase()),
      ).size,
      exclusionReasons,
    };
  });

  const eligible = candidates
    .filter((candidate) => candidate.status === 'eligible')
    .sort(
      (left, right) =>
        right.preferenceScore - left.preferenceScore ||
        Number(right.priceConfidence === 'current_verified') -
          Number(left.priceConfidence === 'current_verified') ||
        (left.totalCostMinor ?? Number.MAX_SAFE_INTEGER) -
          (right.totalCostMinor ?? Number.MAX_SAFE_INTEGER) ||
        left.candidateId.localeCompare(right.candidateId),
    );
  eligible.forEach((candidate, index) => {
    candidate.rank = index + 1;
  });

  const selected = eligible[0];
  return {
    currency: input.currency,
    selectedCandidateId: selected?.candidateId ?? null,
    rationale: input.rationale,
    candidates,
  };
}
