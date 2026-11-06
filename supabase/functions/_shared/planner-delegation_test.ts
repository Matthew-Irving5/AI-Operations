import {
  isPlannerDelegationResume,
  parsePlannerDelegationCall,
  plannerDelegationTool,
} from "./planner-delegation.ts";

const evidenceId = "00000000-0000-4000-8000-000000000101";

Deno.test("Planner exposes only the strict server-routed specialist function", () => {
  if (
    plannerDelegationTool.name !== "delegate_to_travel_specialist" ||
    plannerDelegationTool.strict !== true ||
    plannerDelegationTool.parameters.additionalProperties !== false ||
    plannerDelegationTool.parameters.required.join(",") !==
      "objective,contextEvidenceIds"
  ) throw new Error("planner_delegation_tool_contract_mismatch");
});

Deno.test("validates one bounded Planner delegation call", () => {
  const parsed = parsePlannerDelegationCall({
    output: [{
      type: "function_call",
      call_id: "call_planner_1",
      name: plannerDelegationTool.name,
      arguments: JSON.stringify({
        objective: "Plan a weekend trip with a rail itinerary.",
        contextEvidenceIds: [evidenceId],
      }),
    }],
  }, new Set([evidenceId]));
  if (
    parsed.kind !== "delegate" ||
    parsed.value.objective !== "Plan a weekend trip with a rail itinerary." ||
    parsed.value.contextEvidenceIds[0] !== evidenceId
  ) throw new Error("planner_delegation_call_not_parsed");
});

Deno.test("rejects extra, duplicate, malformed, or multiple tool calls", () => {
  const call = {
    type: "function_call",
    call_id: "call_planner_1",
    name: plannerDelegationTool.name,
    arguments: JSON.stringify({
      objective: "Plan a weekend trip.",
      contextEvidenceIds: [],
      destinationManagerCode: "systems",
    }),
  };
  if (
    parsePlannerDelegationCall({ output: [call] }, new Set()).kind !== "invalid"
  ) {
    throw new Error("unexpected_arguments_must_be_rejected");
  }
  if (
    parsePlannerDelegationCall({ output: [call, call] }, new Set()).kind !==
      "invalid"
  ) throw new Error("multiple_calls_must_be_rejected");
  const foreignEvidenceCall = {
    type: "function_call",
    call_id: "call_planner_2",
    name: plannerDelegationTool.name,
    arguments: JSON.stringify({
      objective: "Plan a weekend trip.",
      contextEvidenceIds: [evidenceId],
    }),
  };
  if (
    parsePlannerDelegationCall({ output: [foreignEvidenceCall] }, new Set())
      .kind !== "invalid"
  ) throw new Error("unprovided_evidence_ids_must_be_rejected");
  if (parsePlannerDelegationCall({ output: [] }, new Set()).kind !== "none") {
    throw new Error("ordinary_report_response_must_not_be_a_delegation");
  }
});

Deno.test("a persisted delegation result disables another specialist call", () => {
  if (
    !isPlannerDelegationResume({ delegationResults: [{ status: "completed" }] })
  ) {
    throw new Error("delegation_result_must_suppress_redelegation");
  }
  if (isPlannerDelegationResume({ delegationResults: [] })) {
    throw new Error("empty_results_must_not_suppress_initial_planner_call");
  }
});
