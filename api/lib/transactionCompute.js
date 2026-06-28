// Recalcul SERVEUR des grandeurs financières d'une opération (R4/R5).
//
// Logique PURE, sans dépendance externe : réutilise les formules de référence
// de `src/utils/finance.js` (source unique de vérité, partagée front/serveur).
// Le serveur NE fait JAMAIS confiance aux montants envoyés par le client :
// il recalcule `dest_amount`, `service_amount`, `exchange_rate` et `profit_usd`
// à partir des entrées de l'opérateur (montant source, taux de change, taux de
// service) et des taux de référence de l'agence.

import {
  computeOperationAmounts,
  computeProfitUSD,
  computeServiceAmount,
  convertToUSD,
  roundHalfUp,
} from '../../src/utils/finance.js';

// input : {
//   type, sourceAmount, destAmount?, exchangeRate, serviceRate?,
//   sourceCurrency, destCurrency, destDecimals?
// }
// rates : [{ currency, rate_to_usd }]
//
// Retourne { ok:true, serviceAmount, netSource, destAmount, exchangeRate,
// profitUsd } ou { ok:false, error }.
export function recomputeTransactionAmounts(input = {}, rates = []) {
  const {
    type = 'exchange',
    sourceAmount,
    destAmount: clientDest,
    exchangeRate,
    serviceRate = 0,
    sourceCurrency,
    destCurrency,
    destDecimals = 2,
  } = input;

  if (type === 'exchange') {
    // Le couple (montant source, taux de change, taux de service) fait foi ;
    // dest_amount et profit_usd sont DÉRIVÉS, jamais lus depuis le client.
    const op = computeOperationAmounts({ sourceAmount, exchangeRate, serviceRate, destDecimals });
    if (!op.ok) return { ok: false, error: op.error };

    const destAmount = op.destAmount;
    const profitUsd = computeProfitUSD(sourceAmount, sourceCurrency, destAmount, destCurrency, rates);

    return {
      ok: true,
      type,
      serviceAmount: op.montantService,
      netSource: op.netSource,
      destAmount,
      exchangeRate: Number(exchangeRate),
      profitUsd,
    };
  }

  // deposit / withdrawal / transfer : pas de marge de change. Un taux de service
  // optionnel constitue le seul gain ; le profit est sa contre-valeur en USD.
  const svc = computeServiceAmount(sourceAmount, serviceRate);
  if (!svc.ok) return { ok: false, error: svc.error };

  const parsedDest = clientDest === undefined || clientDest === null ? Number(sourceAmount) : Number(clientDest);
  const destAmount = roundHalfUp(Number.isFinite(parsedDest) ? parsedDest : 0, destDecimals);
  const profitUsd = svc.montantService > 0
    ? roundHalfUp(convertToUSD(svc.montantService, sourceCurrency, rates), 2)
    : 0;

  return {
    ok: true,
    type,
    serviceAmount: svc.montantService,
    netSource: svc.netSource,
    destAmount,
    exchangeRate: Number.isFinite(Number(exchangeRate)) && Number(exchangeRate) > 0 ? Number(exchangeRate) : 1,
    profitUsd,
  };
}
