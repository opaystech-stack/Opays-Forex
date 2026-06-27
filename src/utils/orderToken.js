// Module du lien de commande à distance (Exigence 14).
//
// Fonctions PURES (sans réseau ; le seul effet est la lecture d'aléa
// cryptographique via la Web Crypto API) consommées par le Formulaire_Commande
// public et la génération du Lien_Commande. Couvre :
//   - la génération d'un jeton non devinable d'au moins 128 bits d'entropie via
//     crypto.getRandomValues (Req 14.2) ;
//   - la vérification de bonne forme d'un jeton candidat avant lookup DB ;
//   - l'encodage/décodage réversible du payload de lien { agencyId, token }
//     (round-trip — Req 14.2, 14.3) ;
//   - la validité d'un Lien_Commande : connu, non révoqué, non expiré (Req 14.5) ;
//   - la présence des champs requis du Formulaire_Commande (Req 14.6).
//
// L'encodage repose sur base64url (RFC 4648 §5, sans remplissage), à la fois
// compact et sûr en URL, et fonctionne en navigateur comme dans Node moderne.

// Nombre d'octets aléatoires composant un jeton : 16 octets = 128 bits (Req 14.2).
export const TOKEN_BYTE_LENGTH = 16;

// Longueur (en caractères base64url, sans remplissage) d'un jeton de 16 octets.
// ceil(16 / 3) * 4 - padding = 22 caractères.
export const TOKEN_STRING_LENGTH = 22;

// Messages d'erreur stables réutilisés par l'UI (Req 14.5, 14.6).
export const ORDER_LINK_INVALID_MESSAGE = 'Ce lien est invalide.';

// Champs requis du Formulaire_Commande (Req 14.6). Alignés sur les colonnes de
// `remote_orders` : nom et téléphone du client, détail de la demande, et la
// Preuve jointe (Req 14.4).
export const REQUIRED_ORDER_FIELDS = ['customerName', 'customerPhone', 'details', 'proof'];

// Alphabet base64url (RFC 4648 §5) : A–Z a–z 0–9 - _ , sans remplissage.
const B64URL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

// Expression régulière d'un jeton bien formé : uniquement des caractères base64url.
const TOKEN_PATTERN = /^[A-Za-z0-9_-]+$/;

// Table inverse alphabet -> valeur 6 bits, construite une seule fois.
const B64URL_LOOKUP = (() => {
  const table = {};
  for (let i = 0; i < B64URL_ALPHABET.length; i += 1) {
    table[B64URL_ALPHABET[i]] = i;
  }
  return table;
})();

// Résout l'implémentation Web Crypto disponible (navigateur ou Node moderne).
// Lance une erreur explicite si aucun générateur d'aléa cryptographique n'existe,
// plutôt que de produire un jeton faiblement aléatoire (Req 14.2).
const getCrypto = () => {
  const cryptoObj =
    (typeof globalThis !== 'undefined' && globalThis.crypto) || undefined;
  if (!cryptoObj || typeof cryptoObj.getRandomValues !== 'function') {
    throw new Error(
      "Web Crypto API indisponible : impossible de générer un jeton sécurisé."
    );
  }
  return cryptoObj;
};

// Encode un tableau d'octets en base64url sans remplissage.
const bytesToBase64url = (bytes) => {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const triplet = (b0 << 16) | (b1 << 8) | b2;

    out += B64URL_ALPHABET[(triplet >> 18) & 0x3f];
    out += B64URL_ALPHABET[(triplet >> 12) & 0x3f];
    if (i + 1 < bytes.length) {
      out += B64URL_ALPHABET[(triplet >> 6) & 0x3f];
    }
    if (i + 2 < bytes.length) {
      out += B64URL_ALPHABET[triplet & 0x3f];
    }
  }
  return out;
};

