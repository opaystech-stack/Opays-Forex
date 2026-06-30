import { z } from 'zod';
const schema = z.object({
  name: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().email().optional().nullable(),
  idNumber: z.string().optional(),
  address: z.string().optional(),
  kycStatus: z.enum(['pending', 'verified', 'rejected']).default('pending'),
  metadata: z.record(z.any()).default({}),
});
export default async function(app, _opts) {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requireAgency);
  app.addHook('preHandler', app.requireAccess);
  app.get('/', async (req) => {
    const { rows } = await app.pg.query('SELECT * FROM customers WHERE agency_id = $1 ORDER BY name', [req.agencyId]);
    return { success: true, data: rows.map(r => ({ id: r.id, agencyId: r.agency_id, name: r.name, phone: r.phone, email: r.email, idNumber: r.id_number, address: r.address, kycStatus: r.kyc_status, metadata: r.metadata, createdAt: r.created_at })) };
  });
  app.post('/', async (req, reply) => {
    const b = schema.parse(req.body);
    const { rows } = await app.pg.query('INSERT INTO customers (agency_id, name, phone, email, id_number, address, kyc_status, metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *', [req.agencyId, b.name, b.phone || null, b.email || null, b.idNumber || null, b.address || null, b.kycStatus, JSON.stringify(b.metadata)]);
    return reply.status(201).send({ success: true, data: mapCustomer(rows[0]) });
  });
  app.put('/:id', async (req, reply) => {
    const b = schema.partial().parse(req.body);
    const { rows } = await app.pg.query('UPDATE customers SET name = COALESCE($3, name), phone = COALESCE($4, phone), email = COALESCE($5, email), id_number = COALESCE($6, id_number), address = COALESCE($7, address), kyc_status = COALESCE($8, kyc_status), updated_at = NOW() WHERE id = $1 AND agency_id = $2 RETURNING *', [req.params.id, req.agencyId, b.name || null, b.phone || null, b.email || null, b.idNumber || null, b.address || null, b.kycStatus || null]);
    if (rows.length === 0) return reply.status(404).send({ success: false, error: 'Not found' });
    return { success: true, data: mapCustomer(rows[0]) };
  });
  app.delete('/:id', async (req, reply) => {
    const { rowCount } = await app.pg.query('DELETE FROM customers WHERE id = $1 AND agency_id = $2', [req.params.id, req.agencyId]);
    if (rowCount === 0) return reply.status(404).send({ success: false, error: 'Not found' });
    return { success: true };
  });
}
function mapCustomer(r) {
  return { id: r.id, agencyId: r.agency_id, name: r.name, phone: r.phone, email: r.email, idNumber: r.id_number, address: r.address, kycStatus: r.kyc_status, metadata: r.metadata, createdAt: r.created_at };
}