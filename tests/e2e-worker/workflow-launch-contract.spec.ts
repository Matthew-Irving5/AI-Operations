import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { systemsLaunchRequest } from '../support/systems-launch-request';

test('production Worker validates the bounded Systems weekly request before auth', async ({
  page,
}) => {
  const login = await page.goto('/login');
  expect(login?.status()).toBe(200);

  const malformed = await page.evaluate(async () => {
    const response = await fetch('/api/workflows/launch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ workflowCode: 'systems-weekly-quality-platform' }),
    });
    return { status: response.status, body: await response.json() };
  });
  expect(malformed).toEqual({ status: 400, body: { code: 'invalid_launch_request' } });

  const requests = [
    systemsLaunchRequest({
      workflowCode: 'systems-weekly-quality-platform',
      hardCapUsd: 0.05,
      modelCeiling: 'gpt-5.6-luna',
      idempotencyKey: randomUUID(),
    }),
    systemsLaunchRequest({
      workflowCode: 'systems-weekly-quality-platform',
      hardCapUsd: 0.15,
      modelCeiling: 'gpt-5.6-terra',
      idempotencyKey: randomUUID(),
    }),
  ];

  for (const body of requests) {
    const result = await page.evaluate(async (requestBody) => {
      const response = await fetch('/api/workflows/launch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      return { status: response.status, body: await response.json() };
    }, body);

    expect(result).toEqual({ status: 401, body: { code: 'unauthorised' } });
  }
});
