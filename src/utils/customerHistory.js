// Helpers d'historique client — fonctions PURES (aucune mutation, aucun effet de bord).
//
// Couvre :
//   - sortCustomerOperations : tri par date décroissante, départage par ordre
//     d'enregistrement décroissant (Exigence 9.7).
//   - countCustomerOperations : nombre total borné [0, 999 999] (Exigence 9.3).
//   - formatOperationRow : date JJ/MM/AAAA, montant à 2 décimales, type non vide
//     (Exigence 9.2).
//
// Conventions du dépôt : les opérations (`transactions`) portent un `timestamp`
// ISO (cf. AppContext.jsx). On accepte aussi `created_at`/`date` en repli.

const MAX_OPERATIONS = 999999;

const pad2 = (value) => String(value).padStart(2, '0');
const pad4 = (value) => String(value).padStart(4, '0');

// Retourne un objet Date valide à partir d'une opération, ou null si la date
// est absente ou non analysable.
const getOperationDate = (operation) => {
  if (!operation || typeof operation !== 'object') return null;
  const raw = operation.timestamp ?? operation.created_at ?? operation.date;
  if (raw == null || raw === '') return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

// Clé jour `AAAA-MM-JJ` (heure locale) pour comparaison ; '' si date invalide
// (les opérations sans date valide sont reléguées en fin de tri décroissant).
const getDayKey = (operation) => {
  const date = getOperationDate(operation);
  if (!date) return '';
  return `${pad4(date.getFullYear())}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
};

// Sélectionne le montant à afficher : source_amount en priorité, puis amount,
// puis dest_amount ; 0 si aucun montant numérique exploitable.
const pickAmount = (operation) => {
  if (!operation || typeof operation !== 'object') return 0;
  const candidates = [operation.source_amount, operation.amount, operation.dest_amount];
  for (const candidate of candidates) {
    if (candidate == null || candidate === '') continue;
    const numeric = Number(candidate);
    if (Number.isFinite(numeric)) return numeric;
  }
  return 0;
};

/**
 * Trie les opérations par date décroissante (de la plus récente à la plus
 * ancienne). Les opérations de même date (même jour) sont départagées par
 * ordre d'enregistrement décroissant : l'opération enregistrée le plus
 * récemment (index le plus élevé dans la liste fournie) apparaît en premier.
 *
 * Fonction pure : ne mute pas le tableau d'entrée et retourne une nouvelle liste.
 *
 * @param {Array<object>} operations
 * @returns {Array<object>}
 */
export const sortCustomerOperations = (operations) => {
  if (!Array.isArray(operations)) return [];

  return operations
    .map((operation, index) => ({ operation, index }))
    .sort((a, b) => {
      const keyA = getDayKey(a.operation);
      const keyB = getDayKey(b.operation);
      if (keyA < keyB) return 1; // décroissant : clé la plus grande en premier
      if (keyA > keyB) return -1;
      // Même date : ordre d'enregistrement décroissant (index le plus élevé d'abord).
      return b.index - a.index;
    })
    .map((entry) => entry.operation);
};

/**
 * Retourne le nombre total d'opérations rattachées, borné à l'entier [0, 999 999].
 *
 * @param {Array<object>} operations
 * @returns {number}
 */
export const countCustomerOperations = (operations) => {
  if (!Array.isArray(operations)) return 0;
  const count = operations.length;
  if (count < 0) return 0;
  if (count > MAX_OPERATIONS) return MAX_OPERATIONS;
  return count;
};

/**
 * Formate une opération pour l'affichage dans l'historique : date au format
 * JJ/MM/AAAA, montant à exactement 2 décimales (chaîne) et type non vide.
 *
 * @param {object} operation
 * @returns {{ date: string, amount: string, type: string }}
 */
export const formatOperationRow = (operation) => {
  const date = getOperationDate(operation);
  const formattedDate = date
    ? `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${pad4(date.getFullYear())}`
    : '';

  const amount = pickAmount(operation).toFixed(2);

  const rawType =
    operation && typeof operation.type === 'string' ? operation.type.trim() : '';
  const type = rawType !== '' ? rawType : 'exchange';

  return { date: formattedDate, amount, type };
};
