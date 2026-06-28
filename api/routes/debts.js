import { z } from 'zod';

// Corps en snake_case pour coller au record déjà construit côté front.
const debtSchema = z.object({
  type: z.enum(['receivable', 'payable']),
  counterparty_name: z.string().optional().nullable(),
  amount: z.number().positive(),
  currency: z.string().min(2).max(8),
  note: z.string().optional().nullable(),
});

const statusSchema = z.object({ status: z.enum(['pending', 'settled']) });

export default async function debtRoutes(app) {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requireAgency);

  app.get('/', async (request) => {
    const { rows } = await app.pg.query(
      'SELECT * FROM debts WHERE agency_id = $1 ORDER BY created_at DESC',
      [request.agencyId]
    );
    return { success: true, data: rows };
  });

  app.post('/', async (request, reply) => {
    const body = debtSchema.parse(request.body);
    const { rows } = await app.pg.query(
      `INSERT INTO debts (agency_id, type, counterparty_name, amount, currency, note, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7) RETURNING *`,
      [request.agencyId, body.type, body.counterparty_name || null, body.amount, body.currency, body.note || null, request.user.id]
    );
    return reply.status(201).send({ success: true, data: rows[0] });
  });

  // Mise à jour de statut ('settled' renseigne settled_at, idempotent).
  app.put('/:id/status', async (request, reply) => {
    const { status } = statusSchema.parse(request.body);
    const settledAt = status === 'settled' ? new Date().toISOString() : null;
    const { rows } = await app.pg.query(
      `UPDATE debts SET status = $1, settled_at = $2 WHERE id = $3 AND agency_id = $4 RETURNING *`,
      [status, settledAt, request.params.id, request.agencyId]
    );
    if (rows.length === 0) return reply.status(404).send({ success: false, error: 'Debt not found' });
    return { success: true, data: rows[0] };
  });
}
