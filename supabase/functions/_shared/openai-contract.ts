export type AiAction = Readonly<{
  type: string;
  title: string;
  risk: "low" | "medium" | "high" | "critical";
}>;

export type AiReportOutput = Readonly<{
  summary: string;
  findings: ReadonlyArray<
    Readonly<{ claim: string; evidenceIds: ReadonlyArray<string> }>
  >;
  recommendations: ReadonlyArray<string>;
  actions: ReadonlyArray<AiAction>;
  alerts: ReadonlyArray<string>;
  evidence: ReadonlyArray<Readonly<{ id: string; source: string }>>;
  uncertainties: ReadonlyArray<string>;
  report_sections: ReadonlyArray<
    Readonly<{ code: string; title: string; content: string }>
  >;
}>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isText = (value: unknown, maximum = 8_000): value is string =>
  typeof value === "string" && value.trim().length > 0 &&
  value.length <= maximum;
const isTextArray = (value: unknown, maximumItems = 50): value is string[] =>
  Array.isArray(value) && value.length <= maximumItems &&
  value.every((item) => isText(item));

export const reportOutputSchema: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: [
    "summary",
    "findings",
    "recommendations",
    "actions",
    "alerts",
    "evidence",
    "uncertainties",
    "report_sections",
  ],
  properties: {
    summary: { type: "string", minLength: 1, maxLength: 8_000 },
    findings: {
      type: "array",
      maxItems: 50,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["claim", "evidenceIds"],
        properties: {
          claim: { type: "string", minLength: 1, maxLength: 8_000 },
          evidenceIds: {
            type: "array",
            minItems: 1,
            maxItems: 50,
            items: { type: "string", minLength: 1, maxLength: 200 },
          },
        },
      },
    },
    recommendations: {
      type: "array",
      maxItems: 50,
      items: { type: "string", minLength: 1, maxLength: 8_000 },
    },
    actions: {
      type: "array",
      maxItems: 20,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "title", "risk"],
        properties: {
          type: { type: "string", minLength: 1, maxLength: 100 },
          title: { type: "string", minLength: 1, maxLength: 500 },
          risk: { enum: ["low", "medium", "high", "critical"] },
        },
      },
    },
    alerts: {
      type: "array",
      maxItems: 50,
      items: { type: "string", minLength: 1, maxLength: 8_000 },
    },
    evidence: {
      type: "array",
      maxItems: 50,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "source"],
        properties: {
          id: { type: "string", minLength: 1, maxLength: 200 },
          source: { type: "string", minLength: 1, maxLength: 500 },
        },
      },
    },
    uncertainties: {
      type: "array",
      maxItems: 50,
      items: { type: "string", minLength: 1, maxLength: 8_000 },
    },
    report_sections: {
      type: "array",
      maxItems: 20,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["code", "title", "content"],
        properties: {
          code: { type: "string", pattern: "^[a-z0-9-]{1,100}$" },
          title: { type: "string", minLength: 1, maxLength: 200 },
          content: { type: "string", minLength: 1, maxLength: 8_000 },
        },
      },
    },
  },
};

export function validateReportOutput(
  value: unknown,
  allowedEvidenceIds: ReadonlySet<string>,
): AiReportOutput | null {
  if (
    !isRecord(value) || !isText(value.summary) ||
    !isTextArray(value.recommendations) ||
    !isTextArray(value.alerts) || !isTextArray(value.uncertainties) ||
    !Array.isArray(value.findings) || value.findings.length > 50 ||
    !Array.isArray(value.actions) || value.actions.length > 20 ||
    !Array.isArray(value.evidence) || value.evidence.length > 50 ||
    !Array.isArray(value.report_sections) || value.report_sections.length > 20
  ) return null;
  const findings = value.findings.map((finding) => {
    if (
      !isRecord(finding) || !isText(finding.claim) ||
      !isTextArray(finding.evidenceIds) ||
      finding.evidenceIds.some((id) => !allowedEvidenceIds.has(id))
    ) return null;
    return { claim: finding.claim, evidenceIds: finding.evidenceIds };
  });
  const actions = value.actions.map((action) => {
    if (
      !isRecord(action) || !isText(action.type, 100) ||
      !isText(action.title, 500) ||
      !["low", "medium", "high", "critical"].includes(String(action.risk))
    ) return null;
    return {
      type: action.type,
      title: action.title,
      risk: action.risk as AiAction["risk"],
    };
  });
  const evidence = value.evidence.map((item) => {
    if (
      !isRecord(item) || !isText(item.id, 200) || !isText(item.source, 500) ||
      !allowedEvidenceIds.has(item.id)
    ) return null;
    return { id: item.id, source: item.source };
  });
  const reportSectionCodes = new Set<string>();
  const reportSections = value.report_sections.map((section) => {
    const code = isRecord(section) && isText(section.code, 100)
      ? section.code
      : null;
    if (
      !isRecord(section) || !code || !/^[A-Za-z0-9_-]{1,100}$/.test(code) ||
      !isText(section.title, 200) || !isText(section.content)
    ) return null;
    const canonicalCode = code.toLowerCase().replaceAll("_", "-");
    if (reportSectionCodes.has(canonicalCode)) return null;
    reportSectionCodes.add(canonicalCode);
    return {
      code: canonicalCode,
      title: section.title,
      content: section.content,
    };
  });
  if (
    findings.some((item) => item === null) ||
    actions.some((item) => item === null) ||
    evidence.some((item) => item === null) ||
    reportSections.some((item) => item === null)
  ) return null;
  return {
    summary: value.summary,
    findings: findings as Array<{ claim: string; evidenceIds: string[] }>,
    recommendations: value.recommendations,
    actions: actions as AiAction[],
    alerts: value.alerts,
    evidence: evidence as Array<{ id: string; source: string }>,
    uncertainties: value.uncertainties,
    report_sections: reportSections as Array<{
      code: string;
      title: string;
      content: string;
    }>,
  };
}

