// Module de validation des opérations financières.
//
// Fonctions PURES (sans effet de bord) consommées par AppContext pour fiabiliser
// l'enregistrement des opérations : validation des montants, contrôle des
// portefeuilles distincts et détection de doublon par identifiant réseau.
//
// Convention de retour : { ok: boolean, error?: string, field?: string }.

// Bornes monétaires autorisées pour les montants d'opération (Exigence 4.2).
export const MIN_AMOUNT = 0.01;
export const MAX_AMOUNT = 999999999.99;

// Valide un montant d'opération (`source_amount` / `dest_amount` / `fee`...).
//
// Rejette une valeur absente, nulle, négative, non numérique, strictement
// inférieure à 0,01 ou strictement supérieure à 999 999 999,99, en identifiant
// le champ concerné. Accepte toute valeur de l'intervalle [0,01 ; 999 999 999,99].
//
// Retourne { ok: true } si la valeur est valide,
// sinon { ok: false, error, field }.
export const validateAmount = (value, fieldName) => {
  const field = fieldName || 'montant';

  // Absent : null, undefined ou chaîne vide / espaces uniquement.
  if (value === null || value === undefined) {
    return { ok: false, error: `Le champ ${field} est requis.`, field };
  }
  if (typeof value === 'string' && value.trim() === '') {
    return { ok: false, error: `Le champ ${field} est requis.`, field };
  }

  // Non numérique (rejette aussi NaN et Infinity).
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return { ok: false, error: `Le champ ${field} doit être numérique.`, field };
  }

  // Hors bornes (couvre nul et négatif via la borne basse).
  if (parsed < MIN_AMOUNT) {
    return {
      ok: false,
      error: `Le champ ${field} doit être supérieur ou égal à ${MIN_AMOUNT}.`,
      field,
    };
  }
  if (parsed > MAX_AMOUNT) {
    return {
      ok: false,
      error: `Le champ ${field} doit être inférieur ou égal à ${MAX_AMOUNT}.`,
      field,
    };
  }

  return { ok: true };
};

// Vérifie que, pour une opération de type `exchange`, les portefeuilles source
// et destination sont distincts (Exigence 4.3).
//
// Retourne { ok: true } si l'opération est valide ou n'est pas un `exchange`,
// sinon { ok: false, error }.
export const ensureDistinctWallets = (txn) => {
  if (!txn || txn.type !== 'exchange') {
    return { ok: true };
  }

  const { source_wallet_id, dest_wallet_id } = txn;

  // On ne signale un conflit que si les deux portefeuilles sont renseignés et
  // identiques.
  if (
    source_wallet_id !== undefined &&
    source_wallet_id !== null &&
    source_wallet_id === dest_wallet_id
  ) {
    return {
      ok: false,
      error: 'Les portefeuilles source et destination doivent être distincts.',
    };
  }

  return { ok: true };
};

// Détecte un doublon d'opération à partir de l'identifiant réseau
// `transaction_id` (Exigence 4.4 / 4.5).
//
// Pour un `transaction_id` non vide déjà présent dans `existingOps`, renvoie
// l'opération existante correspondante et indique que l'enregistrement doit
// être suspendu. Pour un identifiant absent, vide ou inconnu, aucun doublon
// n'est signalé.
//
// Retourne { duplicate: boolean, existing: object|null, suspend: boolean }.
export const detectDuplicate = (existingOps, transactionId) => {
  const noDuplicate = { duplicate: false, existing: null, suspend: false };

  // Identifiant absent ou vide : aucun doublon.
  if (transactionId === null || transactionId === undefined) {
    return noDuplicate;
  }
  const normalized = String(transactionId).trim();
  if (normalized === '') {
    return noDuplicate;
  }

  const operations = Array.isArray(existingOps) ? existingOps : [];
  const existing = operations.find(
    (op) =>
      op &&
      op.transaction_id !== undefined &&
      op.transaction_id !== null &&
      String(op.transaction_id).trim() === normalized
  );

  if (existing) {
    return { duplicate: true, existing, suspend: true };
  }

  return noDuplicate;
};
