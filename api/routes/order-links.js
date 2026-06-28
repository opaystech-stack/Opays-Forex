import { generateOrderToken } from '../../src/utils/orderToken.js';

export default async function orderLinkRoutes(app) {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requireAgency);

  app.get('/', async (request) => {
    const { rows } = await app.pg.query(
      'SELECT * FROM order_links WHERE agency_id = $1 ORDER BY created_at DESC',
      [request.agencyId]
    );
    return { success: true, data: rows };
  });

  // Génère un jeton de lien de commande (token créé côté serveur).
  app.post('/', async (request, reply) => {
    const expiresInHours = Number(request.body?.expiresInHours);
    const hours = Number.isFinite(expiresInHours) && expiresInHours > 0 ? expiresInHours : 24;
    const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
    const token = generateOrderToken();

    const { rows } = await app.pg.query(
      `INSERT INTO order_links (agency_id, token, expires_at, created_by)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [request.agencyId, token, expiresAt, request.user.id]
    );
    return reply.status(201).send({ success: true, data: rows[0] });
  });

  app.put('/:id/revoke', async (request, reply) => {
    const { rows } = await app.pg.query(
      'UPDATE order_links SET revoked = true WHERE id = $1 AND agency_id = $2 RETURNING *',
      [request.params.id, request.agencyId]
    );
    if (rows.length === 0) return reply.status(404).send({ success: false, error: 'Lien introuvable' });
    return { success: true, data: rows[0] };
  });
}
