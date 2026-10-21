import { procurementLaunchRequestSchema } from "@ai-operations/contracts";

export function isWorkflowLaunchRequest(
  workflowCode: unknown,
  managerCode: unknown,
  value: unknown,
): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  if (workflowCode === "procurement-on-demand-research") {
    return managerCode === "procurement" &&
      procurementLaunchRequestSchema.safeParse(value).success;
  }
  if (workflowCode === "travel-on-demand-plan") {
    if (managerCode !== "travel") return false;
    const request = value as Record<string, unknown>;
    return Object.keys(request).every((key) =>
      ["purpose", "constraints"].includes(key)
    ) &&
      typeof request.purpose === "string" &&
      request.purpose.trim().length >= 3 &&
      request.purpose.length <= 2000 &&
      (request.constraints === undefined ||
        (typeof request.constraints === "string" &&
          request.constraints.length <= 4000));
  }
  return typeof workflowCode === "string" &&
    workflowCode.startsWith("systems-") &&
    managerCode === "systems" && Object.keys(value).length === 0;
}

export function isProcurementRevisionReference(
  managerCode: unknown,
  value: unknown,
): boolean {
  if (value === undefined) return true;
  return managerCode === "procurement" && typeof value === "string" &&
    /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);
}
