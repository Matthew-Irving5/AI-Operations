import { describe, expect, it } from 'vitest';
import {
  procurementResearchOutputJsonSchema,
  procurementResearchOutputSchema,
} from './procurement';

function at(root: unknown, path: readonly string[]): unknown {
  return path.reduce<unknown>((current, key) => {
    if (current === null || typeof current !== 'object') throw new Error('Invalid schema path');
    return (current as Record<string, unknown>)[key];
  }, root);
}

describe('Procurement output schema', () => {
  it('matches persisted v1 wire constraints while keeping runtime validation strict', () => {
    for (const field of [
      'itemPriceMinor',
      'deliveryMinor',
      'requiredAccessoriesMinor',
      'mandatoryFeesMinor',
    ]) {
      expect(
        at(procurementResearchOutputJsonSchema, [
          'properties',
          'candidates',
          'items',
          'properties',
          'offer',
          'properties',
          field,
          'anyOf',
          '0',
          'minimum',
        ]),
      ).toBe(-Number.MAX_SAFE_INTEGER);
    }
    expect(
      at(procurementResearchOutputJsonSchema, [
        'properties',
        'candidates',
        'items',
        'properties',
        'reviews',
        'items',
        'properties',
        'reviewCount',
        'anyOf',
        '0',
        'minimum',
      ]),
    ).toBe(-Number.MAX_SAFE_INTEGER);

    const dateTimePattern = at(procurementResearchOutputJsonSchema, [
      'properties',
      'candidates',
      'items',
      'properties',
      'offer',
      'properties',
      'observedAt',
      'anyOf',
      '0',
      'pattern',
    ]);
    expect(typeof dateTimePattern).toBe('string');
    if (typeof dateTimePattern !== 'string') throw new Error('Missing date-time pattern');
    expect(new RegExp(dateTimePattern).test('2026-11-06T12:27Z')).toBe(true);

    expect(
      procurementResearchOutputSchema.safeParse({
        summary: 'Candidate summary',
        rationale: 'Candidate rationale',
        candidates: [
          {
            id: 'charger_1',
            title: 'USB-C charger',
            productUrl: 'https://example.com/product',
            merchant: 'Example',
            offer: {
              currency: 'GBP',
              itemPriceMinor: -1,
              deliveryMinor: null,
              requiredAccessoriesMinor: null,
              mandatoryFeesMinor: null,
              priceType: 'historical',
              observedAt: null,
              sourceUrls: [],
            },
            assessments: [],
            reviews: [],
            warrantySummary: null,
            returnsSummary: null,
            warrantyAndReturnsSourceUrls: [],
            rationale: 'Supported by the source.',
          },
        ],
      }).success,
    ).toBe(false);
  });
});
