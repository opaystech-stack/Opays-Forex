// Composition de message et résolution de variables — fonctions pures
//
// Deux modes de composition d'une Relance :
//   - Mode modèle (Modele_Message) : un gabarit contenant des marqueurs
//     `{{nom}}` est résolu en remplaçant chaque marqueur par la valeur
//     correspondante du Client. Une variable OPTIONNELLE sans valeur est
//     remplacée par un repli défini (jamais le marqueur brut, jamais un
//     montant inventé). Une variable OBLIGATOIRE sans valeur bloque la
//     composition (aucun texte produit, liste des variables manquantes).
//   - Mode texte libre : le texte est renvoyé tel quel, sans aucune
//     résolution ; toute syntaxe `{{...}}` est préservée littéralement.
//
// Ces fonctions sont pures : aucun effet de bord, aucune horloge, aucun I/O.
//
// Feature: whatsapp-client-reminders

/**
 * Ensemble par défaut des variables prises en charge (Exigence 9.1).
 * `customer_name` est obligatoire ; `amount_due`, `currency` et `due_date`
 * sont optionnelles et remplacées par le repli en l'absence de valeur.
 */
export const DEFAULT_REQUIRED_VARIABLES = ['customer_name'];
export const DEFAULT_OPTIONAL_VARIABLES = ['amount_due', 'currency', 'due_date'];
export const DEFAULT_FALLBACK = '—';

// Expression repérant un marqueur de variable `{{nom}}`, tolérant des
// espaces internes (`{{ nom }}`). Le nom est un identifiant simple
// (lettres, chiffres, tirets bas).
const MARKER_PATTERN = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

/**
 * Détermine si une variable possède une valeur exploitable.
 * `null`, `undefined` et la chaîne vide (après normalisation) sont
 * considérés comme absents. La valeur numérique `0` est une valeur valide.
 *
 * @param {*} value
 * @returns {boolean}
 */
const hasValue = (value) => {
  if (value === null || value === undefined) return false;
  return String(value) !== '';
};

/**
 * Extrait la liste ordonnée et dédupliquée des noms de variables présents
 * dans un gabarit sous la forme `{{nom}}`.
 *
 * @param {string} body
 * @returns {string[]}
 */
const extractMarkerNames = (body) => {
  const names = [];
  const seen = new Set();
  let match;
  MARKER_PATTERN.lastIndex = 0;
  while ((match = MARKER_PATTERN.exec(body)) !== null) {
    const name = match[1];
    if (!seen.has(name)) {
      seen.add(name);
      names.push(name);
    }
  }
  return names;
};

/**
 * Résout les variables `{{nom}}` d'un Modele_Message.
 *
 * Règles (Exigences 7.1, 7.3, 9.1, 9.2, 9.3, 10.3, 10.4) :
 *   - chaque marqueur `{{nom}}` ayant une valeur est remplacé par cette valeur ;
 *   - un marqueur d'une variable OPTIONNELLE sans valeur est remplacé par le
 *     repli `options.fallback` (jamais le marqueur brut, jamais un montant
 *     inventé) ;
 *   - si au moins une variable OBLIGATOIRE référencée dans le gabarit n'a pas
 *     de valeur, la résolution échoue : `{ ok:false, missing:[...] }` et aucun
 *     texte n'est produit (blocage d'envoi) ;
 *   - lorsque toutes les variables obligatoires sont résolues :
 *     `{ ok:true, text }`.
 *
 * Les marqueurs ni obligatoires ni optionnels (inconnus) sans valeur sont
 * laissés tels quels.
 *
 * @param {string} templateBody  gabarit contenant des marqueurs `{{nom}}`
 * @param {Object<string, *>} [variables]  valeurs des variables du Client
 * @param {{ required?: string[], optional?: string[], fallback?: string }} [options]
 * @returns {{ ok: boolean, text?: string, missing?: string[] }}
 */
export const resolveTemplate = (templateBody, variables = {}, options = {}) => {
  const body = templateBody === null || templateBody === undefined ? '' : String(templateBody);
  const vars = variables && typeof variables === 'object' ? variables : {};

  const required = new Set(options.required || DEFAULT_REQUIRED_VARIABLES);
  const optional = new Set(options.optional || DEFAULT_OPTIONAL_VARIABLES);
  const fallback =
    options.fallback === undefined || options.fallback === null
      ? DEFAULT_FALLBACK
      : String(options.fallback);

  const markerNames = extractMarkerNames(body);

  // Blocage : toute variable obligatoire référencée dans le gabarit et
  // dépourvue de valeur est signalée comme manquante (Exigence 10.4).
  const missing = markerNames.filter(
    (name) => required.has(name) && !hasValue(vars[name])
  );

  if (missing.length > 0) {
    return { ok: false, missing };
  }

  // Remplacement de chaque marqueur.
  const text = body.replace(MARKER_PATTERN, (rawMarker, name) => {
    if (hasValue(vars[name])) {
      return String(vars[name]);
    }
    if (optional.has(name)) {
      return fallback;
    }
    if (required.has(name)) {
      // Théoriquement inatteignable : les obligatoires sans valeur sont
      // captées ci-dessus. Conservé par sûreté.
      return fallback;
    }
    // Marqueur inconnu sans valeur : conservé tel quel.
    return rawMarker;
  });

  return { ok: true, text };
};

/**
 * Mode texte libre : fonction identité. Le texte est renvoyé tel quel,
 * sans aucune résolution de variable. Toute syntaxe `{{...}}` est préservée
 * littéralement (Exigences 5.3, 5.4).
 *
 * @param {string} rawText
 * @returns {string}
 */
export const composeFreeText = (rawText) => rawText;