// Décode une chaîne base64url (sans remplissage) en Uint8Array.
// Retourne null si la chaîne contient un caractère hors alphabet ou une longueur
// invalide (un reste de 1 caractère est impossible en base64).
const base64urlToBytes = (str) => {
  if (typeof str !== 'string' || str.length === 0) {
    return null;
  }

  const remainder = str.length % 4;
  // Un groupe base64 fait 2, 3 ou 4 caractères ; un reste de 1 est impossible.
  if (remainder === 1) {
    return null;
  }

  const bytes = [];
  for (let i = 0; i < str.length; i += 4) {
    const chunk = str.slice(i, i + 4);
    const c0 = B64URL_LOOKUP[chunk[0]];
    const c1 = B64URL_LOOKUP[chunk[1]];
    const c2 = chunk.length > 2 ? B64URL_LOOKUP[chunk[2]] : 0;
    const c3 = chunk.length > 3 ? B64URL_LOOKUP[chunk[3]] : 0;

    if (
      c0 === undefined ||
      c1 === undefined ||
      (chunk.length > 2 && c2 === undefined) ||
      (chunk.length > 3 && c3 === undefined)
    ) {
      return null;
    }

    const triplet = (c0 << 18) | (c1 << 12) | (c2 << 6) | c3;

    bytes.push((triplet >> 16) & 0xff);
    if (chunk.length > 2) {
      bytes.push((triplet >> 8) & 0xff);
    }
    if (chunk.length > 3) {
      bytes.push(triplet & 0xff);
    }
  }
  return Uint8Array.from(bytes);
};

// Encode une chaîne UTF-8 en base64url.
const stringToBase64url = (text) => bytesToBase64url(new TextEncoder().encode(text));

// Décode une chaîne base64url en chaîne UTF-8, ou null si la source est invalide.
const base64urlToString = (encoded) => {
  const bytes = base64urlToBytes(encoded);
  if (bytes === null) {
    return null;
  }
  try {
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  } catch {
    return null;
  }
};

// Génère un jeton de commande non devinable d'au moins 128 bits d'entropie (Req 14.2).
//
// Tire TOKEN_BYTE_LENGTH (16) octets aléatoires via crypto.getRandomValues puis
// les encode en base64url (22 caractères, sans remplissage).
export const generateOrderToken = () => {
  const bytes = new Uint8Array(TOKEN_BYTE_LENGTH);
  getCrypto().getRandomValues(bytes);
  return bytesToBase64url(bytes);
};

// Vérifie qu'un jeton candidat est bien formé avant tout lookup en base (Req 14.5).
//
// Un jeton est bien formé si et seulement si :
//   - c'est une chaîne non vide composée uniquement de caractères base64url ;
//   - il se décode en au moins TOKEN_BYTE_LENGTH (16) octets, garantissant
//     au moins 128 bits d'entropie potentielle (Req 14.2).
export const isWellFormedToken = (token) => {
  if (typeof token !== 'string' || !TOKEN_PATTERN.test(token)) {
    return false;
  }
  const bytes = base64urlToBytes(token);
  return bytes !== null && bytes.length >= TOKEN_BYTE_LENGTH;
};

// Encode le payload d'un Lien_Commande { agencyId, token } en une chaîne unique
// sûre en URL (Req 14.2, 14.3).
//
// Le payload est sérialisé en JSON puis encodé en base64url, garantissant un
// round-trip exact via decodeOrderLink. Retourne null si l'entrée est invalide
// (agencyId ou token absent/non textuel).
export const encodeOrderLink = ({ agencyId, token } = {}) => {
  if (typeof agencyId !== 'string' || agencyId.length === 0) {
    return null;
  }
  if (typeof token !== 'string' || token.length === 0) {
    return null;
  }
  return stringToBase64url(JSON.stringify({ agencyId, token }));
};

