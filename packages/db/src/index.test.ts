import { describe, expect, it } from 'vitest';
import { redact } from './index';
import type { Database } from './database.types';
describe('redaction', () => {
  it('redacts sensitive values before trace persistence', () => {
    expect(redact({ token: 'secret', safe: 'value' })).toEqual({
      token: '[REDACTED]',
      safe: 'value',
    });
  });
});

describe('prompt governance database types', () => {
  it('exposes version identity on prompts and AI calls plus transition RPCs', () => {
    const callIdentity: Pick<
      Database['public']['Tables']['ai_calls']['Row'],
      'model_route' | 'schema_version' | 'tool_policy_version'
    > = {
      model_route: 'gpt-5.6-terra',
      schema_version: 1,
      tool_policy_version: 1,
    };
    const version: Pick<
      Database['public']['Tables']['prompt_versions']['Row'],
      'evaluation_result' | 'model_route' | 'schema_version' | 'tool_policy' | 'tool_policy_version'
    > = {
      evaluation_result: { passed: true },
      model_route: 'gpt-5.6-terra',
      schema_version: 1,
      tool_policy: { version: 1, tools: [] },
      tool_policy_version: 1,
    };
    const transition: Pick<
      Database['public']['Tables']['prompt_version_transitions']['Row'],
      'operation' | 'previous_version' | 'active_version'
    > = {
      operation: 'promote',
      previous_version: 1,
      active_version: 2,
    };
    const evaluateArgs: Database['public']['Functions']['record_prompt_evaluation']['Args'] = {
      p_evaluation_result: { passed: true },
      p_prompt_version_id: '00000000-0000-0000-0000-000000000001',
    };
    const transitionArgs: Database['public']['Functions']['transition_prompt_version']['Args'] = {
      p_actor_user_id: '00000000-0000-0000-0000-000000000001',
      p_expected_active_version: 1,
      p_idempotency_key: 'test:prompt:transition',
      p_operation: 'promote',
      p_target_version: 2,
      p_template_id: '00000000-0000-0000-0000-000000000002',
    };

    expect([
      callIdentity.schema_version,
      version.schema_version,
      transition.active_version,
    ]).toEqual([1, 1, 2]);
    expect(evaluateArgs.p_prompt_version_id).toBeTruthy();
    expect(transitionArgs.p_target_version).toBe(2);
  });
});
