// Logique PURE de gestion des téléversements (validation + chemin sécurisé).
// Sans dépendance externe : testable isolément, partagée par la route /uploads.

export const ACCEPTED_UPLOAD_MIME = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'];
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 Mo

// Valide le type MIME et la taille d'un fichier téléversé.
export function validateUpload({ mimetype, size } = {}) {
  if (!ACCEPTED_UPLOAD_MIME.includes(mimetype)) {
    return { ok: false, code: 'invalid_format', message: 'Format non accepté (PNG, JPEG, WEBP ou PDF).' };
  }
  if (typeof size !== 'number' || !Number.isFinite(size) || size <= 0 || size > MAX_UPLOAD_BYTES) {
    return { ok: false, code: 'invalid_size', message: 'Taille invalide (0 < taille ≤ 5 Mo).' };
  }
  return { ok: true };
}

// Assainit un segment de chemin : seuls [A-Za-z0-9._-] sont conservés, ce qui
// neutralise les séparateurs et les séquences de remontée (« .. », « / », « \ »).
function sanitizeSegment(value, fallback) {
  const raw = value === null || value === undefined ? '' : String(value);
  const cleaned = raw.replace(/[^A-Za-z0-9._-]/g, '_');
  return cleaned || fallback;
}

// Construit le chemin de stockage RELATIF, confiné par agence puis par
// utilisateur : `${agencyId}/${userId}/${timestamp}-${nom}`. Le préfixe agence
// garantit l'isolation inter-agences au niveau du système de fichiers.
export function buildStoragePath(agencyId, userId, filename, now = Date.now()) {
  const a = sanitizeSegment(agencyId, 'agency');
  const u = sanitizeSegment(userId, 'user');
  const name = sanitizeSegment(filename, 'file');
  return `${a}/${u}/${now}-${name}`;
}
