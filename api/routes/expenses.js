import { z } from 'zod';
const schema = z.object({
  walletId: z.string().uuid(),
  amount: z.number().positive(),
  isBusiness: z.boolean().default(true),
  category: z.string().min(1),
  note: z.string().optional(),
  timestamp: z.string().optional(),
});
export default async function(app, _opts) {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requireAgency);
  app.get('/', async (req) => {
    const { rows } = await app.pg.query('SELECT * FROM expenses WHERE agency_id = $1 ORDER BY timestamp DESC', [req.agencyId]);
    return { success: true, data: rows };
  });
  app.post('/', async (req, reply) => {
    const b = schema.parse(req.body);
    const client = await app.pg.connect();
    try {
      await client.query('BEGIN');
      const { rowCount } = await client.query('UPDATE wallets SET balance = balance - $1 WHERE id = $2 AND agency_id = $3 AND balance >= $1', [b.amount, b.walletId, req.agencyId]);
      if (rowCount === 0) throw new Error('Insufficient balance');
      const { rows } = await client.query('INSERT INTO expenses (agency_id, wallet_id, amount, is_business, category, note, created_by, timestamp) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *', [req.agencyId, b.walletId, b.amount, b.isBusiness, b.category, b.note || null, req.user.id, b.timestamp || new Date().toISOString()]);
      await client.query('COMMIT');
      return reply.status(201).send({ success: true, data: rows[0] });
    } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  });
}