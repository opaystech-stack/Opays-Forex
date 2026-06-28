import { describe, it, expect } from 'vitest';
import { recomputeTransactionAmounts } from './transactionCompute.js';

// Taux de référence : 1 USD = 3750 UGX.
const RATES = [{ currency: 'UGX', rate_to_usd: 3750 }];

describe('recomputeTransactionAmounts — recalcul serveur (R4/R5)', () => {
  it('échange : dérive dest_amount du montant source et du taux (service 0)', () => {
    const res = recomputeTransactionAmounts(
      { type: 'exchange', sourceAmount: 100, exchangeRate: 3650, sourceCurrency: 'USD', destCurrency: 'UGX' },
      RATES
    );
    expect(res.ok).toBe(true);
    expect(res.serviceAmount).toBe(0);
    expect(res.destAmount).toBe(365000); // 100 * 3650
    // profit = USD(source) - USD(dest) = 100 - 365000/3750 = 100 - 97.33 = 2.67
    expect(res.profitUsd).toBeCloseTo(2.67, 2);
  });

  it('ignore tout dest_amount/profit_usd fourni par le client (anti-falsification)', () => {
    const res = recomputeTransactionAmounts(
      {
        type: 'exchange',
        sourceAmount: 100,
        exchangeRate: 3650,
        sourceCurrency: 'USD',
        destCurrency: 'UGX',
        // valeurs malveillantes que le serveur doit IGNORER :
        destAmount: 999999,
        profitUsd: 999999,
      },
      RATES
    );
    expect(res.destAmount).toBe(365000);
    expect(res.profitUsd).toBeCloseTo(2.67, 2);
  });

  it('applique le taux de service en le retranchant de la source avant conversion', () => {
    const res = recomputeTransactionAmounts(
      { type: 'exchange', sourceAmount: 100, exchangeRate: 3650, serviceRate: 10, sourceCurrency: 'USD', destCurrency: 'UGX' },
      RATES
    );
    expect(res.serviceAmount).toBe(10); // 10% de 100
    expect(res.netSource).toBe(90);
    expect(res.destAmount).toBe(328500); // 90 * 3650
  });

  it('rejette un taux de change <= 0', () => {
    const res = recomputeTransactionAmounts(
      { type: 'exchange', sourceAmount: 100, exchangeRate: 0, sourceCurrency: 'USD', destCurrency: 'UGX' },
      RATES
    );
    expect(res.ok).toBe(false);
  });

  it('rejette un taux de service hors bornes (0..100)', () => {
    const res = recomputeTransactionAmounts(
      { type: 'exchange', sourceAmount: 100, exchangeRate: 3650, serviceRate: 150, sourceCurrency: 'USD', destCurrency: 'UGX' },
      RATES
    );
    expect(res.ok).toBe(false);
  });

  it('dépôt : pas de marge de change, profit = contre-valeur USD du service', () => {
    const res = recomputeTransactionAmounts(
      { type: 'deposit', sourceAmount: 3750, serviceRate: 0, sourceCurrency: 'UGX', destCurrency: 'UGX', destAmount: 3750 },
      RATES
    );
    expect(res.ok).toBe(true);
    expect(res.profitUsd).toBe(0);
    expect(res.destAmount).toBe(3750);
  });
});
