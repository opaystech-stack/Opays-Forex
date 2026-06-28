import { z } from 'zod';

const templateSchema = z.object({
  name: z.string().min(1),
  lang: z.string().min(2).max(8).default('fr'),
  scenario: z.string().min(1).default('personalized'),
  body: z.string().min(1),
});

export default async function templateRoutes(app) {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requireAgency);

  app.get('/', async (request) => {
    const { rows } = await app.pg.query(
      'SELECT * FROM message_templates WHERE agency_id = $1 ORDER BY created_at DESC',
      [request.agencyId]
    );
    return { success: true, data: rows };
  });

  app.post('/', async (request, reply) => {
    const body = templateSchema.parse(request.body);
    const { rows } = await app.pg.query(
      `INSERT INTO message_templates (agency_id, name, lang, scenario, body)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [request.agencyId, body.name, body.lang, body.scenario, body.body]
    );
    return reply.status(201).send({ success: true, data: rows[0] });
  });

  app.put('/:id', async (request, reply) => {
    const body = templateSchema.partial().parse(request.body);
    const fields = [];
    const values = [];
    let idx = 1;
    for (const [key, val] of Object.entries(body)) {
      if (val !== undefined) {
        fields.push(`${key} = $${idx}`);
        values.push(val);
        idx++;
      }
    }
    if (fields.length === 0) return reply.status(400).send({ success: false, error: 'No fields to update' });
    values.push(request.params.id, request.agencyId);
    const { rows } = await app.pg.query(
      `UPDATE message_templates SET ${fields.join(', ')}, updated_at = NOW()
       WHERE id = $${idx} AND agency_id = $${idx + 1} RETURNING *`,
      values
    );
    if (rows.length === 0) return reply.status(404).send({ success: false, error: 'Template not found' });
    return { success: true, data: rows[0] };
  });

  app.delete('/:id', async (request, reply) => {
    const { rowCount } = await app.pg.query(
      'DELETE FROM message_templates WHERE id = $1 AND agency_id = $2',
      [request.params.id, request.agencyId]
    );
    if (rowCount === 0) return reply.status(404).send({ success: false, error: 'Template not found' });
    return { success: true };
  });
}
