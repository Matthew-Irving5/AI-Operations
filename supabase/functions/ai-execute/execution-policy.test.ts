import {
  allowedActionTypesForWorkflow,
  resolveWorkflowMode,
  selectModelUnderCeiling,
} from "./execution-policy.ts";

Deno.test("workflow mode is allowlisted and manager-bound", () => {
  if (
    resolveWorkflowMode("systems", "systems-weekly-quality-platform") !== "ai"
  ) {
    throw new Error("expected_approved_ai_workflow");
  }
  if (
    resolveWorkflowMode("systems", "systems-daily-cost-capacity") !==
      "deterministic"
  ) {
    throw new Error("expected_deterministic_workflow");
  }
  if (
    resolveWorkflowMode("finance", "systems-weekly-quality-platform") !== null
  ) {
    throw new Error("manager_mismatch_must_fail_closed");
  }
  if (
    resolveWorkflowMode("systems", "systems-unregistered-workflow") !== null
  ) {
    throw new Error("unknown_workflow_must_fail_closed");
  }
});

Deno.test("model selection uses the default route only when within budget ceiling", () => {
  if (
    selectModelUnderCeiling("gpt-5.6-terra", "gpt-5.6-luna") !== "gpt-5.6-luna"
  ) {
    throw new Error("must_respect_lower_ceiling");
  }
  if (
    selectModelUnderCeiling("gpt-5.6-luna", "gpt-5.6-terra") !== "gpt-5.6-luna"
  ) {
    throw new Error("must_preserve_cheaper_default");
  }
  if (selectModelUnderCeiling("unknown-model", "gpt-5.6-sol") !== null) {
    throw new Error("unknown_model_must_fail_closed");
  }
});

Deno.test("action capability comes from the server workflow allowlist", () => {
  if (
    allowedActionTypesForWorkflow("systems", "systems-weekly-quality-platform")
      .join(",") !== "review_prompt_promotion"
  ) {
    throw new Error("systems_workflow_action_allowlist_mismatch");
  }
  if (
    allowedActionTypesForWorkflow("personal", "personal-morning-plan")
      .length !== 0
  ) {
    throw new Error("unregistered_workflow_must_not_propose_actions");
  }
});
