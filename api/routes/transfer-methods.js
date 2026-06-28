import { z } from 'zod';

const methodSchema = z.object({
  label: z.string().min(1),
  is_active: z.boolean().optional().default(true),
  is_permanent: z.boolean().optional().default(false),
});

export default async function transferMethodRoutes(app) {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requireAgency);

  // Liste : méthodes de l'agence + entrées globales (agency_id NULL).
  app.get('/', async (request) => {
    const { rows } = await app.pg.query(
      'SELECT * FROM transfer_methods WHERE agency_id = $1 OR agency_id IS NULL ORDER BY label',
      [request.agencyId]
    );
    return { success: true, data: rows };
  });

  app.post('/', async (request, reply) => {
    const body = methodSchema.parse(request.body);
    const { rows } = await app.pg.query(
      `INSERT INTO transfer_methods (agency_id, label, is_active, is_permanent)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [request.agencyId, body.label, body.is_active, body.is_permanent]
    );
    return reply.status(201).send({ success: true, data: rows[0] });
  });

  app.put('/:id', async (request, reply) => {
    const body = methodSchema.partial().parse(request.body);
    const fields = [];
    const values = [];
    let idx = 1;
    for (const [key, val] of Object.entries(body)) {
      if (val !== undefined) { fields.push(`${key} = $${idx}`); values.push(val); idx++; }
    }
    if (fields.length === 0) return reply.status(400).send({ success: false, error: 'No fields to update' });
    values.push(request.params.id, request.agencyId);
    const { rows } = await app.pg.query(
      `UPDATE transfer_methods SET ${fields.join(', ')} WHERE id = $${idx} AND agency_id = $${idx + 1} RETURNING *`,
      values
    );
    if (rows.length === 0) return reply.status(404).send({ success: false, error: 'Méthode introuvable' });
    return { success: true, data: rows[0] };
  });

  app.delete('/:id', async (request, reply) => {
    const { rowCount } = await app.pg.query(
      'DELETE FROM transfer_methods WHERE id = $1 AND agency_id = $2 AND is_permanent = false',
      [request.params.id, request.agencyId]
    );
    if (rowCount === 0) return reply.status(404).send({ success: false, error: 'Méthode introuvable ou permanente' });
    return { success: true };
  });
}
