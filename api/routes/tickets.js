import { z } from 'zod';
const schema = z.object({
  customerId: z.string().uuid().optional().nullable(),
  title: z.string().min(1),
  description: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  assignedTo: z.string().uuid().optional().nullable(),
});
export default async function(app, _opts) {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requireAgency);
  app.get('/', async (req) => {
    const { rows } = await app.pg.query('SELECT * FROM tickets WHERE agency_id = $1 ORDER BY created_at DESC', [req.agencyId]);
    return { success: true, data: rows };
  });
  app.post('/', async (req, reply) => {
    const b = schema.parse(req.body);
    const { rows } = await app.pg.query('INSERT INTO tickets (agency_id, customer_id, created_by, title, description, priority, assigned_to) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *', [req.agencyId, b.customerId || null, req.user.id, b.title, b.description || null, b.priority, b.assignedTo || null]);
    return reply.status(201).send({ success: true, data: rows[0] });
  });
  app.put('/:id', async (req, reply) => {
    const b = schema.partial().extend({ status: z.enum(['open', 'in_progress', 'resolved', 'closed']).optional(), resolution: z.string().optional() }).parse(req.body);
    const { rows } = await app.pg.query('UPDATE tickets SET customer_id = COALESCE($3, customer_id), title = COALESCE($4, title), description = COALESCE($5, description), priority = COALESCE($6, priority), status = COALESCE($7, status), assigned_to = COALESCE($8, assigned_to), resolution = COALESCE($9, resolution), updated_at = NOW() WHERE id = $1 AND agency_id = $2 RETURNING *', [req.params.id, req.agencyId, b.customerId || null, b.title || null, b.description || null, b.priority || null, b.status || null, b.assignedTo || null, b.resolution || null]);
    if (rows.length === 0) return reply.status(404).send({ success: false, error: 'Not found' });
    return { success: true, data: rows[0] };
  });
}