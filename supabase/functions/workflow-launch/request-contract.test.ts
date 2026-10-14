import { isWorkflowLaunchRequest } from "./request-contract.ts";

Deno.test("workflow launch accepts an empty object and rejects non-object input", () => {
  if (!isWorkflowLaunchRequest({})) {
    throw new Error("empty_workflow_input_must_be_accepted");
  }

  for (const value of [null, undefined, "", 1, [], ["input"]]) {
    if (isWorkflowLaunchRequest(value)) {
      throw new Error("non_object_workflow_input_must_be_rejected");
    }
  }
});
