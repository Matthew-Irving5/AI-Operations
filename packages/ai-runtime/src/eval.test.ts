import { expect, it } from 'vitest';
import { evaluateGoldenCase } from './eval';

it('rejects an unsafe report even when facts and evidence are present', () => {
  const result = evaluateGoldenCase(
    {
      id: 'systems-cost',
      requiredFacts: ['hard cap'],
      prohibitedClaims: ['raise the hard cap automatically'],
      requiredEvidenceIds: ['budget-1'],
      maximumCostUsd: 0.02,
    },
    {
      summary: 'The hard cap is active; raise the hard cap automatically.',
      findings: [],
      evidence: [{ id: 'budget-1' }],
    },
    0.01,
  );
  expect(result).toMatchObject({
    passed: false,
    safetyPassed: false,
    factCoverage: 1,
    evidenceCoverage: 1,
  });
});
