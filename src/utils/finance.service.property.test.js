import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  roundHalfUp,
  computeServiceAmount,
  computeOperationAmounts,
  sumDailyProfit,
} from './finance';

const RUNS = { numRuns: 100 };

describe('finance.js — propriétés du taux de service (P12, P13, P14, P16)', () => {
  // Feature: agency-operations-expansion, Property 12: Invariant du montant de service (somme conservée) — montantService = roundHalfUp(source × taux / 100, 2), montantService + netSource = source (à 2 décimales), et netSource est la base de la conversion.
  it('P12 — montant de service arrondi et somme (montantService + netSource) conservée', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.01, max: 1e7, noNaN: true }), // montant source positif
        fc.double({ min: 0, max: 100, noNaN: true }),     // Taux_Service dans [0, 100]
        fc.double({ min: 0.0001, max: 1e6, noNaN: true }), // Taux_Change valide
        (source, rate, exchangeRate) => {
          const { ok, montantService, netSource } = computeServiceAmount(source, rate);
          expect(ok).toBe(true);

          // montantService = roundHalfUp(source × taux / 100, 2).
          expect(montantService).toBe(roundHalfUp((source * rate) / 100, 2));

          // La somme est conservée à la précision de 2 décimales.
          expect(roundHalfUp(montantService + netSource, 2)).toBe(roundHalfUp(source, 2));

          // netSource est la base de la conversion au Taux_Change.
          const op = computeOperationAmounts({ sourceAmount: source, exchangeRate, serviceRate: rate });
          expect(op.ok).toBe(true);
          expect(op.netSource).toBe(netSource);
          expect(op.destAmount).toBe(roundHalfUp(netSource * exchangeRate, 2));
        }
      ),
      RUNS
    );
  });

  // Feature: agency-operations-expansion, Property 13: No-op du taux de service à 0 (non-régression) — computeOperationAmounts avec serviceRate = 0 retourne montantService = 0, netSource = source et destAmount = roundHalfUp(source × exchangeRate, …), soit exactement le flux sans taux de service.
  it('P13 — serviceRate = 0 équivaut exactement au flux d’opération sans taux de service', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1e9, noNaN: true }),      // montant source quelconque
        fc.double({ min: 0.0001, max: 1e6, noNaN: true }), // Taux_Change valide
        fc.integer({ min: 0, max: 8 }),                    // décimales devise destination
        (source, exchangeRate, destDecimals) => {
          const result = computeOperationAmounts({
            sourceAmount: source,
            exchangeRate,
            serviceRate: 0,
            destDecimals,
          });
          expect(result).toEqual({
            ok: true,
            montantService: 0,
            netSource: source,
            destAmount: roundHalfUp(source * exchangeRate, destDecimals),
          });

          // Omettre serviceRate revient au même no-op (module taux_service désactivé).
          const omitted = computeOperationAmounts({ sourceAmount: source, exchangeRate, destDecimals });
          expect(omitted).toEqual(result);
        }
      ),
      RUNS
    );
  });

  // Feature: agency-operations-expansion, Property 14: Validation des taux — Taux_Change <= 0 ou non numérique refuse l'opération sans création ; Taux_Service < 0 ou > 100 signale une erreur sans montant ni opération.
  it('P14 — taux de change non positif et taux de service hors [0,100] sont refusés sans effet', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.01, max: 1e7, noNaN: true }), // montant source
        fc.oneof(
          fc.double({ min: -1e6, max: 0, noNaN: true }), // Taux_Change <= 0
          fc.constant(Number.NaN),                       // non numérique
          fc.constant('abc')                             // non numérique
        ),
        fc.oneof(
          fc.double({ min: -1e6, max: -0.0001, noNaN: true }), // Taux_Service < 0
          fc.double({ min: 100.0001, max: 1e6, noNaN: true }), // Taux_Service > 100
          fc.constant('xyz')                                   // non numérique
        ),
        (source, badExchangeRate, badServiceRate) => {
          // Taux_Change invalide : aucune opération produite.
          const op = computeOperationAmounts({
            sourceAmount: source,
            exchangeRate: badExchangeRate,
            serviceRate: 0,
          });
          expect(op.ok).toBe(false);
          expect(op.destAmount).toBeUndefined();
          expect(typeof op.error).toBe('string');

          // Taux_Service invalide : erreur signalée, aucun montant produit.
          const svc = computeServiceAmount(source, badServiceRate);
          expect(svc.ok).toBe(false);
          expect(svc.montantService).toBeUndefined();
          expect(svc.netSource).toBeUndefined();
          expect(typeof svc.error).toBe('string');

          // Un taux de service invalide propagé fait également échouer l'opération.
          const opSvc = computeOperationAmounts({
            sourceAmount: source,
            exchangeRate: 3.5,
            serviceRate: badServiceRate,
          });
          expect(opSvc.ok).toBe(false);
          expect(opSvc.destAmount).toBeUndefined();
        }
      ),
      RUNS
    );
  });

  // Feature: agency-operations-expansion, Property 16: Commissions incluses dans le bénéfice — le bénéfice agrégé inclut la somme des commissions ; retirer ou ajouter une opération modifie le bénéfice exactement de la commission correspondante.
  it('P16 — le bénéfice agrégé est la somme des commissions et varie exactement de la commission retirée', () => {
    const DATE = '2024-01-15';
    // Une opération (transfert ou abonnement) dont la commission est comptée en bénéfice (profit_usd).
    const operationArb = fc.record({
      commission: fc.double({ min: 0, max: 1e6, noNaN: true }),
      hour: fc.integer({ min: 0, max: 23 }),
    });

    fc.assert(
      fc.property(
        fc.array(operationArb, { minLength: 1, maxLength: 30 }),
        fc.nat(),
        (ops, removeSeed) => {
          // Chaque commission est portée par une opération complétée du jour DATE.
          const operations = ops.map((op, i) => ({
            id: `op-${i}`,
            status: 'completed',
            timestamp: `${DATE}T${String(op.hour).padStart(2, '0')}:30:00`,
            profit_usd: op.commission,
          }));

          const totalCommissions = operations.reduce((acc, o) => acc + o.profit_usd, 0);
          const benefit = sumDailyProfit(operations, DATE);

          // Le bénéfice agrégé inclut la somme des commissions.
          expect(benefit).toBeCloseTo(totalCommissions, 6);

          // Retirer une opération diminue le bénéfice exactement de sa commission.
          const idx = removeSeed % operations.length;
          const removed = operations[idx];
          const without = operations.filter((_, i) => i !== idx);
          const benefitWithout = sumDailyProfit(without, DATE);
          expect(benefit - benefitWithout).toBeCloseTo(removed.profit_usd, 6);
        }
      ),
      RUNS
    );
  });
});
