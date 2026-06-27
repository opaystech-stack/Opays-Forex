// Configuration des Coordonnées_Paiement — fonctions pures (aucun appel réseau).
//
// Cette couche normalise et filtre les moyens de paiement renseignés via la
// configuration (variables d'environnement `VITE_PAY_*` au build, ou table
// optionnelle). Conformément aux contraintes du projet, AUCUNE API payante :
// la source est purement déclarative.
//
// Règles couvertes :
//   - R4.1 : adresse Bitcoin configurée
//   - R4.2 : adresse/invoice Lightning configurée
//   - R4.3 : adresse USDT + réseau associé
//   - R4.4 : numéros Mobile Money avec devise et libellé
//   - R4.9 : masquer uniquement les moyens non configurés
//   - R4.10 : signaler l'absence totale de moyen configuré
//
// Feature: paid-access-control

/**
 * @typedef {Object} Method
 * @property {'bitcoin'|'lightning'|'usdt'|'mobile_money'} kind  type de moyen
 * @property {string} address  adresse crypto ou numéro Mobile Money (non vide)
 * @property {string} [network]  réseau associé (USDT)
 * @property {string} [label]  libellé (Mobile Money)
 * @property {string} [currency]  devise (Mobile Money)
 */

/**
 * @typedef {Object} RawPaymentConfig
 * @property {string} [bitcoin]  adresse Bitcoin
 * @property {string} [lightning]  adresse ou invoice Lightning
 * @property {string} [usdt]  adresse USDT
 * @property {string} [usdtNetwork]  réseau USDT (ex. TRC20, ERC20)
 * @property {Array<{label?: string, number?: string, currency?: string}>} [mobileMoney]
 *   liste des numéros Mobile Money
 */

/**
 * Nettoie une valeur en chaîne : retourne la chaîne sans espaces de bordure,
 * ou la chaîne vide pour toute valeur absente ou non-chaîne.
 *
 * @param {*} value
 * @returns {string}
 */
const clean = (value) => (typeof value === 'string' ? value.trim() : '');

/**
 * Indique si une adresse/un numéro est « copiable », c.-à-d. non vide après
 * nettoyage des espaces. Toute valeur absente, non-chaîne ou ne contenant que
 * des espaces est considérée comme non copiable.
 *
 * @param {*} address
 * @returns {boolean}
 */
export const isCopyable = (address) => clean(address) !== '';

/**
 * Normalise et filtre les moyens de paiement configurés.
 *
 * Pour toute configuration brute, ne sont retournés que les moyens dont
 * l'adresse (ou le numéro Mobile Money) est non vide après nettoyage : aucun
 * moyen vide n'est jamais inclus (R4.9). `anyConfigured` est vrai si et
 * seulement si au moins un moyen est retourné (R4.10).
 *
 * Fonction pure : aucun effet de bord, aucune lecture d'environnement.
 *
 * @param {RawPaymentConfig|null|undefined} rawConfig
 * @returns {{ methods: Method[], anyConfigured: boolean }}
 */
export const getConfiguredMethods = (rawConfig) => {
  const config = rawConfig && typeof rawConfig === 'object' ? rawConfig : {};
  const methods = [];

  // Bitcoin (R4.1)
  const bitcoin = clean(config.bitcoin);
  if (bitcoin !== '') {
    methods.push({ kind: 'bitcoin', address: bitcoin });
  }

  // Lightning (R4.2)
  const lightning = clean(config.lightning);
  if (lightning !== '') {
    methods.push({ kind: 'lightning', address: lightning });
  }

  // USDT + réseau (R4.3)
  const usdt = clean(config.usdt);
  if (usdt !== '') {
    const network = clean(config.usdtNetwork);
    const method = { kind: 'usdt', address: usdt };
    if (network !== '') method.network = network;
    methods.push(method);
  }

  // Mobile Money : liste de { label, number, currency } (R4.4)
  const momoList = Array.isArray(config.mobileMoney) ? config.mobileMoney : [];
  for (const entry of momoList) {
    if (!entry || typeof entry !== 'object') continue;
    const number = clean(entry.number);
    if (number === '') continue; // filtre les numéros vides (R4.9)
    const method = { kind: 'mobile_money', address: number };
    const label = clean(entry.label);
    const currency = clean(entry.currency);
    if (label !== '') method.label = label;
    if (currency !== '') method.currency = currency;
    methods.push(method);
  }

  return { methods, anyConfigured: methods.length > 0 };
};

/**
 * Lit la configuration brute de paiement depuis un objet d'environnement de
 * type Vite (`import.meta.env`). La liste Mobile Money est attendue sous forme
 * de chaîne JSON dans `VITE_PAY_MOMO` ; un JSON invalide est ignoré (liste vide).
 *
 * @param {Record<string, string>} [env]  objet d'environnement
 * @returns {RawPaymentConfig}
 */
export const readPaymentConfig = (env) => {
  const source = env && typeof env === 'object' ? env : {};

  let mobileMoney = [];
  const rawMomo = clean(source.VITE_PAY_MOMO);
  if (rawMomo !== '') {
    try {
      const parsed = JSON.parse(rawMomo);
      if (Array.isArray(parsed)) mobileMoney = parsed;
    } catch {
      mobileMoney = []; // JSON invalide ⇒ aucun Mobile Money configuré
    }
  }

  return {
    bitcoin: clean(source.VITE_PAY_BTC_ADDRESS),
    lightning: clean(source.VITE_PAY_LIGHTNING),
    usdt: clean(source.VITE_PAY_USDT_ADDRESS),
    usdtNetwork: clean(source.VITE_PAY_USDT_NETWORK),
    mobileMoney,
  };
};