// Décode une chaîne produite par encodeOrderLink en { ok, agencyId, token }.
//
// Garantit decodeOrderLink(encodeOrderLink(x)) === x pour toute entrée valide
// (Req 14.2, 14.3). Retourne { ok: false, error } si la chaîne est absente,
// malformée, n'est pas du JSON valide ou ne contient pas les deux champs requis.
export const decodeOrderLink = (encoded) => {
  if (typeof encoded !== 'string' || encoded.length === 0) {
    return { ok: false, error: ORDER_LINK_INVALID_MESSAGE };
  }

  const json = base64urlToString(encoded);
  if (json === null) {
    return { ok: false, error: ORDER_LINK_INVALID_MESSAGE };
  }

  let payload;
  try {
    payload = JSON.parse(json);
  } catch {
    return { ok: false, error: ORDER_LINK_INVALID_MESSAGE };
  }

  if (
    !payload ||
    typeof payload !== 'object' ||
    typeof payload.agencyId !== 'string' ||
    payload.agencyId.length === 0 ||
    typeof payload.token !== 'string' ||
    payload.token.length === 0
  ) {
    return { ok: false, error: ORDER_LINK_INVALID_MESSAGE };
  }

  return { ok: true, agencyId: payload.agencyId, token: payload.token };
};

// Détermine si l'accès au Formulaire_Commande est autorisé pour un jeton donné (Req 14.5).
//
// L'accès est accordé SI ET SEULEMENT SI le jeton est :
//   - bien formé (isWellFormedToken) ;
//   - connu : un enregistrement de lien correspondant existe et son `token`
//     coïncide exactement avec le jeton présenté ;
//   - non révoqué : linkRecord.revoked !== true ;
//   - non expiré : pas de date d'expiration, ou maintenant strictement avant
//     l'expiration.
//
// `linkRecord` reflète la ligne `order_links` chargée depuis la base :
//   { token, revoked, expiresAt } où expiresAt est un timestamp en millisecondes
//   (ou null/undefined si le lien n'expire jamais).
// Un jeton inconnu, révoqué ou expiré est refusé (Req 14.5).
export const isOrderLinkValid = (token, linkRecord, nowMs = Date.now()) => {
  if (!isWellFormedToken(token)) {
    return false;
  }
  if (!linkRecord || typeof linkRecord !== 'object') {
    return false;
  }
  // Connu : le lien chargé doit correspondre exactement au jeton présenté.
  if (linkRecord.token !== token) {
    return false;
  }
  // Non révoqué.
  if (linkRecord.revoked === true) {
    return false;
  }
  // Non expiré : une expiration définie dans le passé (ou à l'instant présent) refuse l'accès.
  const expiresAt = linkRecord.expiresAt;
  if (expiresAt !== null && expiresAt !== undefined) {
    if (typeof expiresAt !== 'number' || Number.isNaN(expiresAt)) {
      return false;
    }
    if (nowMs >= expiresAt) {
      return false;
    }
  }
  return true;
};

// Indique si une valeur de champ de formulaire est considérée comme présente.
// Une chaîne vide ou composée uniquement d'espaces est absente ; null, undefined
// et la chaîne vide sont absents ; toute autre valeur (objet Preuve, nombre, etc.)
// est présente.
const isFieldPresent = (value) => {
  if (value === null || value === undefined) {
    return false;
  }
  if (typeof value === 'string') {
    return value.trim().length > 0;
  }
  return true;
};

// Valide la présence de tous les champs requis du Formulaire_Commande (Req 14.6).
//
// L'enregistrement d'une Commande_Distante est accepté SI ET SEULEMENT SI tous
// les champs de REQUIRED_ORDER_FIELDS sont présents. Toute soumission à laquelle
// manque un champ requis est rejetée sans création de Commande_Distante, en
// indiquant le premier champ manquant rencontré.
//
// Retourne { ok: true } si la commande est complète,
// sinon { ok: false, missingField, error }.
export const validateOrderForm = (form = {}) => {
  const data = form && typeof form === 'object' ? form : {};

  for (const field of REQUIRED_ORDER_FIELDS) {
    if (!isFieldPresent(data[field])) {
      return {
        ok: false,
        missingField: field,
        error: `Le champ requis « ${field} » est manquant.`,
      };
    }
  }

  return { ok: true };
};
