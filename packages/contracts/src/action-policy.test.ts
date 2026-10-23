import { describe, expect, it } from 'vitest';
import {
  canTransitionCanonicalAction,
  canonicalActionAdapterOutcomeSchema,
  evaluateCanonicalActionPolicy,
  type CanonicalActionPolicyInput,
} from './action-policy';

const baseInput = (
  overrides: Partial<CanonicalActionPolicyInput> = {},
): CanonicalActionPolicyInput => ({
  actionType: 'google_calendar_event_create',
  managerCode: 'personal',
  authority: 'agent_proposal',
  channel: 'web_chat',
  riskClass: 'low',
  capabilities: ['calendar_write'],
  permissions: ['write', 'execute'],
  approvalState: 'pending',
  freshWebAal2: false,
  standingPolicyPreauthorized: false,
  ...overrides,
});

describe('canonical action policy', () => {
  it('requires approval for agent proposals and cannot lower manifest risk', () => {
    const decision = evaluateCanonicalActionPolicy(baseInput());

    expect(decision).toMatchObject({
      decision: 'approval_required',
      reason: 'agent_proposal_requires_approval',
      effectiveRisk: 'medium',
      approvalRequired: true,
    });
  });

  it('allows an approved proposal and denies a rejected or expired proposal', () => {
    expect(evaluateCanonicalActionPolicy(baseInput({ approvalState: 'approved' })).decision).toBe(
      'allow',
    );
    expect(evaluateCanonicalActionPolicy(baseInput({ approvalState: 'rejected' })).reason).toBe(
      'approval_rejected',
    );
    expect(evaluateCanonicalActionPolicy(baseInput({ approvalState: 'expired' })).reason).toBe(
      'approval_expired',
    );
  });

  it('honours verified Gmail command authority without adding a generic MFA gate', () => {
    const decision = evaluateCanonicalActionPolicy(
      baseInput({
        actionType: 'google_calendar_event_delete',
        authority: 'verified_user',
        channel: 'gmail',
        approvalState: 'not_required',
      }),
    );

    expect(decision).toMatchObject({
      decision: 'allow',
      reason: 'verified_user_authority',
      effectiveRisk: 'high',
      approvalRequired: false,
      freshWebAal2Required: false,
    });
  });

  it('requires fresh web AAL2 for worker manifest mutations', () => {
    const input = baseInput({
      actionType: 'local_worker_manifest_mutation',
      managerCode: 'digital_estate',
      authority: 'verified_user',
      approvalState: 'not_required',
      capabilities: ['windows_worker_mutation'],
      permissions: ['execute'],
      freshWebAal2: false,
    });

    expect(evaluateCanonicalActionPolicy(input)).toMatchObject({
      decision: 'reauth_required',
      reason: 'web_action_requires_fresh_aal2',
      freshWebAal2Required: true,
    });
    expect(evaluateCanonicalActionPolicy({ ...input, freshWebAal2: true }).decision).toBe('allow');
  });

  it('requires fresh web AAL2 after approval before prompt promotion executes', () => {
    const input = baseInput({
      actionType: 'review_prompt_promotion',
      managerCode: 'systems',
      authority: 'agent_proposal',
      approvalState: 'approved',
      capabilities: ['prompt_model_config'],
      permissions: ['write', 'execute'],
      freshWebAal2: false,
    });

    expect(evaluateCanonicalActionPolicy(input)).toMatchObject({
      decision: 'reauth_required',
      reason: 'web_action_requires_fresh_aal2',
      freshWebAal2Required: true,
    });
    expect(evaluateCanonicalActionPolicy({ ...input, freshWebAal2: true })).toMatchObject({
      decision: 'allow',
      reason: 'approved_agent_proposal',
    });
  });

  it('allows only explicitly preauthorized low-risk standing-policy actions', () => {
    const input = baseInput({
      actionType: 'google_task_create',
      authority: 'standing_policy',
      channel: 'internal',
      approvalState: 'not_required',
      capabilities: ['reminder_write'],
      standingPolicyPreauthorized: true,
    });

    expect(evaluateCanonicalActionPolicy(input)).toMatchObject({
      decision: 'allow',
      reason: 'preauthorized_low_risk_action',
      effectiveRisk: 'low',
    });
    expect(
      evaluateCanonicalActionPolicy({
        ...input,
        actionType: 'google_task_update',
      }).reason,
    ).toBe('standing_policy_not_authorized');
    expect(evaluateCanonicalActionPolicy({ ...input, riskClass: 'high' }).decision).toBe('deny');
  });

  it('denies manager/capability/permission mismatches and unknown action types', () => {
    expect(evaluateCanonicalActionPolicy(baseInput({ managerCode: 'finance' })).reason).toBe(
      'manager_not_authorized',
    );
    expect(evaluateCanonicalActionPolicy(baseInput({ capabilities: [] })).reason).toBe(
      'capability_not_granted',
    );
    expect(evaluateCanonicalActionPolicy(baseInput({ permissions: ['read'] })).reason).toBe(
      'permission_not_granted',
    );
    expect(
      evaluateCanonicalActionPolicy(baseInput({ actionType: 'free_form_model_action' })).reason,
    ).toBe('unsupported_action_type');
  });

  it('hard-denies prohibited action types for every authority', () => {
    for (const actionType of [
      'financial_transaction_execute',
      'investment_execution',
      'travel_booking_execute',
      'product_purchase_execute',
      'unsupported_professional_outreach',
    ]) {
      for (const authority of ['verified_user', 'agent_proposal', 'standing_policy'] as const) {
        expect(
          evaluateCanonicalActionPolicy(
            baseInput({ actionType, authority, approvalState: 'approved' }),
          ).reason,
        ).toBe('prohibited_action');
      }
    }
  });

  it('bounds partial failures and requires an actionable failed outcome', () => {
    expect(
      canonicalActionAdapterOutcomeSchema.safeParse({
        kind: 'partially_succeeded',
        summary: 'One task was created; the second failed.',
        resultReference: null,
        changedReferences: ['task-1'],
        errorCode: 'provider_timeout',
        redactedError: null,
        reversalToken: null,
      }).success,
    ).toBe(true);
    expect(
      canonicalActionAdapterOutcomeSchema.safeParse({
        kind: 'failed',
        summary: 'The provider rejected the request.',
        resultReference: null,
        changedReferences: [],
        errorCode: '',
        redactedError: null,
        reversalToken: null,
      }).success,
    ).toBe(false);
  });

  it('keeps terminal and reversal lifecycle transitions bounded', () => {
    expect(canTransitionCanonicalAction('proposed', 'awaiting_approval')).toBe(true);
    expect(canTransitionCanonicalAction('approved', 'executing')).toBe(false);
    expect(canTransitionCanonicalAction('queued', 'executing')).toBe(true);
    expect(canTransitionCanonicalAction('executing', 'partially_succeeded')).toBe(true);
    expect(canTransitionCanonicalAction('succeeded', 'reversible')).toBe(true);
    expect(canTransitionCanonicalAction('reversible', 'reversed')).toBe(true);
    expect(canTransitionCanonicalAction('reversed', 'executing')).toBe(false);
  });
});
