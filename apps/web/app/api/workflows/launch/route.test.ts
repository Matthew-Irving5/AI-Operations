import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';
import { getAuthenticatedServerAccessToken } from '../../../../lib/supabase-server';

vi.mock('../../../../lib/supabase-server', () => ({
  getAuthenticatedServerAccessToken: vi.fn(),
}));

describe('workflow launch route', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://jqtssfrfocnibffdkqch.supabase.co');
    vi.mocked(getAuthenticatedServerAccessToken).mockResolvedValue('user-session-token');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ runId: '00000000-0000-4000-8000-000000000101' }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  function sameOriginRequest(body: unknown) {
    return new Request('https://app.example.test/api/workflows/launch', {
      method: 'POST',
      headers: { origin: 'https://app.example.test', 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  const systemsRequests = [
    {
      workflowCode: 'systems-daily-cost-capacity',
      hardCapUsd: 0.01,
      modelCeiling: 'gpt-5.6-luna',
    },
    {
      workflowCode: 'systems-weekly-quality-platform',
      hardCapUsd: 0.05,
      modelCeiling: 'gpt-5.6-luna',
    },
    {
      workflowCode: 'systems-weekly-quality-platform',
      hardCapUsd: 0.15,
      modelCeiling: 'gpt-5.6-terra',
    },
  ] as const;

  it.each(systemsRequests)(
    'forwards the bounded systems workflow empty-object request',
    async (flow) => {
      const input = {
        ...flow,
        managerCode: 'systems',
        searchCeiling: 0,
        idempotencyKey: '00000000-0000-4000-8000-000000000101',
        request: {},
      };
      const response = await POST(sameOriginRequest(input));

      expect(response.status).toBe(201);
      const [url, init] = vi.mocked(globalThis.fetch).mock.calls[0] ?? [];
      expect(url).toBe('https://jqtssfrfocnibffdkqch.supabase.co/functions/v1/workflow-launch');
      expect(init?.method).toBe('POST');
      expect(JSON.parse(String(init?.body))).toEqual(input);
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer user-session-token');
    },
  );

  it('rejects changed systems caps, models, search, manager, or non-empty input before dispatch', async () => {
    const base = {
      workflowCode: 'systems-weekly-quality-platform',
      managerCode: 'systems',
      hardCapUsd: 0.05,
      modelCeiling: 'gpt-5.6-luna',
      searchCeiling: 0,
      idempotencyKey: '00000000-0000-4000-8000-000000000102',
      request: {},
    };
    const invalidInputs = [
      { ...base, hardCapUsd: 0.06 },
      { ...base, modelCeiling: 'gpt-5.6-terra' },
      { ...base, hardCapUsd: 0.15 },
      { ...base, hardCapUsd: 0.15, modelCeiling: 'gpt-5.6-sol' },
      { ...base, searchCeiling: 1 },
      { ...base, managerCode: 'finance' },
      { ...base, request: { prompt: 'caller supplied prompt' } },
      { ...base, request: [] },
      { ...base, request: null },
      { ...base, workflowCode: 'unknown-workflow' },
    ];

    for (const input of invalidInputs) {
      const response = await POST(sameOriginRequest(input));
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ code: 'invalid_launch_request' });
    }
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('retains the existing travel and procurement launch contract', async () => {
    const input = {
      workflowCode: 'travel-on-demand-plan',
      managerCode: 'travel',
      hardCapUsd: 0.01,
      modelCeiling: 'gpt-5.6-luna',
      searchCeiling: 0,
      idempotencyKey: '00000000-0000-4000-8000-000000000103',
      request: { purpose: 'Plan a short trip', constraints: '' },
    };
    const response = await POST(sameOriginRequest(input));
    expect(response.status).toBe(201);
    expect(globalThis.fetch).toHaveBeenCalledOnce();
  });
});
