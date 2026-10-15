import {
  extractResponseOutputText,
  redactedProviderUsage,
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
