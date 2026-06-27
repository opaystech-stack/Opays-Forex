import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { validateTransfer } from './transferValidation';
import { TRANSFER_METHOD_OTHER } from './catalogs';

const RUNS = { numRuns: 100 };

// Prédicat de référence reflétant la sémantique attendue de validateTransfer
// (Property 15) : accepte SSI le montant est strictement positif ET une
// Methode_Transfert active est référencée ET (si la méthode est « Autre ») un
// libellé personnalisé de 1 à 60 caractères est fourni.
const expectedValid = ({ amount, methodId, methodLabel, methodActive, customLabel }) => {
  const methodPresent =
    methodId !== null &&
    methodId !== undefined &&
    !(typeof methodId === 'string' && methodId.trim() === '');
  const methodOk = methodPresent && methodActive === true;

  const amountPresent =
    amount !== null &&
    amount !== undefined &&
    !(typeof amount === 'string' && amount.trim() === '');
  const amountNum = Number(amount);
  const amountOk = amountPresent && Number.isFinite(amountNum) && amountNum > 0;

  const isOther =
    String(methodLabel).trim().toLowerCase() ===
    String(TRANSFER_METHOD_OTHER).trim().toLowerCase();
  const labelOk =
    !isOther ||
    (typeof customLabel === 'string' &&
      customLabel.trim().length >= 1 &&
      customLabel.trim().length <= 60);

  return methodOk && amountOk && labelOk;
};

describe('transferValidation.js — Property 15: Validation d’une opération de transfert', () => {
  // Feature: agency-operations-expansion, Property 15: Validation d'une opération de transfert — validateTransfer accepte SSI montant > 0 ET méthode active référencée ET (si « Autre ») libellé personnalisé 1..60 ; tout autre cas est rejeté en identifiant le champ invalide.
  // Validates: Requirements 8.2, 8.3, 8.4, 8.5
  it('accepte une saisie SSI montant > 0, méthode active référencée et libellé « Autre » 1..60', () => {
    const methodIdArb = fc.oneof(
      fc.string({ minLength: 1, maxLength: 12 }).map((s) => `id-${s}`),
      fc.constant(null),
      fc.constant(undefined),
      fc.constant(''),
      fc.constant('   ')
    );
    const methodActiveArb = fc.oneof(
      fc.constant(true),
      fc.constant(false),
      fc.constant(undefined)
    );
    const amountArb = fc.oneof(
      fc.double({ min: 0.0001, max: 1e7, noNaN: true }), // strictement positif
      fc.double({ min: -1e6, max: 0, noNaN: true }), // <= 0
      fc.constant(0),
      fc.constant(null),
      fc.constant(''),
      fc.constant('   '),
      fc.integer({ min: 1, max: 1000 }).map((n) => String(n)) // numérique en chaîne
    );
    const methodLabelArb = fc.constantFrom(
      'Autre',
      'autre',
      '  Autre  ',
      'Wave',
      'Orange Money',
      'MTN'
    );
    const customLabelArb = fc.oneof(
      fc.string({ minLength: 1, maxLength: 60 }).map((s) => `L${s}`.slice(0, 60)),
      fc.constant(''),
      fc.constant('   '),
      fc.string({ minLength: 61, maxLength: 80 }),
      fc.constant(null),
      fc.constant(undefined)
    );

    fc.assert(
      fc.property(
        fc.record({
          amount: amountArb,
          methodId: methodIdArb,
          methodActive: methodActiveArb,
          methodLabel: methodLabelArb,
          customLabel: customLabelArb,
        }),
        (input) => {
          const result = validateTransfer(input);
          expect(result.ok).toBe(expectedValid(input));
          // Tout rejet identifie le champ invalide.
          if (!result.ok) {
            expect(['methode', 'montant', 'libelle']).toContain(result.field);
            expect(typeof result.error).toBe('string');
          }
        }
      ),
      RUNS
    );
  });

  // Cas valides garantis : une saisie pleinement conforme est toujours acceptée.
  it('accepte toute saisie pleinement conforme (méthode non « Autre »)', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.0001, max: 1e9, noNaN: true }),
        fc.string({ minLength: 1, maxLength: 10 }),
        fc.constantFrom('Wave', 'Orange Money', 'MTN', 'Moov'),
        (amount, idSuffix, methodLabel) => {
          const result = validateTransfer({
            amount,
            methodId: `id-${idSuffix}`,
            methodActive: true,
            methodLabel,
            customLabel: undefined,
          });
          expect(result).toEqual({ ok: true });
        }
      ),
      RUNS
    );
  });
});
