// Arrondi au plus proche, demi vers le haut (vers +∞ en cas d'égalité).
// Corrige l'erreur de représentation binaire avant l'arrondi.
// Exemples : roundHalfUp(1.005, 2) === 1.01 ; roundHalfUp(-2.5, 0) === -2.
export const roundHalfUp = (value, decimals = 0) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  const parsedDecimals = Number(decimals);
  const d = Number.isFinite(parsedDecimals) ? Math.trunc(parsedDecimals) : 0;
  const factor = 10 ** d;
  const shifted = num * factor;
  const epsilon = Math.abs(shifted) * 1e-12 + 1e-9;
  const rounded = Math.floor(shifted + 0.5 + epsilon);
  return rounded / factor;
};

// Convertit un montant vers l'USD en divisant par `rate_to_usd` (Ex. 1.10).
// Conserve le comportement sûr existant : retourne 0 (valeur neutre) si la
// devise non-USD n'a pas de taux exploitable, c'est-à-dire taux nul, négatif,
// absent ou non numérique (Ex. 1.11).
// Option `round: true` pour appliquer l'arrondi monétaire à 2 décimales.
export const convertToUSD = (amount, currency, rates = [], options = {}) => {
  const { round = false } = options || {};
  const parsed = Number(amount);
  const numericAmount = Number.isFinite(parsed) ? parsed : 0;
  if (currency === 'USD') return round ? roundHalfUp(numericAmount, 2) : numericAmount;

  const rate = rates.find((entry) => entry.currency === currency);
  const rateValue = rate ? Number(rate.rate_to_usd) : NaN;
  if (!rate || !Number.isFinite(rateValue) || rateValue <= 0) return 0;

  const result = numericAmount / rateValue;
  return round ? roundHalfUp(result, 2) : result;
};

// Calcule le taux de change `dest_amount / source_amount` arrondi à 6 décimales
// (Ex. 1.1). Signale une erreur sans produire de taux si `sourceAmount <= 0`,
// est absent ou non numérique (Ex. 1.2).
// Retourne { ok: true, rate } ou { ok: false, error }.
export const computeExchangeRate = (sourceAmount, destAmount) => {
  const source = Number(sourceAmount);
  if (!Number.isFinite(source) || source <= 0) {
    return { ok: false, error: 'Le montant source doit être strictement positif.' };
  }
  const destParsed = Number(destAmount);
  const dest = Number.isFinite(destParsed) ? destParsed : 0;
  return { ok: true, rate: roundHalfUp(dest / source, 6) };
};

// Profit en USD d'une opération : valeur USD du montant source moins valeur USD
// du montant destination, le résultat étant arrondi à 2 décimales (Ex. 1.3).
// Une devise sans taux exploitable contribue 0 (comportement sûr de convertToUSD).
export const computeProfitUSD = (sourceAmount, sourceCur, destAmount, destCur, rates = []) => {
  const sourceUSD = convertToUSD(sourceAmount, sourceCur, rates);
  const destUSD = convertToUSD(destAmount, destCur, rates);
  return roundHalfUp(sourceUSD - destUSD, 2);
};

