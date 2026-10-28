import { z } from 'zod';

const idSchema = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/);
const sourceUrlSchema = z
  .string()
  .url()
  .refine((value) => value.startsWith('https://'));
const currencySchema = z.string().regex(/^[A-Z]{3}$/);

export const procurementLaunchRequestSchema = z
  .object({
    item: z.string().trim().min(3).max(300),
    purpose: z.string().trim().min(3).max(2_000),
    market: z.string().trim().min(2).max(120),
    currency: currencySchema,
    maxTotalCostMinor: z.number().int().positive().safe(),
    requiredBy: z.string().date().nullable(),
    requirements: z
      .array(
        z.discriminatedUnion('kind', [
          z
            .object({
              id: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/),
              label: z.string().trim().min(1).max(300),
              kind: z.literal('hard'),
            })
            .strict(),
          z
            .object({
              id: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/),
              label: z.string().trim().min(1).max(300),
              kind: z.literal('preference'),
              weight: z.number().int().min(1).max(100),
            })
            .strict(),
        ]),
      )
      .min(1)
      .max(25),
    existingProducts: z.array(z.string().trim().min(1).max(300)).max(20),
  })
  .strict()
  .superRefine((request, context) => {
    const ids = new Set<string>();
    request.requirements.forEach((requirement, index) => {
      if (ids.has(requirement.id)) {
        context.addIssue({
          code: 'custom',
          message: 'duplicate_requirement_id',
          path: ['requirements', index, 'id'],
        });
      }
      ids.add(requirement.id);
    });
    if (!request.requirements.some((requirement) => requirement.kind === 'hard')) {
      context.addIssue({
        code: 'custom',
        message: 'hard_requirement_required',
        path: ['requirements'],
      });
    }
  });

export const procurementRequirementSchema = z.discriminatedUnion('kind', [
  z
    .object({ id: idSchema, label: z.string().trim().min(1).max(300), kind: z.literal('hard') })
    .strict(),
  z
    .object({
      id: idSchema,
      label: z.string().trim().min(1).max(300),
      kind: z.literal('preference'),
      weight: z.number().int().min(1).max(100),
    })
    .strict(),
]);

export const procurementCandidateSchema = z
  .object({
    id: idSchema,
    title: z.string().trim().min(1).max(300),
    productUrl: sourceUrlSchema,
    merchant: z.string().trim().min(1).max(200),
    offer: z
      .object({
        currency: currencySchema,
        itemPriceMinor: z.number().int().nonnegative().safe().nullable(),
        deliveryMinor: z.number().int().nonnegative().safe().nullable(),
        requiredAccessoriesMinor: z.number().int().nonnegative().safe().nullable(),
        mandatoryFeesMinor: z.number().int().nonnegative().safe().nullable(),
        priceType: z.enum(['current_offer', 'list_price', 'indicative', 'historical']),
        observedAt: z.string().datetime({ offset: true }).nullable(),
        sourceUrls: z.array(sourceUrlSchema).max(20),
      })
      .strict(),
    assessments: z
      .array(
        z
          .object({
            requirementId: idSchema,
            result: z.enum(['compatible', 'incompatible', 'unknown']),
            evidenceUrls: z.array(sourceUrlSchema).max(10),
          })
          .strict(),
      )
      .max(25),
    reviews: z
      .array(
        z
          .object({
            sourceUrl: sourceUrlSchema,
            sourceKind: z.enum(['independent', 'marketplace', 'retailer', 'manufacturer']),
            retrievedAt: z.string().datetime({ offset: true }),
            rating: z.number().min(0).max(5).nullable(),
            reviewCount: z.number().int().nonnegative().safe().nullable(),
            summary: z.string().trim().min(1).max(1000),
          })
          .strict(),
      )
      .max(20),
    warrantySummary: z.string().trim().max(1000).nullable(),
    returnsSummary: z.string().trim().max(1000).nullable(),
    warrantyAndReturnsSourceUrls: z.array(sourceUrlSchema).max(20),
    rationale: z.string().trim().min(1).max(2000),
  })
  .strict();

