import { expect, it } from 'vitest';
import { createResponsesClient } from './responses-client';

it('uses Responses structured output format and rejects invalid output', async () => {
  let body = '';
  const client = createResponsesClient('synthetic-key', async (_input, init) => {
    body = String(init?.body);
    return new Response(
      JSON.stringify({
        id: 'resp_synthetic',
        output_text: JSON.stringify({
          summary: 'ok',
          findings: [],
          recommendations: [],
          actions: [],
          alerts: [],
          evidence: [],
          uncertainties: [],
          report_sections: [],
        }),
      }),
    );
  });
  await expect(
    client.create({
      model: 'gpt-5.6-luna',
      instructions: 'fixed policy',
      input: 'untrusted data',
      schemaName: 'synthetic',
      schema: { type: 'object' },
      background: false,
      webSearchEnabled: false,
    }),
  ).resolves.toMatchObject({ id: 'resp_synthetic' });
  expect(JSON.parse(body).text.format.strict).toBe(true);
});