// Applique les mutations de soldes d'une opération sur une liste de portefeuilles,
// de façon pure (ne mute pas l'entrée). Renvoie { wallets, error? }.
// Règles :
//  - `draft` (ou tout statut non `completed`) : aucun solde modifié (Ex. 1.9).
//  - `exchange` : source débité de source_amount, destination créditée de dest_amount (Ex. 1.4).
//  - `deposit`  : seule la destination est créditée de dest_amount (Ex. 1.5).
//  - `withdrawal` : seule la source est débitée de source_amount (Ex. 1.6).
//  - frais > 0 : le portefeuille de frais est débité de `fee` (Ex. 1.8).
//  - chaque solde résultant (modifié) est arrondi à 2 décimales ; les portefeuilles
//    non touchés sont laissés inchangés.
//  - rejet sans effet de bord si le débit rendait le solde source strictement
//    négatif, avec message indiquant solde disponible et montant demandé (Ex. 1.7, 4.1).
//  - rejet sans effet de bord si un montant requis est absent ou non strictement positif.
export const applyBalances = (wallets, txn) => {
  const list = Array.isArray(wallets) ? wallets : [];
  if (!txn || txn.status !== 'completed') {
    return { wallets: list };
  }

  const type = txn.type || 'exchange';
  const sourceAmount = Number(txn.source_amount);
  const destAmount = Number(txn.dest_amount);
  const feeParsed = Number(txn.fee);
  const hasFee = Number.isFinite(feeParsed) && feeParsed > 0;
  const fee = hasFee ? feeParsed : 0;

  const debitsSource = type === 'exchange' || type === 'withdrawal';
  const creditsDest = type === 'exchange' || type === 'deposit';

  if (debitsSource && (!Number.isFinite(sourceAmount) || sourceAmount <= 0)) {
    return { wallets: list, error: 'Le montant source doit être strictement positif.' };
  }
  if (creditsDest && (!Number.isFinite(destAmount) || destAmount <= 0)) {
    return { wallets: list, error: 'Le montant destination doit être strictement positif.' };
  }

  // Pré-contrôle des fonds insuffisants sur le portefeuille source (Ex. 1.7, 4.1).
  if (debitsSource) {
    const sourceWallet = list.find((w) => w.id === txn.source_wallet_id);
    if (sourceWallet) {
      const available = Number(sourceWallet.balance) || 0;
      const feeOnSource = hasFee && txn.fee_wallet_id === sourceWallet.id ? fee : 0;
      const requested = sourceAmount + feeOnSource;
      if (available - requested < 0) {
        return {
          wallets: list,
          error: `Fonds insuffisants : solde disponible ${roundHalfUp(available, 2)}, montant demandé ${roundHalfUp(requested, 2)}.`,
        };
      }
    }
  }

  const newWallets = list.map((w) => {
    const isSource = w.id === txn.source_wallet_id;
    const isDest = w.id === txn.dest_wallet_id;
    const isFee = hasFee && w.id === txn.fee_wallet_id;
    let balance = Number(w.balance) || 0;
    let touched = false;

    if (type === 'exchange') {
      if (isSource) { balance -= sourceAmount; touched = true; }
      if (isDest) { balance += destAmount; touched = true; }
    } else if (type === 'deposit') {
      if (isDest) { balance += destAmount; touched = true; }
    } else if (type === 'withdrawal') {
      if (isSource) { balance -= sourceAmount; touched = true; }
    }

    if (isFee) { balance -= fee; touched = true; }

    if (!touched) return w;
    return { ...w, balance: roundHalfUp(balance, 2) };
  });

  return { wallets: newWallets };
};

// --- Taux de service (commission optionnelle, additif et non-régressif) -----

// Calcule le Montant_Service prélevé sur le montant source AVANT conversion.
// Montant_Service = roundHalfUp(sourceAmount * serviceRate / 100, 2) (Req 7.3) ;
// netSource = sourceAmount - Montant_Service, de sorte que la somme
// (montantService + netSource) est conservée à la précision de 2 décimales (P12).
// Invariant no-op : serviceRate === 0 ⇒ { montantService: 0, netSource: sourceAmount }
// (non-régression Req 7.8 / 18.1, P13).
// Garde des bornes (Req 7.5, P14) : serviceRate non numérique, strictement < 0
// ou strictement > 100 ⇒ { ok: false, error } (aucun montant produit).
// Retourne { ok: true, montantService, netSource } ou { ok: false, error }.
export const computeServiceAmount = (sourceAmount, serviceRate) => {
  const rate = Number(serviceRate);
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
    return { ok: false, error: 'Le taux de service doit être compris entre 0 et 100.' };
  }

  const parsedSource = Number(sourceAmount);
  const source = Number.isFinite(parsedSource) ? parsedSource : 0;

  // No-op strict à taux nul : on préserve exactement le montant source.
  if (rate === 0) {
    return { ok: true, montantService: 0, netSource: source };
  }

  const montantService = roundHalfUp((source * rate) / 100, 2);
  const netSource = roundHalfUp(source - montantService, 2);
  return { ok: true, montantService, netSource };
};

