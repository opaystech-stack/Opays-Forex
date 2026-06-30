import { describe, expect, it } from 'vitest';
import {
  convertToUSD,
  calculateLoanRepaymentUSD,
  roundHalfUp,
  computeExchangeRate,
  computeProfitUSD,
  applyBalances,
  computeServiceAmount,
  computeOperationAmounts,
  trialRemainingDays,
  TRIAL_DURATION_DAYS,
} from './finance';

describe('finance helpers', () => {
  it('converts non-USD balances to USD using the daily rate', () => {
    expect(convertToUSD(375000, 'UGX', [{ currency: 'UGX', rate_to_usd: 3750 }])).toBeCloseTo(100, 4);
  });

  it('returns the original amount for USD balances', () => {
    expect(convertToUSD(100, 'USD', [])).toBe(100);
  });

  it('computes the full loan repayment amount including interest', () => {
    expect(calculateLoanRepaymentUSD(500, 'USD', 10, [{ currency: 'USD', rate_to_usd: 1 }])).toBe(550);
  });

  it('returns 0 (safe neutral) for a negative rate', () => {
    expect(convertToUSD(100, 'UGX', [{ currency: 'UGX', rate_to_usd: -3750 }])).toBe(0);
  });

  it('rounds the USD value to 2 decimals when the round option is set', () => {
    expect(convertToUSD(100, 'UGX', [{ currency: 'UGX', rate_to_usd: 3 }], { round: true })).toBe(33.33);
  });
});

describe('roundHalfUp', () => {
  it('rounds halves up toward +∞', () => {
    expect(roundHalfUp(2.5, 0)).toBe(3);
    expect(roundHalfUp(0.5, 0)).toBe(1);
    expect(roundHalfUp(-2.5, 0)).toBe(-2);
  });

  it('corrects binary representation errors', () => {
    expect(roundHalfUp(1.005, 2)).toBe(1.01);
    expect(roundHalfUp(0.1 + 0.2, 2)).toBe(0.3);
  });

  it('supports 6-decimal precision and non-finite input', () => {
    expect(roundHalfUp(0.1234565, 6)).toBe(0.123457);
    expect(roundHalfUp(NaN, 2)).toBe(0);
  });
});

describe('computeExchangeRate', () => {
  it('returns dest/source rounded to 6 decimals for a positive source', () => {
    expect(computeExchangeRate(100, 365000)).toEqual({ ok: true, rate: 3650 });
    expect(computeExchangeRate(3, 1).rate).toBe(0.333333);
  });

  it('signals an error and produces no rate for a non-positive source', () => {
    const zero = computeExchangeRate(0, 1000);
    expect(zero.ok).toBe(false);
    expect(zero.rate).toBeUndefined();
    expect(computeExchangeRate(-5, 1000).ok).toBe(false);
  });
});

describe('computeProfitUSD', () => {
  it('computes source USD minus dest USD rounded to 2 decimals', () => {
    const rates = [{ currency: 'UGX', rate_to_usd: 3750 }];
    // 150 USD - 550000/3750 USD = 150 - 146.6667 = 3.33
    expect(computeProfitUSD(150, 'USD', 550000, 'UGX', rates)).toBe(3.33);
  });

  it('treats a missing rate as a neutral 0 contribution', () => {
    expect(computeProfitUSD(100, 'USD', 100, 'XOF', [])).toBe(100);
  });
});

