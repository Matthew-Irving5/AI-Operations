import { prepareProcurementDecision } from "./procurement.ts";

const observedAt = "2026-10-21T13:00:00.000Z";
const makeCandidate = (
  id: string,
  productUrl: string,
  itemPriceMinor: number,
  hardResult: "compatible" | "incompatible" | "unknown",
): Record<string, unknown> => ({
  id,
  title: id,
  productUrl,
  merchant: "Example retailer",
  offer: {
    currency: "GBP",
    itemPriceMinor,
    deliveryMinor: 500,
    requiredAccessoriesMinor: 2_500,
    mandatoryFeesMinor: 0,
    priceType: "current_offer",
    observedAt,
    sourceUrls: [productUrl],
  },
  assessments: [
    {
      requirementId: "must-fit",
      result: hardResult,
      evidenceUrls: [productUrl],
    },
    {
      requirementId: "quiet",
      result: "compatible",
      evidenceUrls: [productUrl],
    },
  ],
  reviews: [],
  warrantySummary: "Two years",
  returnsSummary: "Thirty days",
  warrantyAndReturnsSourceUrls: [productUrl],
  rationale: "A cited product page supports the listed facts.",
});

const request = {
  item: "Cordless drill",
  purpose: "Assemble furniture at home",
  market: "United Kingdom",
  currency: "GBP",
  maxTotalCostMinor: 20_000,
  requiredBy: null,
  requirements: [
    { id: "must-fit", label: "Battery included", kind: "hard" },
    { id: "quiet", label: "Low noise", kind: "preference", weight: 50 },
  ],
  existingProducts: [],
};

Deno.test("hard compatibility, unknown facts, and mandatory total cost drive the saved result", () => {
  const candidates = [
    makeCandidate("best-fit", "https://shop.example/fit", 10_000, "compatible"),
    makeCandidate(
      "cheap-fails",
      "https://shop.example/fails",
      1_000,
      "incompatible",
    ),
    makeCandidate(
      "unknown-fit",
      "https://shop.example/unknown",
      500,
      "unknown",
    ),
  ];
  const prepared = prepareProcurementDecision(
    request,
    {
      summary: "Three candidates were checked.",
      rationale: "Fit is a hard requirement.",
      candidates,
    },
    candidates.map((candidate) => ({
      title: String(candidate.id),
      url: String(candidate.productUrl),
    })),
    "2026-10-21T14:00:00.000Z",
  );
  if (!prepared) throw new Error("valid_cited_comparison_rejected");
  const comparison = prepared.decision.comparison as Array<
    Record<string, unknown>
  >;
  if (prepared.decision.selectedCandidateId !== "best-fit") {
    throw new Error("hard_constraint_violator_won");
  }
  if (comparison[0]?.totalCostMinor !== 13_000) {
    throw new Error("accessory_and_delivery_costs_not_added");
  }
  if (
    (comparison[1]?.exclusionReasons as string[] | undefined)?.[0] !==
      "hard_requirement_incompatible:must-fit"
  ) {
    throw new Error("incompatible_candidate_not_excluded");
  }
  if (
    (comparison[2]?.exclusionReasons as string[] | undefined)?.[0] !==
      "hard_requirement_unknown:must-fit"
  ) {
    throw new Error("unknown_compatibility_not_excluded");
  }
  if (
    prepared.decision.recommendations === undefined ||
    prepared.sources.length !== 3
  ) {
    throw new Error("decision_or_citations_not_prepared");
  }
});

Deno.test("candidate claims without web-search URL citations fail closed", () => {
  const candidate = makeCandidate(
    "candidate",
    "https://shop.example/item",
    5_000,
    "compatible",
  );
  const prepared = prepareProcurementDecision(
    request,
    {
      summary: "Candidate found.",
      rationale: "Evidence is required.",
      candidates: [candidate],
    },
    [],
    "2026-10-21T14:00:00.000Z",
  );
  if (prepared !== null) throw new Error("uncited_candidate_must_be_rejected");
});