// Compose la conversion d'une Operation avec un Taux_Service optionnel.
// 1. (montantService, netSource) = computeServiceAmount(sourceAmount, serviceRate ?? 0)
// 2. destAmount = roundHalfUp(netSource * exchangeRate, destDecimals)
// `destDecimals` (défaut 2) correspond aux décimales de la devise destination.
// Garde du Taux_Change (Req 7.4) : exchangeRate non numérique ou <= 0 ⇒ erreur.
// No-op à serviceRate = 0 (module `taux_service` désactivé, Req 7.8) :
// montantService = 0, netSource = sourceAmount,
// destAmount = roundHalfUp(sourceAmount * exchangeRate, destDecimals) — soit
// exactement le flux d'opération antérieur sans taux de service (P13).
// Retourne { ok: true, montantService, netSource, destAmount } ou { ok: false, error }.
export const computeOperationAmounts = ({ sourceAmount, exchangeRate, serviceRate, destDecimals = 2 } = {}) => {
  const rateChange = Number(exchangeRate);
  if (!Number.isFinite(rateChange) || rateChange <= 0) {
    return { ok: false, error: 'Le taux de change doit être strictement positif.' };
  }

  const service = computeServiceAmount(sourceAmount, serviceRate ?? 0);
  if (!service.ok) {
    return { ok: false, error: service.error };
  }

  const parsedDecimals = Number(destDecimals);
  const decimals = Number.isFinite(parsedDecimals) ? Math.trunc(parsedDecimals) : 2;
  const destAmount = roundHalfUp(service.netSource * rateChange, decimals);

  return {
    ok: true,
    montantService: service.montantService,
    netSource: service.netSource,
    destAmount,
  };
};

export const calculateLoanRepaymentUSD = (amount, currency, interestRate, rates = []) => {
  const baseAmountUSD = convertToUSD(amount, currency, rates);
  const interest = Number(interestRate) || 0;
  return baseAmountUSD * (1 + interest / 100);
};

// --- Suivi des gains (profits) ---------------------------------------------

// Retourne la date du jour au format YYYY-MM-DD (heure locale).
const todayISO = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

// Retourne le mois courant au format YYYY-MM (heure locale).
const currentMonthISO = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
};

// Vrai si la transaction est complétée (les brouillons sont exclus des gains).
const isCompleted = (txn) => txn && txn.status === 'completed';

// Somme des profit_usd des transactions complétées dont l'horodatage tombe le
// jour `dateISO` (YYYY-MM-DD, défaut : aujourd'hui).
// Exclut les brouillons. Inclut les profit_usd négatifs (pertes).
export const sumDailyProfit = (transactions = [], dateISO = todayISO()) => {
  return (transactions || [])
    .filter((t) => isCompleted(t) && typeof t.timestamp === 'string' && t.timestamp.startsWith(dateISO))
    .reduce((acc, t) => acc + (Number(t.profit_usd) || 0), 0);
};

// Somme des profit_usd des transactions complétées dont l'horodatage tombe dans
// le mois `monthISO` (YYYY-MM, défaut : mois courant).
// Exclut les brouillons. Inclut les profit_usd négatifs (pertes).
export const sumMonthlyProfit = (transactions = [], monthISO = currentMonthISO()) => {
  return (transactions || [])
    .filter((t) => isCompleted(t) && typeof t.timestamp === 'string' && t.timestamp.startsWith(monthISO))
    .reduce((acc, t) => acc + (Number(t.profit_usd) || 0), 0);
};

// --- Essai gratuit (présentation des jours restants) -----------------------
//
// auth-access-mobile-fixes (Z4) : l'AUTORITÉ de l'essai 30 jours reste le
// SERVEUR (cf. api/lib/access.js, exposé via /api/auth/me). Ce helper est
// PUREMENT de présentation : il calcule, pour l'UI, le nombre de jours d'essai
// restants à partir de la date de création du compte (ou d'une échéance
// `trialEndsAt` fournie par le serveur). Il ne décide JAMAIS de l'accès.
//
// Règles :
//   - durée d'essai par défaut : 30 jours ;
//   - `trialEndsAt` (ISO) prioritaire si fourni ; sinon `createdAt + 30 jours` ;
//   - jours restants = ceil((fin - now) / 1 jour), borné à 0 (jamais négatif) ;
//   - date invalide/absente ⇒ { active: false, remainingDays: 0, endsAt: null }.
export const TRIAL_DURATION_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export const trialRemainingDays = (
  { createdAt, trialEndsAt } = {},
  now = Date.now(),
) => {
  let endTime = NaN;

  if (trialEndsAt) {
    endTime = new Date(trialEndsAt).getTime();
  } else if (createdAt) {
    const createdTime = new Date(createdAt).getTime();
    if (!Number.isNaN(createdTime)) {
      endTime = createdTime + TRIAL_DURATION_DAYS * DAY_MS;
    }
  }

  if (Number.isNaN(endTime)) {
    return { active: false, remainingDays: 0, endsAt: null };
  }

  const remainingMs = endTime - now;
  const remainingDays = remainingMs > 0 ? Math.ceil(remainingMs / DAY_MS) : 0;
  return {
    active: remainingMs > 0,
    remainingDays,
    endsAt: new Date(endTime).toISOString(),
  };
};
