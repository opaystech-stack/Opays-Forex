import fs from 'node:fs';
import path from 'node:path';
import { validateUpload, buildStoragePath } from '../lib/uploads.js';

// Répertoire de stockage (monté comme volume persistant sur Dokploy).
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.resolve(process.cwd(), 'data', 'uploads');

export default async function uploadRoutes(app) {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requireAgency);

  // Téléversement multipart (preuve de transaction/abonnement, flyer…).
  app.post('/', async (request, reply) => {
    const data = await request.file();
    if (!data) return reply.status(400).send({ success: false, error: 'Aucun fichier reçu' });

    const buffer = await data.toBuffer();
    const check = validateUpload({ mimetype: data.mimetype, size: buffer.length });
    if (!check.ok) return reply.status(400).send({ success: false, error: check.message, code: check.code });

    const kind = data.fields?.kind?.value || 'receipt';
    const relPath = buildStoragePath(request.agencyId, request.user.id, data.filename);
    const absPath = path.join(UPLOAD_DIR, relPath);

    await fs.promises.mkdir(path.dirname(absPath), { recursive: true });
    await fs.promises.writeFile(absPath, buffer);

    const { rows } = await app.pg.query(
      `INSERT INTO uploads (agency_id, owner_id, kind, original_name, mime, size, path)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, kind, original_name, mime, size, created_at`,
      [request.agencyId, request.user.id, kind, data.filename, data.mimetype, buffer.length, relPath]
    );

    return reply.status(201).send({ success: true, data: rows[0] });
  });

  // Streaming sécurisé : seul un membre de l'agence détentrice peut lire le
  // fichier (filtre agency_id) + garde anti-traversal sur le chemin résolu.
  app.get('/:id', async (request, reply) => {
    const { rows } = await app.pg.query(
      'SELECT * FROM uploads WHERE id = $1 AND agency_id = $2 LIMIT 1',
      [request.params.id, request.agencyId]
    );
    if (rows.length === 0) return reply.status(404).send({ success: false, error: 'Fichier introuvable' });

    const record = rows[0];
    const absPath = path.normalize(path.join(UPLOAD_DIR, record.path));
    const root = path.normalize(UPLOAD_DIR);
    if (!absPath.startsWith(root)) {
      return reply.status(400).send({ success: false, error: 'Chemin invalide' });
    }
    if (!fs.existsSync(absPath)) {
      return reply.status(404).send({ success: false, error: 'Fichier absent du stockage' });
    }

    reply.header('Content-Type', record.mime || 'application/octet-stream');
    reply.header('Cache-Control', 'private, max-age=300');
    return reply.send(fs.createReadStream(absPath));
  });
}
