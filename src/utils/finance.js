export const convertToUSD = (amount, currency, rates = []) => {
  const numericAmount = Number(amount) || 0;
  if (currency === 'USD') return numericAmount;

  const rate = rates.find((entry) => entry.currency === currency);
  if (!rate || Number(rate.rate_to_usd) === 0) return 0;

  return numericAmount / Number(rate.rate_to_usd);
};

export const calculateLoanRepaymentUSD = (amount, currency, interestRate, rates = []) => {
  const baseAmountUSD = convertToUSD(amount, currency, rates);
  const interest = Number(interestRate) || 0;
  return baseAmountUSD * (1 + interest / 100);
};
