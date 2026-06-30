import { z } from 'zod';
const schema = z.object({
  sourceWalletId: z.string().uuid(),
  destAgencyId: z.string().uuid(),
  destWalletId: z.string().uuid().optional().nullable(),
  amount: z.number().positive(),
  currencyCode: z.string().min(2).max(3),
  fee: z.number().min(0).default(0),
  reference: z.string().optional(),
  note: z.string().optional(),
});
export default async function(app, _opts) {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requireAgency);
  app.addHook('preHandler', app.requireAccess);
  app.get('/', async (req) => {
    const { rows } = await app.pg.query('SELECT * FROM transfers WHERE agency_id = $1 OR dest_agency_id = $1 ORDER BY created_at DESC', [req.agencyId]);
    return { success: true, data: rows };
  });
  app.post('/', async (req, reply) => {
    const b = schema.parse(req.body);
    const client = await app.pg.connect();
    try {
      await client.query('BEGIN');
      const { rowCount } = await client.query('UPDATE wallets SET balance = balance - $1 WHERE id = $2 AND agency_id = $3 AND balance >= $1', [b.amount + b.fee, b.sourceWalletId, req.agencyId]);
      if (rowCount === 0) throw new Error('Insufficient balance');
      const { rows } = await client.query('INSERT INTO transfers (agency_id, source_wallet_id, dest_agency_id, dest_wallet_id, amount, currency_code, fee, reference, note, initiated_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *', [req.agencyId, b.sourceWalletId, b.destAgencyId, b.destWalletId || null, b.amount, b.currencyCode, b.fee, b.reference || null, b.note || null, req.user.id]);
      await client.query('COMMIT');
      return reply.status(201).send({ success: true, data: rows[0] });
    } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  });
  app.post('/:id/complete', async (req, reply) => {
    const client = await app.pg.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query('SELECT * FROM transfers WHERE id = $1 AND (agency_id = $2 OR dest_agency_id = $2) AND status = $3 FOR UPDATE', [req.params.id, req.agencyId, 'pending']);
      if (rows.length === 0) return reply.status(404).send({ success: false, error: 'Transfer not found' });
      const t = rows[0];
      if (t.dest_wallet_id) {
        await client.query('UPDATE wallets SET balance = balance + $1 WHERE id = $2', [t.amount, t.dest_wallet_id]);
      }
      const { rows: updated } = await client.query("UPDATE transfers SET status = 'completed', completed_by = $2, updated_at = NOW() WHERE id = $1 RETURNING *", [t.id, req.user.id]);
      await client.query('COMMIT');
      return { success: true, data: updated[0] };
    } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  });
}