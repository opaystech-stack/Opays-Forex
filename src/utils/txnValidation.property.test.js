import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  validateAmount,
  ensureDistinctWallets,
  detectDuplicate,
  MIN_AMOUNT,
  MAX_AMOUNT,
} from './txnValidation';

describe('validateAmount — propriétés', () => {
  // Feature: financial-ops-audit-voice-agent, Property 9: Validation des montants d'opération
  // Tout montant absent / nul / négatif / non numérique / < 0,01 / > 999 999 999,99 est
  // rejeté en identifiant le champ ; tout montant de [0,01 ; 999 999 999,99] est accepté.

  it('rejette une valeur absente (null/undefined/chaîne vide) en identifiant le champ', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(null, undefined, '', '   ', '\t', '\n  '),
        fc.string({ minLength: 1, maxLength: 20 }),
        (value, field) => {
          const res = validateAmount(value, field);
          expect(res.ok).toBe(false);
          expect(res.field).toBe(field);
          expect(typeof res.error).toBe('string');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('rejette une valeur non numérique en identifiant le champ', () => {
    fc.assert(
      fc.property(
        // Chaînes non parseables en nombre fini, ou valeurs non finies.
        fc.oneof(
          fc
            .string({ minLength: 1, maxLength: 15 })
            .filter((s) => s.trim() !== '' && !Number.isFinite(Number(s))),
          fc.constantFrom(NaN, Infinity, -Infinity)
        ),
        fc.string({ minLength: 1, maxLength: 20 }),
        (value, field) => {
          const res = validateAmount(value, field);
          expect(res.ok).toBe(false);
          expect(res.field).toBe(field);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('rejette un montant nul, négatif ou strictement inférieur à 0,01', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -1e9, max: MIN_AMOUNT - 1e-6, noNaN: true, noDefaultInfinity: true }),
        fc.string({ minLength: 1, maxLength: 20 }),
        (value, field) => {
          const res = validateAmount(value, field);
          expect(res.ok).toBe(false);
          expect(res.field).toBe(field);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('rejette un montant strictement supérieur à 999 999 999,99', () => {
    fc.assert(
      fc.property(
        fc.double({ min: MAX_AMOUNT + 0.01, max: 1e15, noNaN: true, noDefaultInfinity: true }),
        fc.string({ minLength: 1, maxLength: 20 }),
        (value, field) => {
          const res = validateAmount(value, field);
          expect(res.ok).toBe(false);
          expect(res.field).toBe(field);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('accepte tout montant de l\'intervalle [0,01 ; 999 999 999,99]', () => {
    fc.assert(
      fc.property(
        fc.double({ min: MIN_AMOUNT, max: MAX_AMOUNT, noNaN: true, noDefaultInfinity: true }),
        fc.string({ minLength: 1, maxLength: 20 }),
        (value, field) => {
          const res = validateAmount(value, field);
          expect(res.ok).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('ensureDistinctWallets — propriétés', () => {
  // Feature: financial-ops-audit-voice-agent, Property 10: Portefeuilles source et destination distincts (exchange)
  // Un exchange avec source_wallet_id === dest_wallet_id est rejeté ; distinct → accepté.

  it('rejette un exchange dont les portefeuilles source et destination sont identiques', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 36 }),
        (walletId) => {
          const res = ensureDistinctWallets({
            type: 'exchange',
            source_wallet_id: walletId,
            dest_wallet_id: walletId,
          });
          expect(res.ok).toBe(false);
          expect(typeof res.error).toBe('string');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('accepte un exchange dont les portefeuilles source et destination sont distincts', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 36 }),
        fc.string({ minLength: 1, maxLength: 36 }),
        (source, dest) => {
          fc.pre(source !== dest);
          const res = ensureDistinctWallets({
            type: 'exchange',
            source_wallet_id: source,
            dest_wallet_id: dest,
          });
          expect(res.ok).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('detectDuplicate — propriétés', () => {
  // Feature: financial-ops-audit-voice-agent, Property 11: Détection de doublon par identifiant réseau
  // Pour un transaction_id non vide déjà présent : renvoie l'opération existante et suspend ;
  // pour un transaction_id absent : aucun doublon.

  // Génère un identifiant réseau non vide (au moins un caractère non blanc).
  const nonEmptyId = fc
    .string({ minLength: 1, maxLength: 20 })
    .filter((s) => s.trim() !== '');

  it('renvoie l\'opération existante et suspend pour un transaction_id non vide déjà présent', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ id: fc.string({ maxLength: 8 }) }), { maxLength: 10 }),
        nonEmptyId,
        fc.nat({ max: 10 }),
        (others, targetId, insertAt) => {
          // Construit une liste où exactement une opération porte targetId,
          // les autres portant des identifiants distincts de targetId.
          const ops = others.map((o, i) => ({
            ...o,
            transaction_id: `other-${i}-${o.id}`,
          }));
          const existingOp = { transaction_id: targetId, marker: 'TARGET' };
          const pos = Math.min(insertAt, ops.length);
          ops.splice(pos, 0, existingOp);

          const res = detectDuplicate(ops, targetId);
          expect(res.duplicate).toBe(true);
          expect(res.suspend).toBe(true);
          expect(res.existing).not.toBeNull();
          // L'opération renvoyée correspond bien à l'identifiant cible.
          expect(String(res.existing.transaction_id).trim()).toBe(targetId.trim());
        }
      ),
      { numRuns: 100 }
    );
  });

  it('ne signale aucun doublon pour un transaction_id absent de la liste', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ transaction_id: fc.string({ minLength: 1, maxLength: 10 }) }), {
          maxLength: 10,
        }),
        nonEmptyId,
        (existingOps, candidateId) => {
          // Garantit que candidateId n'est présent dans aucune opération existante.
          const ops = existingOps.filter(
            (op) => String(op.transaction_id).trim() !== candidateId.trim()
          );
          const res = detectDuplicate(ops, candidateId);
          expect(res.duplicate).toBe(false);
          expect(res.existing).toBeNull();
          expect(res.suspend).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('ne signale aucun doublon pour un identifiant vide ou absent', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ transaction_id: fc.string({ maxLength: 10 }) }), { maxLength: 10 }),
        fc.constantFrom(null, undefined, '', '   ', '\t'),
        (existingOps, emptyId) => {
          const res = detectDuplicate(existingOps, emptyId);
          expect(res.duplicate).toBe(false);
          expect(res.existing).toBeNull();
          expect(res.suspend).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });
});
