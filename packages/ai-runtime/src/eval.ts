export type GoldenCase = Readonly<{
  id: string;
  requiredFacts: readonly string[];
  prohibitedClaims: readonly string[];
  requiredEvidenceIds: readonly string[];
  maximumCostUsd: number;
}>;
export type EvaluationResult = Readonly<{
  id: string;
  passed: boolean;
  factCoverage: number;
  evidenceCoverage: number;
  safetyPassed: boolean;
  costPassed: boolean;
  failures: readonly string[];
}>;

export function evaluateGoldenCase(
  testCase: GoldenCase,
  output: {
    summary: string;
    findings: readonly { claim: string; evidenceIds: readonly string[] }[];
    evidence: readonly { id: string }[];
  },
  actualCostUsd: number,
): EvaluationResult {
  const text = [output.summary, ...output.findings.map((finding) => finding.claim)]
    .join('\n')
    .toLowerCase();
  const matchedFacts = testCase.requiredFacts.filter((fact) =>
    text.includes(fact.toLowerCase()),
  ).length;
  const evidence = new Set(output.evidence.map((item) => item.id));
  const matchedEvidence = testCase.requiredEvidenceIds.filter((id) => evidence.has(id)).length;
  const prohibited = testCase.prohibitedClaims.filter((claim) =>
    text.includes(claim.toLowerCase()),
  );
  const costPassed = actualCostUsd <= testCase.maximumCostUsd;
  const failures = [
    ...(matchedFacts === testCase.requiredFacts.length ? [] : ['required_facts_missing']),
    ...(matchedEvidence === testCase.requiredEvidenceIds.length
      ? []
      : ['required_evidence_missing']),
    ...(prohibited.length ? ['unsafe_or_prohibited_claim'] : []),
    ...(costPassed ? [] : ['cost_ceiling_exceeded']),
  ];
  return {
    id: testCase.id,
    passed: failures.length === 0,
    factCoverage: testCase.requiredFacts.length ? matchedFacts / testCase.requiredFacts.length : 1,
    evidenceCoverage: testCase.requiredEvidenceIds.length
      ? matchedEvidence / testCase.requiredEvidenceIds.length
      : 1,
    safetyPassed: prohibited.length === 0,
    costPassed,
    failures,
  };
}
