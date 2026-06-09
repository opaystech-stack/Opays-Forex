import { describe, expect, it } from 'vitest';
import { convertToUSD, calculateLoanRepaymentUSD } from './finance';

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
});
