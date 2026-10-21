import {
  extractResponseOutputText,
  extractWebSearchCalls,
  extractWebSearchCitations,
  redactedProviderUsage,
  reportOutputSchema,
  validateReportOutput,
} from "./openai-contract.ts";

const assertEquals = (actual: unknown, expected: unknown) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error("assertion_failed");
  }
};

const output = {
  summary: "Bounded synthetic result.",
  findings: [{ claim: "The fixture is valid.", evidenceIds: ["fixture-1"] }],
  recommendations: ["Keep controls enabled."],
  actions: [],
  alerts: [],
  evidence: [{ id: "fixture-1", source: "synthetic" }],
  uncertainties: [],
  report_sections: [{
    code: "summary",
    title: "Summary",
    content: "Bounded synthetic result.",
  }],
};

Deno.test("strict report output accepts only allowed evidence", () => {
  assertEquals(
    validateReportOutput(output, new Set(["fixture-1"]))?.summary,
    output.summary,
  );
  assertEquals(
    validateReportOutput({
      ...output,
      evidence: [{ id: "invented", source: "no" }],
    }, new Set(["fixture-1"])),
    null,
  );
});

Deno.test("strict report output accepts empty evidence only with no findings", () => {
  assertEquals(
    validateReportOutput({
      ...output,
      findings: [],
      evidence: [],
      uncertainties: ["No supported feedback evidence was supplied."],
    }, new Set()),
    {
      ...output,
      findings: [],
      evidence: [],
      uncertainties: ["No supported feedback evidence was supplied."],
    },
  );
  assertEquals(
    validateReportOutput({
      ...output,
      findings: [{ claim: "An unsupported claim.", evidenceIds: ["invented"] }],
      evidence: [],
    }, new Set()),
    null,
  );
});

Deno.test("strict report output accepts the governed empty-sections shape", () => {
  const properties = reportOutputSchema.properties as Record<
    string,
    { minItems?: number }
  >;
  assertEquals(properties.report_sections?.minItems, undefined);

  const validated = validateReportOutput({
    ...output,
    findings: [],
    recommendations: [],
    actions: [],
    alerts: [],
    evidence: [],
    uncertainties: ["The supplied evidence is insufficient."],
    report_sections: [],
  }, new Set());
  assertEquals(validated?.report_sections, []);
});

Deno.test("provider section codes normalize to the persisted slug", () => {
  const sectionProperties = reportOutputSchema.properties as Record<
    string,
    { items?: { properties?: Record<string, { pattern?: string }> } }
  >;
  assertEquals(
    sectionProperties.report_sections?.items?.properties?.code?.pattern,
    "^[a-z0-9-]{1,100}$",
  );

  const validated = validateReportOutput({
    ...output,
    findings: [],
    evidence: [],
    uncertainties: ["No supported synthetic records were supplied."],
    report_sections: [{
      code: "LIMITATION",
      title: "Limitation",
      content: "The synthetic run had no eligible records.",
    }],
  }, new Set());
  assertEquals(validated?.report_sections, [{
    code: "limitation",
    title: "Limitation",
    content: "The synthetic run had no eligible records.",
  }]);

  const snakeCase = validateReportOutput({
    ...output,
    findings: [],
    evidence: [],
    uncertainties: ["No supported synthetic records were supplied."],
    report_sections: [{
      code: "LIMITATION_CHECK",
      title: "Limitation check",
      content: "The synthetic run had no eligible records.",
    }],
  }, new Set());
  assertEquals(snakeCase?.report_sections, [{
    code: "limitation-check",
    title: "Limitation check",
    content: "The synthetic run had no eligible records.",
  }]);

  for (const code of ["LIMITATION CHECK", "\u212a"]) {
    assertEquals(
      validateReportOutput({
        ...output,
        report_sections: [{
          code,
          title: "Invalid section",
          content: "This synthetic section code must be rejected.",
        }],
      }, new Set(["fixture-1"])),
      null,
    );
  }

  assertEquals(
    validateReportOutput({
      ...output,
      report_sections: [
        { code: "LIMITATION_CHECK", title: "First", content: "First section." },
        {
          code: "limitation-check",
          title: "Second",
          content: "Second section.",
        },
      ],
    }, new Set(["fixture-1"])),
    null,
  );
});

Deno.test("provider usage strips untrusted provider response fields", () => {
  assertEquals(
    redactedProviderUsage({
      usage: {
        input_tokens: 12,
        output_tokens: 8,
        input_tokens_details: { cached_tokens: 2 },
        output_tokens_details: { reasoning_tokens: 1 },
        raw: "never persisted",
      },
    }),
    {
      input_tokens: 12,
      output_tokens: 8,
      cached_input_tokens: 2,
      reasoning_tokens: 1,
    },
  );
});

Deno.test("raw Responses output is extracted without persisting provider payloads", () => {
  assertEquals(
    extractResponseOutputText({
      output: [{
        type: "message",
        content: [{ type: "output_text", text: "Validated output." }],
      }],
    }),
    "Validated output.",
  );
});

Deno.test("web-search usage and cited URLs are extracted from the provider response", () => {
  const response = {
    output: [
      { type: "web_search_call", id: "search-1" },
      {
        type: "message",
        content: [{
          type: "output_text",
          text: "One source.",
          annotations: [
            {
              type: "url_citation",
              title: "Retailer",
              url: "https://shop.example/item",
            },
            {
              type: "url_citation",
              title: "Unsafe",
              url: "http://unsafe.example/item",
            },
            {
              type: "url_citation",
              title: "Retailer",
              url: "https://shop.example/item",
            },
          ],
        }],
      },
    ],
  };
  assertEquals(extractWebSearchCalls(response), 1);
  assertEquals(extractWebSearchCitations(response), [
    { title: "Retailer", url: "https://shop.example/item" },
  ]);
});
