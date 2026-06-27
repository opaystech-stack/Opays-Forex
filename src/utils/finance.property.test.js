import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  roundHalfUp,
  computeExchangeRate,
  convertToUSD,
  computeProfitUSD,
  applyBalances,
} from './finance';

const RUNS = { numRuns: 100 };

// Devises non-USD utilisées par les générateurs.
const NON_USD = ['UGX', 'KES', 'TZS', 'BIF', 'CDF', 'EUR', 'FCFA'];

// Génère une table de taux pouvant contenir (ou non) la devise visée.
const ratesArb = fc.array(
  fc.record({
    currency: fc.constantFrom('USD', ...NON_USD),
    rate_to_usd: fc.double({ min: 0.0001, max: 100000, noNaN: true }),
  }),
  { maxLength: 8 }
);

describe('finance.js — propriétés (P1, P2, P3, P7, P4, P5, P6)', () => {
  // Feature: financial-ops-audit-voice-agent, Property 1: computeExchangeRate = dest/source arrondi à 6 décimales pour source > 0.
  it('P1 — calcule dest/source arrondi à 6 décimales quand source > 0', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.01, max: 1e9, noNaN: true }),
        fc.double({ min: 0, max: 1e9, noNaN: true }),
        (source, dest) => {
          const result = computeExchangeRate(source, dest);
          expect(result.ok).toBe(true);
          expect(result.rate).toBe(roundHalfUp(dest / source, 6));
        }
      ),
      RUNS
    );
  });

  // Feature: financial-ops-audit-voice-agent, Property 2: source <= 0 → computeExchangeRate signale une erreur sans taux ET applyBalances laisse les soldes inchangés.
  it('P2 — source <= 0 : erreur sans taux, et applyBalances ne modifie aucun solde', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -1e9, max: 0, noNaN: true }),
        fc.double({ min: 0.01, max: 1e9, noNaN: true }),
        fc.constantFrom('exchange', 'withdrawal'),
        fc.array(
          fc.record({
            id: fc.constantFrom('w1', 'w2', 'w3'),
            balance: fc.double({ min: 0, max: 1e6, noNaN: true }),
          }),
          { minLength: 1, maxLength: 3 }
        ),
        (source, dest, type, wallets) => {
          // Le taux n'est pas produit pour un montant source non positif.
          const rate = computeExchangeRate(source, dest);
          expect(rate.ok).toBe(false);
          expect(rate.rate).toBeUndefined();
          expect(typeof rate.error).toBe('string');

          // applyBalances rejette sans effet de bord (soldes inchangés).
          const txn = {
            status: 'completed',
            type,
            source_wallet_id: 'w1',
            dest_wallet_id: 'w2',
            source_amount: source,
            dest_amount: dest,
          };
          const before = wallets.map((w) => w.balance);
          const result = applyBalances(wallets, txn);
          expect(result.wallets.map((w) => w.balance)).toEqual(before);
        }
      ),
      RUNS
    );
  });

  // Feature: financial-ops-audit-voice-agent, Property 3: convertToUSD = montant / rate_to_usd (arrondi 2 déc. avec round:true) pour devise non-USD à taux > 0 ; taux nul/négatif/absent → 0.
  it('P3 — divise par le taux (arrondi 2 déc.) pour devise non-USD à taux > 0', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -1e9, max: 1e9, noNaN: true }),
        fc.constantFrom(...NON_USD),
        fc.double({ min: 0.0001, max: 100000, noNaN: true }),
        (amount, currency, rate) => {
          const got = convertToUSD(amount, currency, [{ currency, rate_to_usd: rate }], { round: true });
          expect(got).toBe(roundHalfUp(amount / rate, 2));
        }
      ),
      RUNS
    );
  });

  it('P3 — devise non-USD à taux nul/négatif/absent → 0 (valeur neutre)', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -1e9, max: 1e9, noNaN: true }),
        fc.constantFrom(...NON_USD),
        fc.oneof(
          // taux absent
          fc.constant([]),
          // taux nul
          fc.constant(0),
          // taux négatif
          fc.double({ min: -100000, max: -0.0001, noNaN: true })
        ),
        (amount, currency, badRate) => {
          const rates = Array.isArray(badRate) ? [] : [{ currency, rate_to_usd: badRate }];
          expect(convertToUSD(amount, currency, rates, { round: true })).toBe(0);
        }
      ),
      RUNS
    );
  });

  // Feature: financial-ops-audit-voice-agent, Property 7: computeProfitUSD = valeurUSD(source) - valeurUSD(dest), arrondi 2 décimales.
  it('P7 — profit = valeurUSD(source) - valeurUSD(dest) arrondi à 2 décimales', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.01, max: 1e7, noNaN: true }),
        fc.constantFrom('USD', ...NON_USD),
        fc.double({ min: 0.01, max: 1e7, noNaN: true }),
        fc.constantFrom('USD', ...NON_USD),
        ratesArb,
        (sourceAmount, sourceCur, destAmount, destCur, rates) => {
          const sourceUSD = convertToUSD(sourceAmount, sourceCur, rates);
          const destUSD = convertToUSD(destAmount, destCur, rates);
          const expected = roundHalfUp(sourceUSD - destUSD, 2);
          expect(computeProfitUSD(sourceAmount, sourceCur, destAmount, destCur, rates)).toBe(expected);
        }
      ),
      RUNS
    );
  });

  // Feature: financial-ops-audit-voice-agent, Property 4: applyBalances mute exactement les bons portefeuilles selon exchange/deposit/withdrawal + débit frais si fee>0, arrondi 2 déc.
  it('P4 — mute exactement les portefeuilles attendus selon le type, frais inclus, arrondi 2 déc.', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('exchange', 'deposit', 'withdrawal'),
        fc.double({ min: 0.01, max: 1e6, noNaN: true }), // source_amount
        fc.double({ min: 0.01, max: 1e6, noNaN: true }), // dest_amount
        fc.double({ min: 2e6, max: 5e6, noNaN: true }),  // solde source (suffisant)
        fc.double({ min: 0, max: 1e6, noNaN: true }),    // solde dest
        fc.double({ min: 0, max: 1e6, noNaN: true }),    // solde fee
        fc.double({ min: 0, max: 1000, noNaN: true }),   // fee (0 = pas de frais)
        (type, sourceAmount, destAmount, b1, b2, b3, fee) => {
          // Portefeuilles distincts : w1 source, w2 dest, w3 frais.
          const wallets = [
            { id: 'w1', balance: b1 },
            { id: 'w2', balance: b2 },
            { id: 'w3', balance: b3 },
          ];
          const txn = {
            status: 'completed',
            type,
            source_wallet_id: 'w1',
            dest_wallet_id: 'w2',
            fee_wallet_id: 'w3',
            source_amount: sourceAmount,
            dest_amount: destAmount,
            fee,
          };

          const { wallets: out, error } = applyBalances(wallets, txn);
          expect(error).toBeUndefined();

          const w1 = out.find((w) => w.id === 'w1');
          const w2 = out.find((w) => w.id === 'w2');
          const w3 = out.find((w) => w.id === 'w3');

          const debitsSource = type === 'exchange' || type === 'withdrawal';
          const creditsDest = type === 'exchange' || type === 'deposit';

          expect(w1.balance).toBe(debitsSource ? roundHalfUp(b1 - sourceAmount, 2) : b1);
          expect(w2.balance).toBe(creditsDest ? roundHalfUp(b2 + destAmount, 2) : b2);
          expect(w3.balance).toBe(fee > 0 ? roundHalfUp(b3 - fee, 2) : b3);
        }
      ),
      RUNS
    );
  });

  // Feature: financial-ops-audit-voice-agent, Property 5: completed rendant le solde source < 0 → rejet, soldes inchangés, message.
  it('P5 — fonds insuffisants : rejet, soldes inchangés, message', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('exchange', 'withdrawal'),
        fc.double({ min: 0, max: 1000, noNaN: true }),     // solde source
        fc.double({ min: 0.01, max: 1e6, noNaN: true }),   // dépassement du solde
        fc.double({ min: 0.01, max: 1e6, noNaN: true }),   // dest_amount
        (type, sourceBalance, excess, destAmount) => {
          const sourceAmount = sourceBalance + excess; // strictement > solde
          const wallets = [
            { id: 'w1', balance: sourceBalance },
            { id: 'w2', balance: 1000 },
          ];
          const txn = {
            status: 'completed',
            type,
            source_wallet_id: 'w1',
            dest_wallet_id: 'w2',
            source_amount: sourceAmount,
            dest_amount: destAmount,
          };
          const before = wallets.map((w) => w.balance);
          const { wallets: out, error } = applyBalances(wallets, txn);

          expect(typeof error).toBe('string');
          expect(error.toLowerCase()).toContain('insuffisant');
          expect(out.map((w) => w.balance)).toEqual(before);
        }
      ),
      RUNS
    );
  });

  // Feature: financial-ops-audit-voice-agent, Property 6: draft → aucun solde modifié.
  it('P6 — une opération draft ne modifie aucun solde', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('exchange', 'deposit', 'withdrawal'),
        fc.double({ min: 0.01, max: 1e6, noNaN: true }),
        fc.double({ min: 0.01, max: 1e6, noNaN: true }),
        fc.double({ min: 0, max: 1000, noNaN: true }),
        fc.array(
          fc.record({
            id: fc.constantFrom('w1', 'w2', 'w3'),
            balance: fc.double({ min: 0, max: 1e6, noNaN: true }),
          }),
          { minLength: 1, maxLength: 3 }
        ),
        (type, sourceAmount, destAmount, fee, wallets) => {
          const txn = {
            status: 'draft',
            type,
            source_wallet_id: 'w1',
            dest_wallet_id: 'w2',
            fee_wallet_id: 'w3',
            source_amount: sourceAmount,
            dest_amount: destAmount,
            fee,
          };
          const before = wallets.map((w) => w.balance);
          const { wallets: out } = applyBalances(wallets, txn);
          expect(out.map((w) => w.balance)).toEqual(before);
        }
      ),
      RUNS
    );
  });
});
