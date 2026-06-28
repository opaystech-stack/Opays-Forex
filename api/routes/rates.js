import { z } from 'zod';

// Taux de change de référence : adossés à la table `currencies` (par agence).
// Le front consomme [{ currency, rate_to_usd }].
const ratesSchema = z.object({
  rates: z.array(
    z.object({
      currency: z.string().min(2).max(8),
      rate_to_usd: z.number().positive(),
      name: z.string().optional(),
      symbol: z.string().optional(),
    })
  ),
});

export default async function rateRoutes(app) {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requireAgency);

  app.get('/', async (request) => {
    const { rows } = await app.pg.query(
      'SELECT code, name, symbol, rate_to_usd FROM currencies WHERE agency_id = $1 ORDER BY code',
      [request.agencyId]
    );
    const data = rows.map((r) => ({
      currency: r.code,
      name: r.name,
      symbol: r.symbol,
      rate_to_usd: Number(r.rate_to_usd),
    }));
    return { success: true, data };
  });

  // Upsert d'un lot de taux (par agence). Conserve l'isolation : agency_id figé.
  app.put('/', async (request, reply) => {
    const { rates } = ratesSchema.parse(request.body);
    const client = await app.pg.connect();
    try {
      await client.query('BEGIN');
      for (const r of rates) {
        await client.query(
          `INSERT INTO currencies (agency_id, code, name, symbol, rate_to_usd, is_active)
           VALUES ($1, $2, $3, $4, $5, true)
           ON CONFLICT (agency_id, code)
           DO UPDATE SET rate_to_usd = EXCLUDED.rate_to_usd, updated_at = NOW()`,
          [request.agencyId, r.currency, r.name || r.currency, r.symbol || null, r.rate_to_usd]
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    return reply.send({ success: true });
  });
}
