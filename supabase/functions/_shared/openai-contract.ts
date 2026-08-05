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
      minItems: 1,
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
    !Array.isArray(value.report_sections) || value.report_sections.length < 1 ||
    value.report_sections.length > 20
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
  const reportSections = value.report_sections.map((section) => {
    if (
      !isRecord(section) || !isText(section.code, 100) ||
      !/^[a-z0-9-]{1,100}$/.test(section.code) ||
      !isText(section.title, 200) || !isText(section.content)
    ) return null;
    return {
      code: section.code,
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

export function redactedProviderUsage(
  response: Record<string, unknown>,
): Record<string, number> {
  const usage = isRecord(response.usage) ? response.usage : {};
  const asNonNegative = (key: string) => {
    const value = usage[key];
    return typeof value === "number" && Number.isSafeInteger(value) &&
        value >= 0
      ? value
      : 0;
  };
  const details = isRecord(usage.input_tokens_details)
    ? usage.input_tokens_details
    : {};
  const outputDetails = isRecord(usage.output_tokens_details)
    ? usage.output_tokens_details
    : {};
  return {
    input_tokens: asNonNegative("input_tokens"),
    output_tokens: asNonNegative("output_tokens"),
    cached_input_tokens: typeof details.cached_tokens === "number" &&
        Number.isSafeInteger(details.cached_tokens) &&
        details.cached_tokens >= 0
      ? details.cached_tokens
      : 0,
    reasoning_tokens: typeof outputDetails.reasoning_tokens === "number" &&
        Number.isSafeInteger(outputDetails.reasoning_tokens) &&
        outputDetails.reasoning_tokens >= 0
      ? outputDetails.reasoning_tokens
      : 0,
  };
}
