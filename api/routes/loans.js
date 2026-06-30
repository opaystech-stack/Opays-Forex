import { z } from 'zod';
const schema = z.object({
  customerId: z.string().uuid(),
  walletId: z.string().uuid(),
  amount: z.number().positive(),
  currencyCode: z.string().min(2).max(3),
  interestRate: z.number().min(0).default(0),
  dueDate: z.string().optional(),
  note: z.string().optional(),
});
export default async function(app, _opts) {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requireAgency);
  app.addHook('preHandler', app.requireAccess);
  app.get('/', async (req) => {
    const { rows } = await app.pg.query('SELECT * FROM loans WHERE agency_id = $1 ORDER BY created_at DESC', [req.agencyId]);
    return { success: true, data: rows };
  });
  app.post('/', async (req, reply) => {
    const b = schema.parse(req.body);
    const client = await app.pg.connect();
    try {
      await client.query('BEGIN');
      const { rowCount } = await client.query('UPDATE wallets SET balance = balance - $1 WHERE id = $2 AND agency_id = $3 AND balance >= $1', [b.amount, b.walletId, req.agencyId]);
      if (rowCount === 0) throw new Error('Insufficient balance');
      const { rows } = await client.query('INSERT INTO loans (agency_id, customer_id, wallet_id, amount, currency_code, interest_rate, due_date, note) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *', [req.agencyId, b.customerId, b.walletId, b.amount, b.currencyCode, b.interestRate, b.dueDate || null, b.note || null]);
      await client.query('COMMIT');
      return reply.status(201).send({ success: true, data: rows[0] });
    } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  });
  app.put('/:id', async (req, reply) => {
    const b = schema.partial().extend({ status: z.enum(['pending', 'active', 'repaid', 'defaulted']).optional() }).parse(req.body);
    const { rows } = await app.pg.query('UPDATE loans SET customer_id = COALESCE($3, customer_id), wallet_id = COALESCE($4, wallet_id), amount = COALESCE($5, amount), currency_code = COALESCE($6, currency_code), interest_rate = COALESCE($7, interest_rate), due_date = COALESCE($8, due_date), status = COALESCE($9, status), note = COALESCE($10, note), updated_at = NOW() WHERE id = $1 AND agency_id = $2 RETURNING *', [req.params.id, req.agencyId, b.customerId || null, b.walletId || null, b.amount || null, b.currencyCode || null, b.interestRate || null, b.dueDate || null, b.status || null, b.note || null]);
    if (rows.length === 0) return reply.status(404).send({ success: false, error: 'Not found' });
    return { success: true, data: rows[0] };
  });
}