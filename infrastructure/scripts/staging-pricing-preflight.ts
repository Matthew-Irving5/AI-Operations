import { z } from 'zod';
import { stagingTarget } from '../../apps/web/lib/live-e2e-safety';

const DecimalText = z.string().regex(/^(?:\d+(?:\.\d+)?|\.\d+)$/);
const PricingRowsSchema = z
  .array(
    z
      .object({
        model_id: z.string().min(1),
        supported_tools: z.array(z.string()),
        pricing_id: z.uuid().nullable(),
        effective_from: z.iso.datetime({ offset: true }).nullable(),
        verified_at: z.iso.datetime({ offset: true }).nullable(),
        input_per_million: DecimalText.nullable(),
        cached_input_per_million: DecimalText.nullable(),
        output_per_million: DecimalText.nullable(),
        web_search_per_call: DecimalText.nullable(),
        source_url: z.string().url().nullable(),
      })
      .strict(),
  )
  .min(1)
  .max(20);

const pricingReadinessSql = `select model.model_id, model.supported_tools,
  price.id::text as pricing_id,
  case when price.effective_from is null then null else to_char(price.effective_from at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') end as effective_from,
  case when price.verified_at is null then null else to_char(price.verified_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') end as verified_at,
  price.input_per_million::text as input_per_million,
  price.cached_input_per_million::text as cached_input_per_million,
  price.output_per_million::text as output_per_million,
  price.web_search_per_call::text as web_search_per_call,
  price.source_url
from public.ai_model_catalog model
left join lateral (
  select * from public.model_pricing
  where model_id = model.id and effective_from <= now()
  order by effective_from desc, id desc limit 1
) price on true
where model.provider = 'openai' and model.enabled
order by model.model_id`;

function isPositiveDecimal(value: string): boolean {
  return /[1-9]/.test(value.replace('.', ''));
}

export function assertStagingPricingRows(raw: unknown, now = Date.now()): void {
  const rows = PricingRowsSchema.parse(raw);
  const modelIds = new Set<string>();
  for (const row of rows) {
    if (modelIds.has(row.model_id))
      throw new Error('Staging pricing read returned duplicate models.');
    modelIds.add(row.model_id);
    if (
      !row.pricing_id ||
      !row.effective_from ||
      !row.verified_at ||
      !row.source_url ||
      !row.input_per_million ||
      !row.cached_input_per_million ||
      !row.output_per_million ||
      !row.web_search_per_call
    ) {
      throw new Error(`Staging pricing is missing for enabled model ${row.model_id}.`);
    }
    const verifiedAt = Date.parse(row.verified_at);
    const effectiveFrom = Date.parse(row.effective_from);
    if (
      !Number.isFinite(verifiedAt) ||
      verifiedAt > now + 5 * 60_000 ||
      verifiedAt < now - 90 * 24 * 60 * 60_000 ||
      !Number.isFinite(effectiveFrom) ||
      effectiveFrom > now
    ) {
      throw new Error(
        `Staging pricing is stale or not yet effective for enabled model ${row.model_id}.`,
      );
    }
    const sourceHost = new URL(row.source_url).hostname;
    if (sourceHost !== 'openai.com' && !sourceHost.endsWith('.openai.com')) {
      throw new Error(`Staging pricing source is not OpenAI for enabled model ${row.model_id}.`);
    }
    if (
      !isPositiveDecimal(row.input_per_million) ||
      !isPositiveDecimal(row.output_per_million) ||
      (row.supported_tools.includes('web_search') && !isPositiveDecimal(row.web_search_per_call))
    ) {
      throw new Error(
        `Staging pricing has a zero billable rate for enabled model ${row.model_id}.`,
      );
    }
  }
}

export async function assertStagingPricingReadiness(
  environment: Record<string, string | undefined> = process.env,
  request: typeof fetch = fetch,
  now = Date.now(),
): Promise<void> {
  const projectRef = stagingTarget.projectRef;
  if (
    environment.STAGING_PROJECT_REF !== projectRef ||
    environment.STAGING_PROJECT_URL !== `https://${projectRef}.supabase.co` ||
    !environment.STAGING_PERSONAL_ACCESS_TOKEN?.startsWith('sbp_')
  ) {
    throw new Error(
      'Staging pricing preflight requires the fixed staging project and Management credential.',
    );
  }
  const response = await request(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query/read-only`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${environment.STAGING_PERSONAL_ACCESS_TOKEN}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ query: pricingReadinessSql }),
    },
  );
  if (!response.ok) throw new Error(`Staging pricing preflight failed HTTP ${response.status}.`);
  assertStagingPricingRows(await response.json(), now);
}
