import { isProcurementRevisionReference, isWorkflowLaunchRequest } from "./request-contract.ts";

Deno.test("workflow launch keeps the existing bounded Systems empty request", () => {
  if (!isWorkflowLaunchRequest("systems-weekly-quality-platform", "systems", {})) {
    throw new Error("empty_workflow_input_must_be_accepted");
  }

  for (const value of [null, undefined, "", 1, [], ["input"]]) {
    if (isWorkflowLaunchRequest("systems-weekly-quality-platform", "systems", value)) {
      throw new Error("non_object_workflow_input_must_be_rejected");
    }
  }
});

Deno.test("procurement launch requires requirements, market, currency, and a product budget", () => {
  const request = {
    item: "Cordless drill",
    purpose: "Assemble furniture at home",
    market: "United Kingdom",
    currency: "GBP",
    maxTotalCostMinor: 50000,
    requiredBy: null,
    requirements: [{ id: "hard-1", label: "Battery included", kind: "hard" }],
    existingProducts: [],
  };
  if (!isWorkflowLaunchRequest("procurement-on-demand-research", "procurement", request)) {
    throw new Error("valid_procurement_request_rejected");
  }
  if (isWorkflowLaunchRequest("procurement-on-demand-research", "procurement", { ...request, requirements: [] })) {
    throw new Error("empty_hard_requirements_must_be_rejected");
  }
  if (isWorkflowLaunchRequest("procurement-on-demand-research", "travel", request)) {
    throw new Error("workflow_manager_mismatch_must_be_rejected");
  }
});

Deno.test("revision references are optional UUIDs scoped to Procurement", () => {
  if (!isProcurementRevisionReference("procurement", undefined)) {
    throw new Error("revision_reference_must_be_optional");
  }
  if (!isProcurementRevisionReference("procurement", "00000000-0000-4000-8000-000000000101")) {
    throw new Error("valid_procurement_revision_reference_rejected");
  }
  if (isProcurementRevisionReference("travel", "00000000-0000-4000-8000-000000000101")) {
    throw new Error("non_procurement_revision_reference_accepted");
  }
  if (isProcurementRevisionReference("procurement", "not-a-uuid") ||
    isProcurementRevisionReference("procurement", null)) {
    throw new Error("invalid_procurement_revision_reference_accepted");
  }
});
