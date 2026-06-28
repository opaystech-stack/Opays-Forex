import { z } from 'zod';
import { recomputeTransactionAmounts } from '../lib/transactionCompute.js';

const txnSchema = z.object({
  customerId: z.string().uuid().optional().nullable(),
  sourceWalletId: z.string().uuid(),
  destWalletId: z.string().uuid(),
  sourceAmount: z.number().positive(),
  // dest_amount / profit_usd sont DÉRIVÉS côté serveur (R4/R5) : tolérés en
  // entrée mais jamais insérés tels quels.
  destAmount: z.number().optional().nullable(),
  exchangeRate: z.number().positive(),
  serviceRate: z.number().min(0).max(100).optional().default(0),
  fee: z.number().min(0).default(0),
  feeWalletId: z.string().uuid().optional().nullable(),
  profitUsd: z.number().optional().nullable(),
  type: z.enum(['exchange', 'deposit', 'withdrawal', 'transfer']).default('exchange'),
  status: z.enum(['draft', 'pending', 'completed', 'cancelled']).default('completed'),
  transactionId: z.string().optional().nullable(),
  receiptText: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
  metadata: z.record(z.any()).default({}),
});

const confirmSchema = z.object({
  exchangeRate: z.number().positive().optional(),
  serviceRate: z.number().min(0).max(100).optional(),
}).optional();

// Recalcule les grandeurs financières d'une opération à partir des devises des
// portefeuilles et des taux de référence de l'agence. Lève une erreur 400 si le
// recalcul échoue (taux invalides, bornes de service…). Cœur de R4/R5.
async function recomputeForAgency(client, op, agencyId) {
  const { rows: wrows } = await client.query(
    'SELECT id, currency_code FROM wallets WHERE agency_id = $1 AND id = ANY($2::uuid[])',
    [agencyId, [op.sourceWalletId, op.destWalletId]]
  );
  const currencyByWallet = Object.fromEntries(wrows.map((w) => [w.id, w.currency_code]));

  const { rows: crows } = await client.query(
    'SELECT code, rate_to_usd FROM currencies WHERE agency_id = $1',
    [agencyId]
  );
  const rates = crows.map((c) => ({ currency: c.code, rate_to_usd: Number(c.rate_to_usd) }));

  const result = recomputeTransactionAmounts(
    {
      type: op.type,
      sourceAmount: Number(op.sourceAmount),
      destAmount: op.destAmount == null ? null : Number(op.destAmount),
      exchangeRate: Number(op.exchangeRate),
      serviceRate: Number(op.serviceRate || 0),
      sourceCurrency: currencyByWallet[op.sourceWalletId],
      destCurrency: currencyByWallet[op.destWalletId],
    },
    rates
  );
  if (!result.ok) {
    const err = new Error(result.error);
    err.statusCode = 400;
    throw err;
  }
  return result;
}

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

  // Create — les montants financiers sont RECALCULÉS côté serveur (R4/R5).
  app.post('/', async (request, reply) => {
    const body = txnSchema.parse(request.body);
    const client = await app.pg.connect();
    try {
      await client.query('BEGIN');

      const computed = await recomputeForAgency(client, body, request.agencyId);

      // Mise à jour des soldes uniquement si l'opération est complétée, avec le
      // dest_amount RECALCULÉ (jamais celui fourni par le client).
      if (body.status === 'completed') {
        await updateBalances(client, { ...body, destAmount: computed.destAmount }, request.agencyId);
      }

      const { rows } = await client.query(
        `INSERT INTO transactions (
           agency_id, created_by, customer_id, source_wallet_id, dest_wallet_id,
           source_amount, dest_amount, exchange_rate, fee, fee_wallet_id,
           profit_usd, service_amount, type, status, transaction_id, receipt_text, note, metadata
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
         RETURNING *`,
        [
          request.agencyId, request.user.id, body.customerId || null, body.sourceWalletId, body.destWalletId,
          body.sourceAmount, computed.destAmount, computed.exchangeRate, body.fee, body.feeWalletId || null,
          computed.profitUsd, computed.serviceAmount, body.type, body.status, body.transactionId || null,
          body.receiptText || null, body.note || null, JSON.stringify(body.metadata)
        ]
      );

      await client.query('COMMIT');
      return reply.status(201).send({ success: true, data: mapTransaction(rows[0]) });
    } catch (err) {
      await client.query('ROLLBACK');
      if (err.statusCode === 400) return reply.status(400).send({ success: false, error: err.message });
      throw err;
    } finally {
      client.release();
    }
  });

  // Confirm draft — accepte un payload de taux réajustés par l'opérateur et
  // RECALCULE les montants côté serveur avant d'impacter les soldes (R4/R5).
  app.post('/:id/confirm', async (request, reply) => {
    const payload = confirmSchema.parse(request.body) || {};
    const client = await app.pg.connect();
    try {
      await client.query('BEGIN');

      const { rows } = await client.query(
        'SELECT * FROM transactions WHERE id = $1 AND agency_id = $2 AND status = $3 FOR UPDATE',
        [request.params.id, request.agencyId, 'draft']
      );
      if (rows.length === 0) return reply.status(404).send({ success: false, error: 'Draft not found' });

      const draft = mapTransaction(rows[0]);
      const computed = await recomputeForAgency(
        client,
        {
          type: draft.type,
          sourceWalletId: draft.sourceWalletId,
          destWalletId: draft.destWalletId,
          sourceAmount: draft.sourceAmount,
          destAmount: draft.destAmount,
          exchangeRate: payload.exchangeRate != null ? payload.exchangeRate : draft.exchangeRate,
          serviceRate: payload.serviceRate != null ? payload.serviceRate : 0,
        },
        request.agencyId
      );

      await updateBalances(client, { ...draft, destAmount: computed.destAmount }, request.agencyId);

      const update = await client.query(
        `UPDATE transactions
           SET status = 'completed', dest_amount = $2, exchange_rate = $3,
               profit_usd = $4, service_amount = $5, updated_at = NOW()
         WHERE id = $1 RETURNING *`,
        [request.params.id, computed.destAmount, computed.exchangeRate, computed.profitUsd, computed.serviceAmount]
      );

      await client.query('COMMIT');
      return { success: true, data: mapTransaction(update.rows[0]) };
    } catch (err) {
      await client.query('ROLLBACK');
      if (err.statusCode === 400) return reply.status(400).send({ success: false, error: err.message });
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
    serviceAmount: row.service_amount != null ? parseFloat(row.service_amount) : 0,
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
