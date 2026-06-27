// Module de logique pure pour la soumission des Preuves_Paiement.
//
// Fonctions PURES (sans effet de bord ni appel réseau) consommées par
// AppContext (`submitPaymentProof`) et la Page_Paiement pour fiabiliser la
// collecte des preuves : validation du mode et du reçu (format/taille),
// construction du chemin Storage confiné au dossier de l'utilisateur et
// construction de l'enregistrement de preuve à insérer.
//
// Ces fonctions ne lèvent jamais d'exception et ne touchent ni au réseau ni au
// presse-papiers ; les effets de bord (upload Storage, insert DB) restent à la
// charge de l'appelant, et uniquement après une validation réussie.

// Types MIME acceptés pour un Reçu : images PNG/JPEG/WEBP ou PDF (R5.4, R7.3).
export const ACCEPTED_MIME = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'];

// Modes de paiement acceptés (R5.6).
export const ACCEPTED_MODES = ['bitcoin', 'lightning', 'usdt', 'mobile_money'];

// Taille maximale d'un Reçu : 5 mégaoctets (R5.5, R7.3).
export const MAX_RECEIPT_BYTES = 5 * 1024 * 1024; // 5 Mo

// Valide une soumission de Preuve_Paiement AVANT tout effet de bord
// (upload Storage / insert DB).
//
// Ordre de validation déterministe (R5.6 → R5.3 → R5.4 → R5.5) :
//   1. mode appartenant à ACCEPTED_MODES        → sinon code 'invalid_mode'
//   2. reçu (file) présent                      → sinon code 'missing_receipt'
//   3. type du reçu appartenant à ACCEPTED_MIME → sinon code 'invalid_format'
//   4. taille dans l'intervalle ]0 ; 5 Mo]      → sinon code 'invalid_size'
//
// Retourne { ok: true } si la soumission est valide,
// sinon { ok: false, code, message } avec le code de la première contrainte
// violée dans l'ordre ci-dessus.
export function validateProofSubmission({ mode, file } = {}) {
  // 1. Mode de paiement (R5.6).
  if (!ACCEPTED_MODES.includes(mode)) {
    return {
      ok: false,
      code: 'invalid_mode',
      message: `Mode de paiement non accepté. Modes valides : ${ACCEPTED_MODES.join(', ')}.`,
    };
  }

  // 2. Reçu présent (R5.3).
  if (file === null || file === undefined) {
    return {
      ok: false,
      code: 'missing_receipt',
      message: 'Un reçu est requis pour soumettre une preuve de paiement.',
    };
  }

  // 3. Format du reçu (R5.4, R7.3).
  if (!ACCEPTED_MIME.includes(file.type)) {
    return {
      ok: false,
      code: 'invalid_format',
      message: 'Format de reçu non accepté. Formats valides : PNG, JPEG, WEBP ou PDF.',
    };
  }

  // 4. Taille du reçu : strictement supérieure à 0 et au plus 5 Mo (R5.5, R7.3).
  const size = file.size;
  if (typeof size !== 'number' || !Number.isFinite(size) || size <= 0 || size > MAX_RECEIPT_BYTES) {
    return {
      ok: false,
      code: 'invalid_size',
      message: 'La taille du reçu doit être supérieure à 0 octet et au plus 5 mégaoctets.',
    };
  }

  return { ok: true };
}

// Construit le chemin de stockage d'un Reçu, confiné au dossier de l'utilisateur
// (R5.2, R7.2). Le premier segment de dossier est toujours exactement `userId`,
// garantissant l'isolement par utilisateur exigé par les politiques Storage.
//
// Format : `${userId}/${timestamp}-${safeName}`.
//
// Le nom de fichier est assaini : tout caractère hors [A-Za-z0-9._-] est
// remplacé par un tiret bas, afin d'éviter les séparateurs de chemin et les
// caractères problématiques. Un nom absent est remplacé par `receipt`.
export function buildReceiptPath(userId, fileName) {
  const timestamp = Date.now();

  const rawName = fileName === null || fileName === undefined ? '' : String(fileName);
  const safeName = rawName.replace(/[^A-Za-z0-9._-]/g, '_') || 'receipt';

  return `${userId}/${timestamp}-${safeName}`;
}

// Construit l'enregistrement de Preuve_Paiement à insérer en base (R5.8).
//
// Associe l'identifiant de l'utilisateur, le mode de paiement, la référence
// optionnelle (normalisée à null si absente/vide), le chemin du reçu, un
// horodatage de soumission ISO 8601 UTC et le Statut_Preuve initial
// `en_attente`.
export function buildProofRecord({ userId, mode, reference, recuPath } = {}) {
  let normalizedReference = null;
  if (reference !== null && reference !== undefined) {
    const trimmed = String(reference).trim();
    normalizedReference = trimmed === '' ? null : trimmed;
  }

  return {
    user_id: userId,
    mode_paiement: mode,
    reference: normalizedReference,
    recu_path: recuPath,
    statut: 'en_attente',
    submitted_at: new Date().toISOString(),
  };
}
