import { describe, it, expect } from 'vitest';
import translations from '../i18n';
import { SUPPORTED_CURRENCY_CODES, SUPPORTED_CURRENCIES } from './currencies';

describe('registre des devises', () => {
  // _Requirements: 2.1_
  it('contient exactement les 9 devises supportées', () => {
    expect(SUPPORTED_CURRENCY_CODES).toEqual(['USD', 'EUR', 'UGX', 'KES', 'TZS', 'BIF', 'RWF', 'CDF', 'FCFA']);
  });

  // _Requirements: 2.4_ — le libellé FCFA précise la zone BCEAO/BEAC en FR et EN
  it('le libellé FCFA mentionne BCEAO et BEAC dans les deux langues', () => {
    for (const lang of ['fr', 'en']) {
      const label = translations[lang].currency.FCFA;
      expect(label).toMatch(/BCEAO/);
      expect(label).toMatch(/BEAC/);
    }
  });

  it('chaque entrée du registre a une clé de libellé', () => {
    for (const c of SUPPORTED_CURRENCIES) {
      expect(c.labelKey).toBe(`currency.${c.code}`);
    }
  });
});

// Feature: saas-finalization, Property 2: Chaque devise supportée possède un libellé dans les deux langues
import fc from 'fast-check';
describe('libellés de devises', () => {
  it('libellé défini, non vide et distinct de la clé brute (fr & en)', () => {
    const arb = fc.constantFrom(...SUPPORTED_CURRENCY_CODES);
    const langArb = fc.constantFrom('fr', 'en');
    fc.assert(
      fc.property(arb, langArb, (code, lang) => {
        const label = translations[lang].currency[code];
        expect(typeof label).toBe('string');
        expect(label.length).toBeGreaterThan(0);
        expect(label).not.toBe(`currency.${code}`);
      }),
      { numRuns: 100 }
    );
  });
});
