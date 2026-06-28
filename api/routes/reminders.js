import { z } from 'zod';

const reminderSchema = z.object({
  customer_id: z.string().uuid().optional().nullable(),
  loan_id: z.string().uuid().optional().nullable(),
  template_id: z.string().uuid().optional().nullable(),
  scenario: z.string().optional().nullable(),
  content: z.string().optional().nullable(),
  trigger_source: z.enum(['manual', 'voice']).default('manual'),
  status: z.enum(['sent', 'failed', 'queued']).default('sent'),
  provider_message_id: z.string().optional().nullable(),
  error_reason: z.string().optional().nullable(),
});

export default async function reminderRoutes(app) {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requireAgency);

  app.get('/', async (request) => {
    const { rows } = await app.pg.query(
      'SELECT * FROM reminder_history WHERE agency_id = $1 ORDER BY created_at DESC',
      [request.agencyId]
    );
    return { success: true, data: rows };
  });

  // Journalise une relance (best-effort côté appelant).
  app.post('/', async (request, reply) => {
    const b = reminderSchema.parse(request.body);
    const { rows } = await app.pg.query(
      `INSERT INTO reminder_history
         (agency_id, customer_id, loan_id, template_id, scenario, content, trigger_source, status, provider_message_id, error_reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [
        request.agencyId, b.customer_id || null, b.loan_id || null, b.template_id || null,
        b.scenario || null, b.content || null, b.trigger_source, b.status,
        b.provider_message_id || null, b.error_reason || null,
      ]
    );
    return reply.status(201).send({ success: true, data: rows[0] });
  });
}
