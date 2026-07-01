import { z } from 'zod';

const stateSchema = z.object({
  module_name: z.string().min(1),
  enabled: z.boolean(),
});

export default async function moduleRoutes(app) {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requireAgency);

  // États d'activation des modules fonctionnels de l'agence.
  app.get('/states', async (request) => {
    const { rows } = await app.pg.query(
      'SELECT module_name, is_enabled FROM module_states WHERE agency_id = $1',
      [request.agencyId]
    );
    return { success: true, data: rows };
  });

  // Habilitations (droits) accordées par la plateforme.
  app.get('/entitlements', async (request) => {
    const { rows } = await app.pg.query(
      'SELECT module_name, granted FROM module_entitlements WHERE agency_id = $1',
      [request.agencyId]
    );
    return { success: true, data: rows };
  });

  // Active/désactive un module fonctionnel (persisté, isolé par agence).
  app.put('/states', async (request, reply) => {
    const { module_name, is_enabled } = stateSchema.parse(request.body);
    const { rows } = await app.pg.query(
      `INSERT INTO module_states (agency_id, module_name, is_enabled)
       VALUES ($1, $2, $3)
       ON CONFLICT (agency_id, module_name)
       DO UPDATE SET is_enabled = EXCLUDED.is_enabled, updated_at = NOW()
       RETURNING module_name, is_enabled`,
      [request.agencyId, module_name, is_enabled]
    );
    return reply.send({ success: true, data: rows[0] });
  });
}
