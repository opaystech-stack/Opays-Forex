import { z } from 'zod';

const bookingSchema = z.object({
  customer_id: z.string().uuid().optional().nullable(),
  passenger_name: z.string().optional().nullable(),
  route: z.string().optional().nullable(),
  flight_at: z.string().optional().nullable(),
  amount: z.number().optional().nullable(),
  cost: z.number().optional().nullable(),
  currency: z.string().min(2).max(8).optional().nullable(),
  profit_usd: z.number().optional().nullable(),
  status: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
  metadata: z.record(z.any()).optional().default({}),
});

export default async function flightBookingRoutes(app) {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requireAgency);

  app.get('/', async (request) => {
    const { rows } = await app.pg.query(
      'SELECT * FROM flight_bookings WHERE agency_id = $1 ORDER BY created_at DESC',
      [request.agencyId]
    );
    return { success: true, data: rows };
  });

  app.post('/', async (request, reply) => {
    const b = bookingSchema.parse(request.body);
    const { rows } = await app.pg.query(
      `INSERT INTO flight_bookings
         (agency_id, customer_id, passenger_name, route, flight_at, amount, cost, currency, profit_usd, status, note, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
      [
        request.agencyId, b.customer_id || null, b.passenger_name || null, b.route || null,
        b.flight_at || null, b.amount ?? null, b.cost ?? null, b.currency || null,
        b.profit_usd ?? 0, b.status || 'pending', b.note || null, JSON.stringify(b.metadata || {}),
      ]
    );
    return reply.status(201).send({ success: true, data: rows[0] });
  });
}
