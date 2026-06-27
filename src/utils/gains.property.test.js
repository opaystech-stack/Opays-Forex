import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { sumDailyProfit, sumMonthlyProfit } from './finance';

// Génère une transaction avec statut, horodatage et profit arbitraires.
const txnArb = fc.record({
  status: fc.constantFrom('completed', 'draft'),
  profit_usd: fc.double({ min: -1000, max: 1000, noNaN: true }),
  timestamp: fc
    .date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') })
    .map((d) => d.toISOString()),
});

describe('suivi des gains — propriétés', () => {
  // Feature: saas-finalization, Property 12: Gain journalier = somme des profits complétés du jour
  it('gain journalier = somme des profit_usd complétés du jour', () => {
    fc.assert(
      fc.property(fc.array(txnArb, { maxLength: 30 }), (txns) => {
        const day = '2025-06-11';
        const expected = txns
          .filter((t) => t.status === 'completed' && t.timestamp.startsWith(day))
          .reduce((a, t) => a + t.profit_usd, 0);
        expect(sumDailyProfit(txns, day)).toBeCloseTo(expected, 6);
      }),
      { numRuns: 100 }
    );
  });

  // Feature: saas-finalization, Property 13: Gain mensuel = somme des profits complétés du mois
  it('gain mensuel = somme des profit_usd complétés du mois', () => {
    fc.assert(
      fc.property(fc.array(txnArb, { maxLength: 30 }), (txns) => {
        const month = '2025-06';
        const expected = txns
          .filter((t) => t.status === 'completed' && t.timestamp.startsWith(month))
          .reduce((a, t) => a + t.profit_usd, 0);
        expect(sumMonthlyProfit(txns, month)).toBeCloseTo(expected, 6);
      }),
      { numRuns: 100 }
    );
  });

  // Feature: saas-finalization, Property 14: Les brouillons n'influencent jamais les gains
  it('ajouter des brouillons ne change pas les gains', () => {
    const draftArb = fc.record({
      status: fc.constant('draft'),
      profit_usd: fc.double({ min: -1000, max: 1000, noNaN: true }),
      timestamp: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }).map((d) => d.toISOString()),
    });
    fc.assert(
      fc.property(fc.array(txnArb, { maxLength: 20 }), fc.array(draftArb, { maxLength: 20 }), (base, drafts) => {
        const day = '2025-06-11';
        const month = '2025-06';
        expect(sumDailyProfit([...base, ...drafts], day)).toBeCloseTo(sumDailyProfit(base, day), 6);
        expect(sumMonthlyProfit([...base, ...drafts], month)).toBeCloseTo(sumMonthlyProfit(base, month), 6);
      }),
      { numRuns: 100 }
    );
  });

  // _Requirements: 9.6_ — aucune transaction correspondante => 0
  it('retourne 0 si aucune transaction ne correspond', () => {
    expect(sumDailyProfit([], '2025-06-11')).toBe(0);
    expect(sumMonthlyProfit([], '2025-06')).toBe(0);
  });
});