describe('applyBalances', () => {
  const wallets = [
    { id: 'w1', currency: 'USD', balance: 1000 },
    { id: 'w2', currency: 'UGX', balance: 2000000 },
    { id: 'w3', currency: 'USD', balance: 500 },
  ];

  it('debits source and credits destination for an exchange', () => {
    const { wallets: result, error } = applyBalances(wallets, {
      type: 'exchange',
      status: 'completed',
      source_wallet_id: 'w1',
      dest_wallet_id: 'w2',
      source_amount: 100,
      dest_amount: 365000,
    });
    expect(error).toBeUndefined();
    expect(result.find((w) => w.id === 'w1').balance).toBe(900);
    expect(result.find((w) => w.id === 'w2').balance).toBe(2365000);
    expect(result.find((w) => w.id === 'w3').balance).toBe(500);
  });

  it('credits only the destination for a deposit', () => {
    const { wallets: result } = applyBalances(wallets, {
      type: 'deposit', status: 'completed', dest_wallet_id: 'w1', dest_amount: 250,
    });
    expect(result.find((w) => w.id === 'w1').balance).toBe(1250);
  });

  it('debits only the source for a withdrawal', () => {
    const { wallets: result } = applyBalances(wallets, {
      type: 'withdrawal', status: 'completed', source_wallet_id: 'w1', source_amount: 300,
    });
    expect(result.find((w) => w.id === 'w1').balance).toBe(700);
  });

  it('debits the fee wallet when fee > 0', () => {
    const { wallets: result } = applyBalances(wallets, {
      type: 'exchange', status: 'completed',
      source_wallet_id: 'w1', dest_wallet_id: 'w2',
      source_amount: 100, dest_amount: 365000,
      fee: 5, fee_wallet_id: 'w3',
    });
    expect(result.find((w) => w.id === 'w3').balance).toBe(495);
  });

  it('rejects without side effect when source funds are insufficient', () => {
    const { wallets: result, error } = applyBalances(wallets, {
      type: 'withdrawal', status: 'completed', source_wallet_id: 'w1', source_amount: 5000,
    });
    expect(error).toBeTruthy();
    expect(result).toBe(wallets);
  });

  it('leaves all balances unchanged for a draft', () => {
    const { wallets: result, error } = applyBalances(wallets, {
      type: 'exchange', status: 'draft',
      source_wallet_id: 'w1', dest_wallet_id: 'w2', source_amount: 100, dest_amount: 365000,
    });
    expect(error).toBeUndefined();
    expect(result).toBe(wallets);
  });

  it('rejects a non-positive source amount without mutating balances', () => {
    const { wallets: result, error } = applyBalances(wallets, {
      type: 'exchange', status: 'completed',
      source_wallet_id: 'w1', dest_wallet_id: 'w2', source_amount: 0, dest_amount: 365000,
    });
    expect(error).toBeTruthy();
    expect(result).toBe(wallets);
  });

  it('rounds resulting balances to 2 decimals', () => {
    const { wallets: result } = applyBalances([{ id: 'w1', balance: 100 }], {
      type: 'deposit', status: 'completed', dest_wallet_id: 'w1', dest_amount: 0.005,
    });
    expect(result.find((w) => w.id === 'w1').balance).toBe(100.01);
  });
});

describe('computeServiceAmount', () => {
  it('computes the service amount and net source preserving the sum', () => {
    const { ok, montantService, netSource } = computeServiceAmount(1000, 2.5);
    expect(ok).toBe(true);
    expect(montantService).toBe(25);
    expect(netSource).toBe(975);
    expect(roundHalfUp(montantService + netSource, 2)).toBe(1000);
  });

  it('rounds the service amount to 2 decimals', () => {
    const { montantService } = computeServiceAmount(1234.5, 1.5);
    expect(montantService).toBe(18.52); // 18.5175 -> 18.52
  });

  it('is a strict no-op at serviceRate = 0', () => {
    expect(computeServiceAmount(1000, 0)).toEqual({ ok: true, montantService: 0, netSource: 1000 });
  });

  it('accepts the boundary rates 0 and 100', () => {
    expect(computeServiceAmount(500, 100)).toEqual({ ok: true, montantService: 500, netSource: 0 });
  });

  it('rejects a rate below 0, above 100 or non-numeric without producing amounts', () => {
    expect(computeServiceAmount(1000, -1).ok).toBe(false);
    expect(computeServiceAmount(1000, 100.01).ok).toBe(false);
    expect(computeServiceAmount(1000, 'abc').ok).toBe(false);
    expect(computeServiceAmount(1000, -1).montantService).toBeUndefined();
  });
});

