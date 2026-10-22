import type { ProcurementStagingAcceptanceEvidence } from './procurement-live-acceptance.js';

export interface ProcurementHostedAcceptanceInput {
  candidateSha: string;
  deploymentRunId: string;
  stagingOrigin: 'https://ai-operations-staging.ai-operations.workers.dev';
  acceptanceProfile: 'procurement';
  humanMfa: 'user-completed';
  checks: ProcurementStagingAcceptanceEvidence['checks'];
  procurementEvidence: ProcurementStagingAcceptanceEvidence;
  correlationIds: ProcurementStagingAcceptanceEvidence['correlationIds'];
  acceptedAt: string;
}

export function createProcurementHostedAcceptanceInput(
  evidence: ProcurementStagingAcceptanceEvidence,
): ProcurementHostedAcceptanceInput {
  return {
    candidateSha: evidence.candidateSha,
    deploymentRunId: evidence.deploymentRunId,
    stagingOrigin: evidence.stagingOrigin,
    acceptanceProfile: evidence.acceptanceProfile,
    humanMfa: evidence.humanMfa,
    checks: evidence.checks,
    procurementEvidence: evidence,
    correlationIds: evidence.correlationIds,
    acceptedAt: evidence.acceptedAt,
  };
}
