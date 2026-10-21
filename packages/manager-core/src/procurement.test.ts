import { expect, it } from 'vitest';
import { procurementDecisionInputSchema } from '@ai-operations/contracts';
import { compareProcurementCandidates } from './procurement';

const request = procurementDecisionInputSchema.parse({
  currency: 'GBP',
  maxTotalCostMinor: 10000,
  requirements: [
    { id: 'fits-desk', label: 'Fits the 30 cm shelf', kind: 'hard' },
    { id: 'quiet', label: 'Quiet operation', kind: 'preference', weight: 100 },
  ],
  rationale: 'Quiet operation matters most after shelf fit is confirmed.',
  candidates: [
    {
      id: 'quiet-costly',
      title: 'Quiet model',
      productUrl: 'https://shop.example/quiet',
      merchant: 'Shop',
      offer: {
        currency: 'GBP',
        itemPriceMinor: 9000,
        deliveryMinor: 500,
        requiredAccessoriesMinor: 250,
        mandatoryFeesMinor: 0,
        priceType: 'current_offer',
        observedAt: '2026-10-21T10:00:00Z',
        sourceUrls: ['https://shop.example/quiet'],
      },
      assessments: [
        {
          requirementId: 'fits-desk',
          result: 'compatible',
          evidenceUrls: ['https://shop.example/quiet'],
        },
        {
          requirementId: 'quiet',
          result: 'compatible',
          evidenceUrls: ['https://reviews.example/quiet'],
        },
      ],
      reviews: [
        {
          sourceUrl: 'https://reviews.example/quiet',
          sourceKind: 'independent',
          retrievedAt: '2026-10-21T10:00:00Z',
          rating: 4.1,
          reviewCount: 240,
          summary: 'Independent reviews note low operating noise.',
        },
      ],
      warrantySummary: 'Two year warranty.',
      returnsSummary: '30 day returns.',
      warrantyAndReturnsSourceUrls: ['https://shop.example/quiet'],
      rationale: 'Meets both requirements and has an independently reviewed noise claim.',
    },
    {
      id: 'cheap-basic',
      title: 'Basic model',
      productUrl: 'https://shop.example/basic',
      merchant: 'Shop',
      offer: {
        currency: 'GBP',
        itemPriceMinor: 5000,
        deliveryMinor: 500,
        requiredAccessoriesMinor: 250,
        mandatoryFeesMinor: 0,
        priceType: 'current_offer',
        observedAt: '2026-10-21T10:00:00Z',
        sourceUrls: ['https://shop.example/basic'],
      },
      assessments: [
        {
          requirementId: 'fits-desk',
          result: 'compatible',
          evidenceUrls: ['https://shop.example/basic'],
        },
      ],
      reviews: [],
      warrantySummary: null,
      returnsSummary: null,
      warrantyAndReturnsSourceUrls: [],
      rationale: 'Meets the hard requirement; quiet operation has not been established.',
    },
    {
      id: 'popular-too-wide',
      title: 'Popular oversized model',
      productUrl: 'https://shop.example/oversized',
      merchant: 'Shop',
      offer: {
        currency: 'GBP',
        itemPriceMinor: 1000,
        deliveryMinor: 0,
        requiredAccessoriesMinor: 0,
        mandatoryFeesMinor: 0,
        priceType: 'current_offer',
        observedAt: '2026-10-21T10:00:00Z',
        sourceUrls: ['https://shop.example/oversized'],
      },
      assessments: [
        {
          requirementId: 'fits-desk',
          result: 'incompatible',
          evidenceUrls: ['https://shop.example/oversized'],
        },
      ],
      reviews: [],
      warrantySummary: null,
      returnsSummary: null,
      warrantyAndReturnsSourceUrls: [],
      rationale: 'Popularity does not override the shelf-width failure.',
    },
    {
      id: 'unknown-width',
      title: 'Unknown fit model',
      productUrl: 'https://shop.example/unknown',
      merchant: 'Shop',
      offer: {
        currency: 'GBP',
        itemPriceMinor: 4000,
        deliveryMinor: 0,
        requiredAccessoriesMinor: 0,
        mandatoryFeesMinor: 0,
        priceType: 'current_offer',
        observedAt: '2026-10-21T10:00:00Z',
        sourceUrls: ['https://shop.example/unknown'],
      },
      assessments: [],
      reviews: [],
      warrantySummary: null,
      returnsSummary: null,
      warrantyAndReturnsSourceUrls: [],
      rationale: 'The available evidence does not establish width compatibility.',
    },
  ],
});

it('filters failed and unknown hard requirements before weighted preference ranking', () => {
  const result = compareProcurementCandidates(request, '2026-10-21T12:00:00Z');

  expect(result.selectedCandidateId).toBe('quiet-costly');
  expect(
    result.candidates.map(({ candidateId, rank, exclusionReasons }) => ({
      candidateId,
      rank,
      exclusionReasons,
    })),
  ).toEqual([
    { candidateId: 'quiet-costly', rank: 1, exclusionReasons: [] },
    { candidateId: 'cheap-basic', rank: 2, exclusionReasons: [] },
    {
      candidateId: 'popular-too-wide',
      rank: null,
      exclusionReasons: ['hard_requirement_incompatible:fits-desk'],
    },
    {
      candidateId: 'unknown-width',
      rank: null,
      exclusionReasons: ['hard_requirement_unknown:fits-desk'],
    },
  ]);
  expect(result.candidates[0]).toMatchObject({
    totalCostMinor: 9750,
    priceConfidence: 'current_verified',
    independentReviewSources: 1,
  });
  expect(result.candidates[1]).toMatchObject({ totalCostMinor: 5750, preferenceScore: 0 });
});

it('treats incomplete and stale prices as non-current and leaves unknown totals explicit', () => {
  const basic = request.candidates[1];
  if (!basic) throw new Error('test_candidate_missing');
  const stale = procurementDecisionInputSchema.parse({
    ...request,
    candidates: [
      {
        ...basic,
        id: 'stale',
        offer: {
          ...basic.offer,
          itemPriceMinor: 5000,
          requiredAccessoriesMinor: null,
          observedAt: '2026-10-19T10:00:00Z',
        },
      },
    ],
  });
  const result = compareProcurementCandidates(stale, '2026-10-21T12:00:00Z');
  expect(result.candidates[0]).toMatchObject({
    totalCostMinor: null,
    priceConfidence: 'indicative',
    status: 'excluded',
    exclusionReasons: ['all_in_cost_unknown'],
  });
});

it('excludes a complete offer that exceeds the request budget before ranking', () => {
  const overBudget = procurementDecisionInputSchema.parse({
    ...request,
    maxTotalCostMinor: 9000,
    candidates: [request.candidates[0]],
  });
  expect(compareProcurementCandidates(overBudget, '2026-10-21T12:00:00Z')).toMatchObject({
    selectedCandidateId: null,
    candidates: [{ status: 'excluded', exclusionReasons: ['hard_budget_exceeded'] }],
  });
});