describe('computeOperationAmounts', () => {
  it('is equivalent to the legacy flow when serviceRate = 0 (no-op, non-regression)', () => {
    const result = computeOperationAmounts({ sourceAmount: 100, exchangeRate: 3650, serviceRate: 0 });
    expect(result).toEqual({
      ok: true,
      montantService: 0,
      netSource: 100,
      destAmount: roundHalfUp(100 * 3650, 2),
    });
  });

  it('defaults serviceRate to 0 when omitted (module désactivé)', () => {
    const result = computeOperationAmounts({ sourceAmount: 100, exchangeRate: 3650 });
    expect(result.montantService).toBe(0);
    expect(result.netSource).toBe(100);
    expect(result.destAmount).toBe(roundHalfUp(100 * 3650, 2));
  });

  it('deducts the service amount from the source before conversion', () => {
    const result = computeOperationAmounts({ sourceAmount: 1000, exchangeRate: 3.5, serviceRate: 2 });
    expect(result.montantService).toBe(20);
    expect(result.netSource).toBe(980);
    expect(result.destAmount).toBe(roundHalfUp(980 * 3.5, 2));
  });

  it('honors the destination currency decimals', () => {
    const result = computeOperationAmounts({ sourceAmount: 100, exchangeRate: 0.123456, serviceRate: 0, destDecimals: 6 });
    expect(result.destAmount).toBe(roundHalfUp(100 * 0.123456, 6));
  });

  it('rejects a non-positive or non-numeric exchange rate', () => {
    expect(computeOperationAmounts({ sourceAmount: 100, exchangeRate: 0, serviceRate: 0 }).ok).toBe(false);
    expect(computeOperationAmounts({ sourceAmount: 100, exchangeRate: -5, serviceRate: 0 }).ok).toBe(false);
    expect(computeOperationAmounts({ sourceAmount: 100, exchangeRate: 'x', serviceRate: 0 }).ok).toBe(false);
  });

  it('propagates the service rate guard error', () => {
    const result = computeOperationAmounts({ sourceAmount: 100, exchangeRate: 3650, serviceRate: 150 });
    expect(result.ok).toBe(false);
    expect(result.destAmount).toBeUndefined();
  });
});

describe('trialRemainingDays (présentation de l\'essai 30 jours)', () => {
  const NOW = Date.parse('2024-06-15T12:00:00.000Z');
  const DAY = 24 * 60 * 60 * 1000;

  it('expose une durée d\'essai par défaut de 30 jours', () => {
    expect(TRIAL_DURATION_DAYS).toBe(30);
  });

  it('calcule les jours restants à partir de createdAt (essai actif)', () => {
    const createdAt = new Date(NOW - 10 * DAY).toISOString();
    const res = trialRemainingDays({ createdAt }, NOW);
    expect(res.active).toBe(true);
    expect(res.remainingDays).toBe(20); // 30 - 10
  });

  it('borne les jours restants à 0 une fois l\'essai expiré', () => {
    const createdAt = new Date(NOW - 45 * DAY).toISOString();
    const res = trialRemainingDays({ createdAt }, NOW);
    expect(res.active).toBe(false);
    expect(res.remainingDays).toBe(0);
  });

  it('au jour 30 pile, l\'essai n\'est plus actif (0 jour restant)', () => {
    const createdAt = new Date(NOW - 30 * DAY).toISOString();
    const res = trialRemainingDays({ createdAt }, NOW);
    expect(res.active).toBe(false);
    expect(res.remainingDays).toBe(0);
  });

  it('priorise trialEndsAt fourni par le serveur', () => {
    const trialEndsAt = new Date(NOW + 5 * DAY).toISOString();
    const res = trialRemainingDays({ createdAt: new Date(NOW - 100 * DAY).toISOString(), trialEndsAt }, NOW);
    expect(res.active).toBe(true);
    expect(res.remainingDays).toBe(5);
    expect(res.endsAt).toBe(trialEndsAt);
  });

  it('retourne un état inactif pour une entrée absente ou invalide', () => {
    expect(trialRemainingDays({}, NOW)).toEqual({ active: false, remainingDays: 0, endsAt: null });
    expect(trialRemainingDays({ createdAt: 'pas-une-date' }, NOW)).toEqual({ active: false, remainingDays: 0, endsAt: null });
  });
});
