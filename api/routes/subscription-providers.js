import { z } from 'zod';

const providerSchema = z.object({
  label: z.string().min(1),
  is_active: z.boolean().optional().default(true),
});

export default async function subscriptionProviderRoutes(app) {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requireAgency);

  app.get('/', async (request) => {
    const { rows } = await app.pg.query(
      'SELECT * FROM subscription_providers WHERE agency_id = $1 OR agency_id IS NULL ORDER BY label',
      [request.agencyId]
    );
    return { success: true, data: rows };
  });

  app.post('/', async (request, reply) => {
    const body = providerSchema.parse(request.body);
    const { rows } = await app.pg.query(
      `INSERT INTO subscription_providers (agency_id, label, is_active)
       VALUES ($1, $2, $3) RETURNING *`,
      [request.agencyId, body.label, body.is_active]
    );
    return reply.status(201).send({ success: true, data: rows[0] });
  });

  app.delete('/:id', async (request, reply) => {
    const { rowCount } = await app.pg.query(
      'DELETE FROM subscription_providers WHERE id = $1 AND agency_id = $2',
      [request.params.id, request.agencyId]
    );
    if (rowCount === 0) return reply.status(404).send({ success: false, error: 'Fournisseur introuvable' });
    return { success: true };
  });
}