export const procurementDecisionInputSchema = z
  .object({
    currency: currencySchema,
    maxTotalCostMinor: z.number().int().positive().safe(),
    requirements: z.array(procurementRequirementSchema).min(1).max(25),
    candidates: z.array(procurementCandidateSchema).min(1).max(20),
    rationale: z.string().trim().min(1).max(4000),
  })
  .strict()
  .superRefine((decision, context) => {
    const requirementIds = new Set<string>();
    for (const [index, requirement] of decision.requirements.entries()) {
      if (requirementIds.has(requirement.id)) {
        context.addIssue({
          code: 'custom',
          message: 'duplicate_requirement_id',
          path: ['requirements', index, 'id'],
        });
      }
      requirementIds.add(requirement.id);
    }
    const candidateIds = new Set<string>();
    for (const [index, candidate] of decision.candidates.entries()) {
      if (candidateIds.has(candidate.id)) {
        context.addIssue({
          code: 'custom',
          message: 'duplicate_candidate_id',
          path: ['candidates', index, 'id'],
        });
      }
      candidateIds.add(candidate.id);
      const assessmentIds = new Set<string>();
      for (const [assessmentIndex, assessment] of candidate.assessments.entries()) {
        if (!requirementIds.has(assessment.requirementId)) {
          context.addIssue({
            code: 'custom',
            message: 'assessment_requirement_unknown',
            path: ['candidates', index, 'assessments', assessmentIndex, 'requirementId'],
          });
        }
        if (assessmentIds.has(assessment.requirementId)) {
          context.addIssue({
            code: 'custom',
            message: 'duplicate_candidate_assessment',
            path: ['candidates', index, 'assessments', assessmentIndex, 'requirementId'],
          });
        }
        assessmentIds.add(assessment.requirementId);
      }
      if (candidate.offer.currency !== decision.currency) {
        context.addIssue({
          code: 'custom',
          message: 'candidate_currency_mismatch',
          path: ['candidates', index, 'offer', 'currency'],
        });
      }
      if (candidate.offer.priceType === 'current_offer' && candidate.offer.observedAt === null) {
        context.addIssue({
          code: 'custom',
          message: 'current_offer_requires_observed_at',
          path: ['candidates', index, 'offer', 'observedAt'],
        });
      }
    }
  });

export const procurementResearchOutputSchema = z
  .object({
    summary: z.string().trim().min(1).max(8_000),
    rationale: z.string().trim().min(1).max(4_000),
    candidates: z.array(procurementCandidateSchema).max(10),
  })
  .strict();

export const procurementCandidateResultSchema = z
  .object({
    candidateId: idSchema,
    status: z.enum(['eligible', 'excluded']),
    rank: z.number().int().positive().nullable(),
    totalCostMinor: z.number().int().nonnegative().safe().nullable(),
    priceConfidence: z.enum(['current_verified', 'indicative', 'historical', 'unknown']),
    preferenceScore: z.number().int().nonnegative(),
    independentReviewSources: z.number().int().nonnegative(),
    exclusionReasons: z.array(z.string()),
  })
  .strict();

export const procurementDecisionRecordSchema = z
  .object({
    version: z.literal(1),
    item: z.string().trim().min(3).max(300),
    purpose: z.string().trim().min(3).max(2_000),
    market: z.string().trim().min(2).max(120),
    requiredBy: z.string().date().nullable(),
    currency: currencySchema,
    maxTotalCostMinor: z.number().int().positive().safe(),
    requirements: z.array(procurementRequirementSchema).min(1).max(25),
    summary: z.string().trim().min(1).max(8_000),
    rationale: z.string().trim().min(1).max(4_000),
    selectedCandidateId: idSchema.nullable(),
    candidates: z.array(procurementCandidateSchema).max(10),
    comparison: z.array(procurementCandidateResultSchema).max(10),
    bestValueCandidateId: idSchema.nullable(),
    recommendations: z.array(z.record(z.string(), z.unknown())).max(10),
  })
  .strict();

const generatedProcurementResearchOutputJsonSchema = z.toJSONSchema(
  procurementResearchOutputSchema,
);
delete generatedProcurementResearchOutputJsonSchema.$schema;
export const procurementResearchOutputJsonSchema = generatedProcurementResearchOutputJsonSchema;

export type ProcurementRequirement = z.infer<typeof procurementRequirementSchema>;
export type ProcurementLaunchRequest = z.infer<typeof procurementLaunchRequestSchema>;
export type ProcurementCandidate = z.infer<typeof procurementCandidateSchema>;
export type ProcurementDecisionInput = z.infer<typeof procurementDecisionInputSchema>;
export type ProcurementResearchOutput = z.infer<typeof procurementResearchOutputSchema>;
export type ProcurementDecisionRecord = z.infer<typeof procurementDecisionRecordSchema>;
