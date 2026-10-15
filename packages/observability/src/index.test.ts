import { describe, expect, it } from 'vitest';
import { evaluateFreshnessState, redactTraceFields } from './index';

describe('redactTraceFields', () => {
  it('redacts sensitive fields recursively in objects and arrays', () => {
    expect(
      redactTraceFields({
        runId: 'run-1',
        nested: [{ apiKey: 'do-not-log', result: 'ok' }],
        bankStatement: { account: 'account-data' },
        promptText: 'private prompt',
      }),
    ).toEqual({
      runId: 'run-1',
      nested: [{ apiKey: '[REDACTED]', result: 'ok' }],
      bankStatement: '[REDACTED]',
      promptText: '[REDACTED]',
    });
  });

  it('redacts credentials embedded in otherwise safe strings', () => {
    expect(
      redactTraceFields({
        status:
          'Bearer abc.def key sk-proj-1234567890abcdef API_KEY=embedded_secret_value JWT eyJhbGciOiJub25lIn0.eyJzdWIiOiIxMjM0NTYifQ.signature123456',
      }),
    ).toEqual({
      status: '[REDACTED] key [REDACTED] [REDACTED] JWT [REDACTED]',
    });
  });

  it('preserves safe version metadata and does not mutate input', () => {
    const input = { promptVersionId: 'version-1', details: { status: 'ready' } };

    expect(redactTraceFields(input)).toEqual(input);
    expect(input).toEqual({ promptVersionId: 'version-1', details: { status: 'ready' } });
  });
});

describe('evaluateFreshnessState', () => {
  const now = '2026-10-15T12:00:00.000Z';
  const base = {
    now,
    lastSourceAt: '2026-10-15T11:59:30.000Z',
    lastSuccessAt: '2026-10-15T11:59:40.000Z',
    sourceState: 'fresh' as const,
    expectedCadenceSeconds: 60,
  };

  it('is fresh while both successful retrieval and source observations are within cadence', () => {
    expect(evaluateFreshnessState(base)).toBe('fresh');
  });

  it('becomes stale at the configured source or retrieval cadence boundary', () => {
    expect(
      evaluateFreshnessState({
        ...base,
        lastSourceAt: '2026-10-15T11:59:00.000Z',
      }),
    ).toBe('stale');
  });

  it('maps existing provider error and unavailable states to degraded', () => {
    expect(evaluateFreshnessState({ ...base, sourceState: 'error' })).toBe('degraded');
    expect(evaluateFreshnessState({ ...base, sourceState: 'reauthentication_required' })).toBe(
      'degraded',
    );
    expect(evaluateFreshnessState({ ...base, sourceState: 'not_connected' })).toBe('degraded');
  });

  it('reports missing successful evidence as unknown', () => {
    expect(evaluateFreshnessState({ ...base, lastSuccessAt: null })).toBe('unknown');
  });

  it('fails closed when source or retrieval timestamps are in the future', () => {
    expect(
      evaluateFreshnessState({
        ...base,
        lastSuccessAt: '2026-10-15T12:00:01.000Z',
      }),
    ).toBe('degraded');
  });
});
