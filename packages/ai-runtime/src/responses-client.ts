import OpenAI from 'openai';
import { z } from 'zod';

const aiOutputSchema = z.object({
  summary: z.string().min(1),
  findings: z.array(z.object({ claim: z.string(), evidenceIds: z.array(z.string()).min(1) })),
  recommendations: z.array(z.string()),
  actions: z.array(
    z.object({
      type: z.string(),
      title: z.string(),
      risk: z.enum(['low', 'medium', 'high', 'critical']),
    }),
  ),
  alerts: z.array(z.string()),
  evidence: z.array(z.object({ id: z.string(), source: z.string() })),
  uncertainties: z.array(z.string()),
  report_sections: z.array(z.object({ code: z.string(), title: z.string(), content: z.string() })),
});
type AiOutput = z.infer<typeof aiOutputSchema>;

export type ResponsesRequest = Readonly<{
  model: 'gpt-5.6-luna' | 'gpt-5.6-terra' | 'gpt-5.6-sol';
  instructions: string;
  input: string;
  schemaName: string;
  schema: Record<string, unknown>;
  background: boolean;
  webSearchEnabled: boolean;
}>;

export type ResponsesClient = Readonly<{
  create(request: ResponsesRequest): Promise<{ id: string; output: AiOutput }>;
}>;

export function createResponsesClient(
  apiKey: string,
  fetcher: typeof fetch = fetch,
): ResponsesClient {
  if (!apiKey) throw new Error('openai_api_key_missing');
  const client = new OpenAI({ apiKey, fetch: fetcher });
  return {
    async create(request) {
      const response = await client.responses.create({
        model: request.model,
        instructions: request.instructions,
        input: request.input,
        background: request.background,
        store: false,
        tools: request.webSearchEnabled ? [{ type: 'web_search' }] : [],
        text: {
          format: {
            type: 'json_schema',
            name: request.schemaName,
            strict: true,
            schema: request.schema,
          },
        },
      });
      if (!response.id || !response.output_text) throw new Error('openai_response_incomplete');
      const parsed = aiOutputSchema.safeParse(JSON.parse(response.output_text));
      if (!parsed.success) throw new Error('openai_structured_output_invalid');
      return { id: response.id, output: parsed.data };
    },
  };
}
