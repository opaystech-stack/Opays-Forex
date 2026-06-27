import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { hasRate, SUPPORTED_CURRENCY_CODES } from './currencies';

// Feature: saas-finalization, Property 3: Détection cohérente d'un taux manquant sans perte de sélection
describe('hasRate', () => {
  it('vrai ssi USD ou taux non nul présent', () => {
    const codeArb = fc.constantFrom(...SUPPORTED_CURRENCY_CODES);
    const ratesArb = fc.array(
      fc.record({
        currency: fc.constantFrom(...SUPPORTED_CURRENCY_CODES),
        rate_to_usd: fc.oneof(fc.constant(0), fc.double({ min: 0.0001, max: 100000, noNaN: true })),
      }),
      { maxLength: 10 }
    );
    fc.assert(
      fc.property(codeArb, ratesArb, (code, rates) => {
        const entry = rates.find((r) => r.currency === code);
        const expected = code === 'USD' || (Boolean(entry) && Number(entry.rate_to_usd) !== 0);
        expect(hasRate(code, rates)).toBe(expected);
      }),
      { numRuns: 100 }
    );
  });
});
