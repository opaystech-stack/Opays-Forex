import { z } from 'zod';
const schema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().email().optional().nullable(),
  role: z.enum(['cashier', 'agent', 'supervisor']).default('agent'),
  isActive: z.boolean().default(true),
  permissions: z.array(z.string()).default([]),
});
export default async function(app, _opts) {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requireAgency);
  app.get('/', async (req) => {
    const { rows } = await app.pg.query('SELECT * FROM employees WHERE agency_id = $1 ORDER BY created_at DESC', [req.agencyId]);
    return { success: true, data: rows.map(r => ({ id: r.id, firstName: r.first_name, lastName: r.last_name, phone: r.phone, email: r.email, role: r.role, isActive: r.is_active, permissions: r.permissions })) };
  });
  app.post('/', async (req, reply) => {
    const b = schema.parse(req.body);
    const { rows } = await app.pg.query('INSERT INTO employees (agency_id, first_name, last_name, phone, email, role, is_active, permissions) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *', [req.agencyId, b.firstName, b.lastName, b.phone || null, b.email || null, b.role, b.isActive, JSON.stringify(b.permissions)]);
    return reply.status(201).send({ success: true, data: mapEmployee(rows[0]) });
  });
  app.put('/:id', async (req, reply) => {
    const b = schema.partial().parse(req.body);
    const { rows } = await app.pg.query('UPDATE employees SET first_name = COALESCE($3, first_name), last_name = COALESCE($4, last_name), phone = COALESCE($5, phone), email = COALESCE($6, email), role = COALESCE($7, role), is_active = COALESCE($8, is_active), permissions = COALESCE($9, permissions), updated_at = NOW() WHERE id = $1 AND agency_id = $2 RETURNING *', [req.params.id, req.agencyId, b.firstName || null, b.lastName || null, b.phone || null, b.email || null, b.role || null, b.isActive === undefined ? null : b.isActive, b.permissions ? JSON.stringify(b.permissions) : null]);
    if (rows.length === 0) return reply.status(404).send({ success: false, error: 'Not found' });
    return { success: true, data: mapEmployee(rows[0]) };
  });
  app.delete('/:id', async (req, reply) => {
    const { rowCount } = await app.pg.query('DELETE FROM employees WHERE id = $1 AND agency_id = $2', [req.params.id, req.agencyId]);
    if (rowCount === 0) return reply.status(404).send({ success: false, error: 'Not found' });
    return { success: true };
  });
}
function mapEmployee(r) { return { id: r.id, firstName: r.first_name, lastName: r.last_name, phone: r.phone, email: r.email, role: r.role, isActive: r.is_active, permissions: r.permissions }; }