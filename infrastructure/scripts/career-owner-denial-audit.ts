import { z } from 'zod';

export const CareerOwnerDenialAuditColumns = [
  'correlation_id',
  'action_type',
  'target_type',
  'target_id',
  'result',
  'redacted_after',
  'created_at',
] as const;

export const CareerOwnerDenialAuditRowSchema = z
  .object({
    correlation_id: z.string().uuid(),
    action_type: z.literal('github_career_sync_owner_denied'),
    target_type: z.literal('github_owner'),
    target_id: z.enum(['hard_denied', 'not_allowlisted']),
    result: z.literal('denied'),
    redacted_after: z.object({ provider_request_made: z.literal(false) }).passthrough(),
    created_at: z.string().datetime({ offset: true }),
  })
  .strict();
