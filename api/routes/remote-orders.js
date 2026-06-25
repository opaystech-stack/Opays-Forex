import { z } from 'zod';
const schema = z.object({
  customerPhone: z.string().optional(),
  customerName: z.string().optional(),
  customerId: z.string().uuid().optional().nullable(),
  type: z.enum(['exchange', 'deposit', 'withdrawal']).default('exchange'),
  sourceCurrencyCode: z.string().optional(),
  destCurrencyCode: z.string().optional(),
  sourceAmount: z.number().optional(),
  destAmount: z.number().optional(),
  note: z.string().optional(),
  source: z.enum(['whatsapp', 'app', 'web']).default('whatsapp'),
  metadata: z.record(z.any()).default({}),
});
export default async function(app, _opts) {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requireAgency);
  app.get('/', async (req) => {
    const { rows } = await app.pg.query('SELECT * FROM remote_orders WHERE agency_id = $1 ORDER BY created_at DESC', [req.agencyId]);
    return { success: true, data: rows };
  });
  app.post('/', async (req, reply) => {
    const b = schema.parse(req.body);
    const { rows } = await app.pg.query('INSERT INTO remote_orders (agency_id, customer_id, customer_phone, customer_name, type, source_currency_code, dest_currency_code, source_amount, dest_amount, note, source, metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *', [req.agencyId, b.customerId || null, b.customerPhone || null, b.customerName || null, b.type, b.sourceCurrencyCode || null, b.destCurrencyCode || null, b.sourceAmount || null, b.destAmount || null, b.note || null, b.source, JSON.stringify(b.metadata)]);
    return reply.status(201).send({ success: true, data: rows[0] });
  });
  app.put('/:id', async (req, reply) => {
    const b = schema.partial().extend({ status: z.enum(['pending', 'confirmed', 'rejected', 'completed']).optional(), assignedTo: z.string().uuid().optional().nullable() }).parse(req.body);
    const { rows } = await app.pg.query('UPDATE remote_orders SET customer_id = COALESCE($3, customer_id), customer_phone = COALESCE($4, customer_phone), customer_name = COALESCE($5, customer_name), type = COALESCE($6, type), source_currency_code = COALESCE($7, source_currency_code), dest_currency_code = COALESCE($8, dest_currency_code), source_amount = COALESCE($9, source_amount), dest_amount = COALESCE($10, dest_amount), note = COALESCE($11, note), source = COALESCE($12, source), status = COALESCE($13, status), assigned_to = COALESCE($14, assigned_to), updated_at = NOW() WHERE id = $1 AND agency_id = $2 RETURNING *', [req.params.id, req.agencyId, b.customerId || null, b.customerPhone || null, b.customerName || null, b.type || null, b.sourceCurrencyCode || null, b.destCurrencyCode || null, b.sourceAmount || null, b.destAmount || null, b.note || null, b.source || null, b.status || null, b.assignedTo || null]);
    if (rows.length === 0) return reply.status(404).send({ success: false, error: 'Not found' });
    return { success: true, data: rows[0] };
  });
}