export type RedactedProviderUsage = Readonly<{
  input_tokens: number;
  output_tokens: number;
  cached_input_tokens: number;
  cache_write_tokens: number;
  has_cache_write_usage: boolean;
  has_complete_usage: boolean;
  reasoning_tokens: number;
}>;

export function redactedProviderUsage(
  response: Record<string, unknown>,
): RedactedProviderUsage {
  const usage = isRecord(response.usage) ? response.usage : {};
  const asNonNegative = (value: unknown) => {
    return typeof value === "number" && Number.isSafeInteger(value) &&
        value >= 0
      ? value
      : null;
  };
  const details = isRecord(usage.input_tokens_details)
    ? usage.input_tokens_details
    : {};
  const outputDetails = isRecord(usage.output_tokens_details)
    ? usage.output_tokens_details
    : {};
  const cacheWriteValue = details.cache_write_tokens;
  const cacheWriteTokens = typeof cacheWriteValue === "number" &&
      Number.isSafeInteger(cacheWriteValue) && cacheWriteValue >= 0
    ? cacheWriteValue
    : null;
  const inputTokens = asNonNegative(usage.input_tokens);
  const outputTokens = asNonNegative(usage.output_tokens);
  const cachedInputTokens = asNonNegative(details.cached_tokens);
  const reasoningTokens = asNonNegative(outputDetails.reasoning_tokens);
  return {
    input_tokens: inputTokens ?? 0,
    output_tokens: outputTokens ?? 0,
    cached_input_tokens: cachedInputTokens ?? 0,
    cache_write_tokens: cacheWriteTokens ?? 0,
    has_cache_write_usage: cacheWriteTokens !== null,
    has_complete_usage: inputTokens !== null && outputTokens !== null &&
      cachedInputTokens !== null && cacheWriteTokens !== null,
    reasoning_tokens: reasoningTokens ?? 0,
  };
}

export function extractResponseOutputText(
  response: Record<string, unknown>,
): string | null {
  if (isText(response.output_text, 60_000)) return response.output_text;
  if (!Array.isArray(response.output)) return null;
  const text = response.output.flatMap((item) => {
    if (
      !isRecord(item) || item.type !== "message" ||
      !Array.isArray(item.content)
    ) return [];
    return item.content.flatMap((content) =>
      isRecord(content) && content.type === "output_text" &&
        typeof content.text === "string"
        ? [content.text]
        : []
    );
  }).join("");
  return isText(text, 60_000) ? text : null;
}

export type WebSearchCitation = Readonly<{ title: string; url: string }>;

export function extractWebSearchCalls(response: Record<string, unknown>): number {
  if (!Array.isArray(response.output)) return 0;
  return response.output.filter((item) =>
    isRecord(item) && item.type === 'web_search_call'
  ).length;
}

export function extractWebSearchCitations(
  response: Record<string, unknown>,
): WebSearchCitation[] {
  if (!Array.isArray(response.output)) return [];
  const citations = new Map<string, WebSearchCitation>();
  for (const item of response.output) {
    if (!isRecord(item) || item.type !== 'message' || !Array.isArray(item.content)) continue;
    for (const content of item.content) {
      if (!isRecord(content) || !Array.isArray(content.annotations)) continue;
      for (const annotation of content.annotations) {
        if (
          !isRecord(annotation) || annotation.type !== 'url_citation' ||
          typeof annotation.url !== 'string' || !annotation.url.startsWith('https://')
        ) continue;
        try {
          const url = new URL(annotation.url).toString();
          const title = typeof annotation.title === 'string' && annotation.title.trim()
            ? annotation.title.trim().slice(0, 300)
            : new URL(url).hostname;
          citations.set(url, { title, url });
        } catch {
          // Invalid provider citations are omitted and later cause referenced URLs to fail validation.
        }
      }
    }
  }
  return [...citations.values()];
}
