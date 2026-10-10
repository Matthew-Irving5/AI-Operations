const workflowModes: Readonly<Record<string, "deterministic" | "ai">> = {
  "systems-daily-cost-capacity": "deterministic",
  "systems-weekly-quality-platform": "ai",
  "systems-monthly-cost-report": "deterministic",
  "personal-morning-plan": "deterministic",
  "personal-midday-exception": "deterministic",
  "personal-evening-close": "deterministic",
  "personal-weekly-plan": "deterministic",
  "health-daily-processing": "deterministic",
  "health-weekly-review": "deterministic",
  "finance-daily-close": "deterministic",
  "finance-monthly-close": "deterministic",
  "career-daily-evidence-sync": "deterministic",
  "career-weekly-opportunity-pulse": "deterministic",
  "career-monthly-market-value": "deterministic",
  "career-quarterly-strategy": "deterministic",
  "travel-on-demand-plan": "deterministic",
  "procurement-on-demand-research": "deterministic",
  "digital-estate-lightweight": "deterministic",
  "digital-estate-deep-scan": "deterministic",
  "digital-estate-archive-maintenance": "deterministic",
};

const modelRank: Readonly<Record<string, number>> = {
  "gpt-5.6-luna": 1,
  "gpt-5.6-terra": 2,
  "gpt-5.6-sol": 3,
};

export function resolveWorkflowMode(
  managerCode: string,
  workflowCode: string,
): "deterministic" | "ai" | null {
  if (!workflowCode.startsWith(`${managerCode}-`)) return null;
  return workflowModes[workflowCode] ?? null;
}

export function allowedActionTypesForWorkflow(
  managerCode: string,
  workflowCode: string,
): readonly string[] {
  if (
    managerCode === "systems" &&
    workflowCode === "systems-weekly-quality-platform"
  ) {
    return ["review_prompt_promotion"];
  }
  return [];
}

export function selectModelUnderCeiling(
  defaultRoute: string,
  modelCeiling: string,
): string | null {
  const requestedRank = modelRank[defaultRoute];
  const ceilingRank = modelRank[modelCeiling];
  if (requestedRank === undefined || ceilingRank === undefined) return null;
  return requestedRank <= ceilingRank ? defaultRoute : modelCeiling;
}
