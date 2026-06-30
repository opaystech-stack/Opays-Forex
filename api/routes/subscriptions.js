import { z } from 'zod';
const schema = z.object({
  customerId: z.string().uuid().optional().nullable(),
  planName: z.string().min(1),
  amount: z.number().positive(),
  currencyCode: z.string().min(2).max(3),
  frequency: z.enum(['daily', 'weekly', 'monthly', 'yearly']).default('monthly'),
  nextBillingDate: z.string(),
  walletId: z.string().uuid().optional().nullable(),
});
export default async function(app, _opts) {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requireAgency);
  app.addHook('preHandler', app.requireAccess);
  app.get('/', async (req) => {
    const { rows } = await app.pg.query('SELECT * FROM subscriptions WHERE agency_id = $1 ORDER BY next_billing_date', [req.agencyId]);
    return { success: true, data: rows };
  });
  app.post('/', async (req, reply) => {
    const b = schema.parse(req.body);
    const { rows } = await app.pg.query('INSERT INTO subscriptions (agency_id, customer_id, plan_name, amount, currency_code, frequency, next_billing_date, wallet_id, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *', [req.agencyId, b.customerId || null, b.planName, b.amount, b.currencyCode, b.frequency, b.nextBillingDate, b.walletId || null, req.user.id]);
    return reply.status(201).send({ success: true, data: rows[0] });
  });
  app.put('/:id', async (req, reply) => {
    const b = schema.partial().parse(req.body);
    const { rows } = await app.pg.query('UPDATE subscriptions SET customer_id = COALESCE($3, customer_id), plan_name = COALESCE($4, plan_name), amount = COALESCE($5, amount), currency_code = COALESCE($6, currency_code), frequency = COALESCE($7, frequency), next_billing_date = COALESCE($8, next_billing_date), wallet_id = COALESCE($9, wallet_id), status = COALESCE($10, status), updated_at = NOW() WHERE id = $1 AND agency_id = $2 RETURNING *', [req.params.id, req.agencyId, b.customerId || null, b.planName || null, b.amount || null, b.currencyCode || null, b.frequency || null, b.nextBillingDate || null, b.walletId || null, b.status || null]);
    if (rows.length === 0) return reply.status(404).send({ success: false, error: 'Not found' });
    return { success: true, data: rows[0] };
  });
}