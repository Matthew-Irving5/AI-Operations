import {
  validatePromptGovernance,
  validateReportOutputSchema,
} from "../../../packages/ai-runtime/src/governance.ts";

type CurrentTemplate = {
  id: unknown;
  code: unknown;
  active_version: unknown;
  managerCode: unknown;
};

type CurrentVersion = {
  template_id: unknown;
  version: unknown;
  json_schema: unknown;
  model_route: unknown;
  schema_version: unknown;
  tool_policy_version: unknown;
  tool_policy: unknown;
};

export function buildCurrentPromptResponse(
  template: CurrentTemplate,
  version: CurrentVersion,
) {
  if (
    typeof template.id !== "string" ||
    !/^[0-9a-f-]{36}$/i.test(template.id) ||
    !(
      (template.code === "controlled-agent-report" &&
        template.managerCode === "systems") ||
      (template.code === "planner-agent-report" &&
        template.managerCode === "personal")
    ) ||
    !Number.isSafeInteger(template.active_version) ||
    template.active_version !== version.version ||
    template.id !== version.template_id ||
    !validateReportOutputSchema(version.json_schema)
  ) {
    return null;
  }

  const governance = {
    modelRoute: version.model_route,
    schemaVersion: version.schema_version,
    toolPolicyVersion: version.tool_policy_version,
    toolPolicy: version.tool_policy,
  };
  if (!validatePromptGovernance(governance)) return null;

  return {
    templateId: template.id,
    activeVersion: template.active_version,
    schema: version.json_schema,
    ...governance,
  };
}
