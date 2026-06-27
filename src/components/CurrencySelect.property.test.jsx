import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';
import { render, cleanup } from '@testing-library/react';
import CurrencySelect from './CurrencySelect';
import { SUPPORTED_CURRENCY_CODES } from '../utils/currencies';

// On neutralise le hook i18n pour rendre le composant isolément.
vi.mock('../i18n', () => ({
  useT: () => (key) => key,
}));

// Feature: saas-finalization, Property 1: Le sélecteur de devises dérive intégralement du registre
describe('CurrencySelect', () => {
  it('présente toutes les devises du registre, dans l\'ordre, aucune désactivée', () => {
    const ratesArb = fc.array(
      fc.record({
        currency: fc.constantFrom(...SUPPORTED_CURRENCY_CODES),
        rate_to_usd: fc.oneof(fc.constant(0), fc.double({ min: 0.1, max: 100000, noNaN: true })),
      }),
      { maxLength: 8 }
    );

    fc.assert(
      fc.property(ratesArb, (rates) => {
        cleanup();
        const { container } = render(
          <CurrencySelect value="USD" onChange={() => {}} rates={rates} />
        );
        const options = Array.from(container.querySelectorAll('option'));
        // Exactement les devises du registre, dans l'ordre
        expect(options.map((o) => o.value)).toEqual(SUPPORTED_CURRENCY_CODES);
        // Aucune option désactivée
        expect(options.every((o) => !o.disabled)).toBe(true);
      }),
      { numRuns: 100 }
    );
  });
});
