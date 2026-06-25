import { z } from 'zod';

const txnSchema = z.object({
  customerId: z.string().uuid().optional().nullable(),
  sourceWalletId: z.string().uuid(),
  destWalletId: z.string().uuid(),
  sourceAmount: z.number().positive(),
  destAmount: z.number().positive(),
  exchangeRate: z.number().positive(),
  fee: z.number().min(0).default(0),
  feeWalletId: z.string().uuid().optional().nullable(),
  profitUsd: z.number().default(0),
  type: z.enum(['exchange', 'deposit', 'withdrawal', 'transfer']).default('exchange'),
  status: z.enum(['draft', 'pending', 'completed', 'cancelled']).default('completed'),
  transactionId: z.string().optional().nullable(),
  receiptText: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
  metadata: z.record(z.any()).default({}),
});

export default async function transactionRoutes(app, opts) {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requireAgency);

  // List
  app.get('/', async (request) => {
    const limit = Math.min(parseInt(request.query.limit || '50', 10), 200);
    const offset = parseInt(request.query.offset || '0', 10);
    const { rows } = await app.pg.query(
      'SELECT * FROM transactions WHERE agency_id = $1 ORDER BY timestamp DESC LIMIT $2 OFFSET $3',
      [request.agencyId, limit, offset]
    );
    return { success: true, data: rows.map(mapTransaction) };
  });

  // Create
  app.post('/', async (request, reply) => {
    const body = txnSchema.parse(request.body);
    const client = await app.pg.connect();
    try {
      await client.query('BEGIN');

      // Optional: update wallet balances if completed
      if (body.status === 'completed') {
        await updateBalances(client, body, request.agencyId);
      }

      const { rows } = await client.query(
        `INSERT INTO transactions (
           agency_id, created_by, customer_id, source_wallet_id, dest_wallet_id,
           source_amount, dest_amount, exchange_rate, fee, fee_wallet_id,
           profit_usd, type, status, transaction_id, receipt_text, note, metadata
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
         RETURNING *`,
        [
          request.agencyId, request.user.id, body.customerId || null, body.sourceWalletId, body.destWalletId,
          body.sourceAmount, body.destAmount, body.exchangeRate, body.fee, body.feeWalletId || null,
          body.profitUsd, body.type, body.status, body.transactionId || null, body.receiptText || null,
          body.note || null, JSON.stringify(body.metadata)
        ]
      );

      await client.query('COMMIT');
      return reply.status(201).send({ success: true, data: mapTransaction(rows[0]) });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });

  // Confirm draft
  app.post('/:id/confirm', async (request, reply) => {
    const client = await app.pg.connect();
    try {
      await client.query('BEGIN');

      const { rows } = await client.query(
        'SELECT * FROM transactions WHERE id = $1 AND agency_id = $2 AND status = $3 FOR UPDATE',
        [request.params.id, request.agencyId, 'draft']
      );
      if (rows.length === 0) return reply.status(404).send({ success: false, error: 'Draft not found' });

      const draft = mapTransaction(rows[0]);
      await updateBalances(client, draft, request.agencyId);

      const update = await client.query(
        "UPDATE transactions SET status = 'completed', updated_at = NOW() WHERE id = $1 RETURNING *",
        [request.params.id]
      );

      await client.query('COMMIT');
      return { success: true, data: mapTransaction(update.rows[0]) };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });
}

async function updateBalances(client, body, agencyId) {
  const sourceAmount = parseFloat(body.sourceAmount);
  const destAmount = parseFloat(body.destAmount);
  const fee = parseFloat(body.fee || 0);

  // Source wallet
  if (body.type === 'exchange' || body.type === 'withdrawal' || body.type === 'transfer') {
    const { rowCount } = await client.query(
      'UPDATE wallets SET balance = balance - $1, updated_at = NOW() WHERE id = $2 AND agency_id = $3 AND balance >= $1',
      [sourceAmount, body.sourceWalletId, agencyId]
    );
    if (rowCount === 0) throw new Error('Insufficient balance in source wallet');
  }

  // Dest wallet
  if (body.type === 'exchange' || body.type === 'deposit' || body.type === 'transfer') {
    await client.query(
      'UPDATE wallets SET balance = balance + $1, updated_at = NOW() WHERE id = $2 AND agency_id = $3',
      [destAmount, body.destWalletId, agencyId]
    );
  }

  // Fee
  if (fee > 0 && body.feeWalletId) {
    await client.query(
      'UPDATE wallets SET balance = balance - $1, updated_at = NOW() WHERE id = $2 AND agency_id = $3 AND balance >= $1',
      [fee, body.feeWalletId, agencyId]
    );
  }
}

function mapTransaction(row) {
  return {
    id: row.id,
    agencyId: row.agency_id,
    createdBy: row.created_by,
    customerId: row.customer_id,
    sourceWalletId: row.source_wallet_id,
    destWalletId: row.dest_wallet_id,
    sourceAmount: parseFloat(row.source_amount),
    destAmount: parseFloat(row.dest_amount),
    exchangeRate: parseFloat(row.exchange_rate),
    fee: parseFloat(row.fee),
    feeWalletId: row.fee_wallet_id,
    profitUsd: parseFloat(row.profit_usd),
    type: row.type,
    status: row.status,
    transactionId: row.transaction_id,
    receiptText: row.receipt_text,
    note: row.note,
    metadata: row.metadata,
    timestamp: row.timestamp,
    createdAt: row.created_at,
  };
}
