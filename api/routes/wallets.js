import { z } from 'zod';

const walletSchema = z.object({
  name: z.string().min(1),
  currencyCode: z.string().min(2).max(3),
  type: z.enum(['cash', 'mobile_money', 'bank', 'crypto']).default('cash'),
  balance: z.number().min(0).default(0),
  provider: z.string().optional(),
  accountNumber: z.string().optional(),
});

export default async function walletRoutes(app, opts) {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requireAgency);
  app.addHook('preHandler', app.requireAccess);

  // List
  app.get('/', async (request) => {
    const { rows } = await app.pg.query(
      'SELECT * FROM wallets WHERE agency_id = $1 ORDER BY name',
      [request.agencyId]
    );
    return { success: true, data: rows.map(mapWallet) };
  });

  // Create
  app.post('/', async (request, reply) => {
    const body = walletSchema.parse(request.body);
    const { rows } = await app.pg.query(
      `INSERT INTO wallets (agency_id, name, currency_code, type, balance, provider, account_number)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [request.agencyId, body.name, body.currencyCode, body.type, body.balance, body.provider || null, body.accountNumber || null]
    );
    return reply.status(201).send({ success: true, data: mapWallet(rows[0]) });
  });

  // Get one
  app.get('/:id', async (request, reply) => {
    const { rows } = await app.pg.query(
      'SELECT * FROM wallets WHERE id = $1 AND agency_id = $2 LIMIT 1',
      [request.params.id, request.agencyId]
    );
    if (rows.length === 0) return reply.status(404).send({ success: false, error: 'Wallet not found' });
    return { success: true, data: mapWallet(rows[0]) };
  });

  // Update
  app.put('/:id', async (request, reply) => {
    const body = walletSchema.partial().parse(request.body);
    const fields = [];
    const values = [];
    let idx = 1;

    for (const [key, val] of Object.entries(body)) {
      if (val !== undefined) {
        const col = camelToSnake(key);
        fields.push(`${col} = $${idx}`);
        values.push(val);
        idx++;
      }
    }
    if (fields.length === 0) return reply.status(400).send({ success: false, error: 'No fields to update' });

    values.push(request.params.id, request.agencyId);
    const { rows } = await app.pg.query(
      `UPDATE wallets SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${idx} AND agency_id = $${idx + 1} RETURNING *`,
      values
    );
    if (rows.length === 0) return reply.status(404).send({ success: false, error: 'Wallet not found' });
    return { success: true, data: mapWallet(rows[0]) };
  });

  // Delete
  app.delete('/:id', async (request, reply) => {
    const { rowCount } = await app.pg.query(
      'DELETE FROM wallets WHERE id = $1 AND agency_id = $2',
      [request.params.id, request.agencyId]
    );
    if (rowCount === 0) return reply.status(404).send({ success: false, error: 'Wallet not found' });
    return { success: true };
  });
}

function mapWallet(row) {
  return {
    id: row.id,
    agencyId: row.agency_id,
    name: row.name,
    currencyCode: row.currency_code,
    type: row.type,
    balance: parseFloat(row.balance),
    provider: row.provider,
    accountNumber: row.account_number,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function camelToSnake(str) {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}
