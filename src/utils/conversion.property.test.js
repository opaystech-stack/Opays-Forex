import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { convertToUSD } from './finance';

describe('convertToUSD — propriétés', () => {
  // Feature: saas-finalization, Property 4: Identité de conversion pour l'USD
  it('retourne le montant inchangé pour USD', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -1e9, max: 1e9, noNaN: true }),
        fc.array(fc.record({ currency: fc.constantFrom('UGX', 'EUR', 'KES'), rate_to_usd: fc.double({ min: 0.1, max: 1000, noNaN: true }) })),
        (amount, rates) => {
          expect(convertToUSD(amount, 'USD', rates)).toBe(amount);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: saas-finalization, Property 5: Conversion par division pour une devise avec taux
  it('divise par le taux pour une devise non-USD avec taux > 0', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -1e9, max: 1e9, noNaN: true }),
        fc.constantFrom('UGX', 'KES', 'TZS', 'BIF', 'CDF', 'EUR', 'FCFA'),
        fc.double({ min: 0.0001, max: 100000, noNaN: true }),
        (amount, cur, rate) => {
          const got = convertToUSD(amount, cur, [{ currency: cur, rate_to_usd: rate }]);
          expect(got).toBeCloseTo(amount / rate, 6);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: saas-finalization, Property 6: Conversion sûre en l'absence de taux exploitable
  it('retourne 0 si la devise non-USD n\'a pas de taux exploitable', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -1e9, max: 1e9, noNaN: true }),
        fc.constantFrom('UGX', 'KES', 'TZS', 'BIF', 'CDF', 'EUR', 'FCFA'),
        fc.boolean(),
        (amount, cur, zeroRate) => {
          const rates = zeroRate ? [{ currency: cur, rate_to_usd: 0 }] : [];
          expect(convertToUSD(amount, cur, rates)).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('convertToUSD — exemples devises ajoutées (R4.5)', () => {
  it('convertit EUR, TZS, BIF, CDF, FCFA via le taux', () => {
    const rates = [
      { currency: 'EUR', rate_to_usd: 0.92 },
      { currency: 'TZS', rate_to_usd: 2600 },
      { currency: 'BIF', rate_to_usd: 2850 },
      { currency: 'CDF', rate_to_usd: 2500 },
      { currency: 'FCFA', rate_to_usd: 600 },
    ];
    expect(convertToUSD(92, 'EUR', rates)).toBeCloseTo(100, 6);
    expect(convertToUSD(2600, 'TZS', rates)).toBeCloseTo(1, 6);
    expect(convertToUSD(28500, 'BIF', rates)).toBeCloseTo(10, 6);
    expect(convertToUSD(2500, 'CDF', rates)).toBeCloseTo(1, 6);
    expect(convertToUSD(6000, 'FCFA', rates)).toBeCloseTo(10, 6);
  });
});
