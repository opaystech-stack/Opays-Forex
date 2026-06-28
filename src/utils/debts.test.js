import { describe, it, expect } from 'vitest';
import { computeDebtTotals } from './debts';

const RATES = [
  { currency: 'UGX', rate_to_usd: 3750 },
  { currency: 'EUR', rate_to_usd: 0.92 },
];

describe('computeDebtTotals', () => {
  it('somme créances et dettes en attente, converties en USD', () => {
    const debts = [
      { type: 'receivable', amount: 100, currency: 'USD', status: 'pending' },
      { type: 'receivable', amount: 3750, currency: 'UGX', status: 'pending' }, // = 1 USD
      { type: 'payable', amount: 0.92, currency: 'EUR', status: 'pending' }, // = 1 USD
    ];
    const { receivableUSD, payableUSD } = computeDebtTotals(debts, RATES);
    expect(receivableUSD).toBeCloseTo(101, 6);
    expect(payableUSD).toBeCloseTo(1, 6);
  });

  it('exclut les dettes réglées (settled)', () => {
    const debts = [
      { type: 'receivable', amount: 50, currency: 'USD', status: 'settled' },
      { type: 'receivable', amount: 20, currency: 'USD', status: 'pending' },
    ];
    expect(computeDebtTotals(debts, RATES).receivableUSD).toBe(20);
  });

  it('contribue 0 pour une devise sans taux exploitable', () => {
    const debts = [{ type: 'payable', amount: 1000, currency: 'XYZ', status: 'pending' }];
    expect(computeDebtTotals(debts, RATES).payableUSD).toBe(0);
  });

  it('tolère des entrées vides/non tableau', () => {
    expect(computeDebtTotals(null, null)).toEqual({ receivableUSD: 0, payableUSD: 0 });
    expect(computeDebtTotals([], [])).toEqual({ receivableUSD: 0, payableUSD: 0 });
  });
});
