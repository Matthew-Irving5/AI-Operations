import { buildCurrentPromptResponse } from "./current.ts";

const template = {
  id: "11111111-1111-4111-8111-111111111111",
  code: "controlled-agent-report",
  active_version: 2,
  managerCode: "systems",
};
const stringArray = { type: "array", items: { type: "string" } };
const objectArray = (fields: Record<string, unknown>) => ({
  type: "array",
  items: {
    type: "object",
    additionalProperties: false,
    required: Object.keys(fields),
    properties: fields,
  },
});
const version = {
  template_id: template.id,
  version: 2,
  json_schema: {
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
      summary: { type: "string" },
      findings: objectArray({
        claim: { type: "string" },
        evidenceIds: stringArray,
      }),
      recommendations: stringArray,
      actions: objectArray({
        type: { type: "string" },
        title: { type: "string" },
        risk: { type: "string", enum: ["low", "medium", "high", "critical"] },
      }),
      alerts: stringArray,
      evidence: objectArray({
        id: { type: "string" },
        source: { type: "string" },
      }),
      uncertainties: stringArray,
      report_sections: objectArray({
        code: { type: "string" },
        title: { type: "string" },
        content: { type: "string" },
      }),
    },
  },
  model_route: "gpt-5.6-terra",
  schema_version: 1,
  tool_policy_version: 1,
  tool_policy: { version: 1, tools: [] },
};

Deno.test("current prompt response exposes only active Systems governance inputs", () => {
  const current = buildCurrentPromptResponse(template, version);
  if (!current) throw new Error("expected_current_prompt_response");
  if (
    current.templateId !== template.id || current.activeVersion !== 2 ||
    current.modelRoute !== "gpt-5.6-terra" || current.schemaVersion !== 1 ||
    current.toolPolicyVersion !== 1 || current.schema !== version.json_schema
  ) {
    throw new Error("current_prompt_governance_fields_mismatch");
  }
  if (
    "systemText" in current || "developerText" in current ||
    "evaluationResult" in current
  ) {
    throw new Error("current_prompt_response_exposed_unrequested_content");
  }
});

Deno.test("Planner prompt governance keeps its own manager and empty prompt tool policy", () => {
  const current = buildCurrentPromptResponse({
    ...template,
    code: "planner-agent-report",
    managerCode: "personal",
  }, version);
  if (
    !current || current.templateId !== template.id ||
    current.toolPolicy.tools.length !== 0
  ) {
    throw new Error(
      "planner_prompt_governance_must_remain_empty_and_manager_bound",
    );
  }
  if (
    buildCurrentPromptResponse({
      ...template,
      code: "planner-agent-report",
      managerCode: "systems",
    }, version)
  ) throw new Error("planner_template_must_reject_non_personal_manager");
});

Deno.test("current prompt response rejects non-Systems, stale, or ungoverned versions", () => {
  if (
    buildCurrentPromptResponse({ ...template, managerCode: "finance" }, version)
  ) {
    throw new Error("non_system_template_must_be_rejected");
  }
  if (buildCurrentPromptResponse(template, { ...version, version: 1 })) {
    throw new Error("stale_active_version_must_be_rejected");
  }
  if (
    buildCurrentPromptResponse(template, {
      ...version,
      tool_policy: { version: 1, tools: ["arbitrary_execution"] },
    })
  ) {
    throw new Error("ungoverned_tool_policy_must_be_rejected");
  }
});
