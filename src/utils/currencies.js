// Source de vérité unique des devises supportées par OpaysFox.
// Ajouter une devise ici la rend automatiquement disponible dans tous les
// sélecteurs (CurrencySelect) et tous les libellés (via i18n).
// Ordre stable : il définit l'ordre d'affichage dans tous les sélecteurs.
export const SUPPORTED_CURRENCIES = [
  { code: 'USD', labelKey: 'currency.USD' },
  { code: 'EUR', labelKey: 'currency.EUR' },
  { code: 'UGX', labelKey: 'currency.UGX' },
  { code: 'KES', labelKey: 'currency.KES' },
  { code: 'TZS', labelKey: 'currency.TZS' },
  { code: 'BIF', labelKey: 'currency.BIF' },
  { code: 'RWF', labelKey: 'currency.RWF' },
  { code: 'CDF', labelKey: 'currency.CDF' },
  { code: 'FCFA', labelKey: 'currency.FCFA' },
];

// Liste ordonnée des codes de devises supportées.
export const SUPPORTED_CURRENCY_CODES = SUPPORTED_CURRENCIES.map((c) => c.code);

// Vrai si le code appartient au registre des devises supportées.
export function isSupportedCurrency(code) {
  return SUPPORTED_CURRENCY_CODES.includes(code);
}

// Vrai s'il existe un taux exploitable (rate_to_usd non nul) pour cette devise.
// L'USD est toujours considéré comme ayant un taux (1:1).
export function hasRate(code, rates = []) {
  if (code === 'USD') return true;
  const entry = (rates || []).find((r) => r.currency === code);
  return Boolean(entry) && Number(entry.rate_to_usd) !== 0;
}
