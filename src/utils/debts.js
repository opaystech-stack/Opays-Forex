// Logique PURE du registre des dettes/créances (réutilisée par AppContext et
// testable isolément). Aucun effet de bord, aucun appel réseau.

import { convertToUSD } from './finance';

// Totaux séparés des créances (receivable) et dettes (payable) EN ATTENTE,
// convertis en USD via les taux fournis. Les dettes réglées ('settled') sont
// exclues. Une devise sans taux exploitable contribue 0 (cf. convertToUSD).
export function computeDebtTotals(debts = [], rates = []) {
  const pending = (Array.isArray(debts) ? debts : []).filter((d) => d && d.status === 'pending');
  const sumByType = (type) =>
    pending
      .filter((d) => d.type === type)
      .reduce((acc, d) => acc + convertToUSD(d.amount, d.currency, rates), 0);
  return {
    receivableUSD: sumByType('receivable'),
    payableUSD: sumByType('payable'),
  };
}
