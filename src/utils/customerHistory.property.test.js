import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  sortCustomerOperations,
  countCustomerOperations,
  formatOperationRow,
} from './customerHistory';

// Réplique de la clé jour (heure locale) utilisée par sortCustomerOperations,
// pour vérifier indépendamment l'ordre de tri.
const pad2 = (v) => String(v).padStart(2, '0');
const pad4 = (v) => String(v).padStart(4, '0');
const dayKey = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${pad4(d.getFullYear())}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

// Arbitraire d'une date valide bornée à des années à 4 chiffres (2000–2099),
// pour que le format JJ/MM/AAAA reste sur exactement 4 chiffres d'année.
const validDateArb = fc.date({
  min: new Date('2000-01-01T00:00:00Z'),
  max: new Date('2099-12-31T23:59:59Z'),
  noInvalidDate: true,
});

// Arbitraire d'une opération avec une date valide et un montant exploitable.
const operationArb = fc.record({
  timestamp: validDateArb.map((d) => d.toISOString()),
  source_amount: fc.double({ min: 0, max: 1e9, noNaN: true, noDefaultInfinity: true }),
  type: fc.option(fc.constantFrom('exchange', 'deposit', 'withdrawal', '', '  '), {
    nil: undefined,
  }),
});

describe('customerHistory — propriétés', () => {
  // Feature: financial-ops-audit-voice-agent, Property 21: Formatage des lignes d'historique
  it("formatOperationRow produit une date JJ/MM/AAAA, un montant à 2 décimales et un type non vide", () => {
    fc.assert(
      fc.property(operationArb, (operation) => {
        const row = formatOperationRow(operation);

        // Date valide → exactement JJ/MM/AAAA (2/2/4 chiffres).
        expect(row.date).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);

        // Montant : exactement deux décimales.
        expect(row.amount).toMatch(/^-?\d+\.\d{2}$/);

        // Type : chaîne non vide.
        expect(typeof row.type).toBe('string');
        expect(row.type.length).toBeGreaterThan(0);
        expect(row.type.trim()).not.toBe('');
      }),
      { numRuns: 100 }
    );
  });

  // Feature: financial-ops-audit-voice-agent, Property 22: Comptage borné des opérations
  it("countCustomerOperations renvoie un entier dans [0, 999 999] égal au nombre d'opérations", () => {
    fc.assert(
      fc.property(fc.array(operationArb, { maxLength: 300 }), (operations) => {
        const count = countCustomerOperations(operations);

        expect(Number.isInteger(count)).toBe(true);
        expect(count).toBeGreaterThanOrEqual(0);
        expect(count).toBeLessThanOrEqual(999999);
        expect(count).toBe(operations.length);
      }),
      { numRuns: 100 }
    );
  });

  // Feature: financial-ops-audit-voice-agent, Property 24: Tri de l'historique par date décroissante
  it("sortCustomerOperations trie par date décroissante, départage par index décroissant, sans muter l'entrée", () => {
    // Petit pool de jours pour forcer des égalités de date (test du départage).
    const dayPool = ['2024-01-15', '2024-03-02', '2024-03-02', '2024-12-31', '2023-07-09'];
    const entryArb = fc.record({
      day: fc.constantFrom(...dayPool),
      hour: fc.integer({ min: 0, max: 23 }),
    });

    fc.assert(
      fc.property(fc.array(entryArb, { maxLength: 40 }), (entries) => {
        // Construit les opérations en marquant l'ordre d'enregistrement (_origIndex).
        const operations = entries.map((e, i) => ({
          timestamp: `${e.day}T${pad2(e.hour)}:00:00`,
          _origIndex: i,
        }));
        const snapshot = JSON.stringify(operations);

        const sorted = sortCustomerOperations(operations);

        // Ne mute pas l'entrée et conserve son ordre.
        expect(JSON.stringify(operations)).toBe(snapshot);
        // Même cardinalité, nouvelle liste.
        expect(sorted).not.toBe(operations);
        expect(sorted.length).toBe(operations.length);

        // Vérifie l'ordre : date décroissante, puis index d'enregistrement décroissant.
        for (let i = 0; i + 1 < sorted.length; i += 1) {
          const keyA = dayKey(sorted[i].timestamp);
          const keyB = dayKey(sorted[i + 1].timestamp);
          expect(keyA >= keyB).toBe(true);
          if (keyA === keyB) {
            expect(sorted[i]._origIndex).toBeGreaterThan(sorted[i + 1]._origIndex);
          }
        }
      }),
      { numRuns: 100 }
    );
  });
});
