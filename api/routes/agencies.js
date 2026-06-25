export default async function(app, _opts) {
  app.addHook('preHandler', app.authenticate);
  app.get('/', async (req) => {
    if (req.user.role !== 'superadmin') return { success: false, error: 'Forbidden' };
    const { rows } = await app.pg.query('SELECT * FROM agencies ORDER BY created_at DESC');
    return { success: true, data: rows.map(r => ({ id: r.id, name: r.name, slug: r.slug, email: r.email, phone: r.phone, isActive: r.is_active, createdAt: r.created_at })) };
  });
  app.get('/mine', async (req) => {
    if (!req.user.agency_id) return { success: false, error: 'No agency' };
    const { rows } = await app.pg.query('SELECT * FROM agencies WHERE id = $1 LIMIT 1', [req.user.agency_id]);
    return { success: true, data: rows[0] ? { id: rows[0].id, name: rows[0].name, slug: rows[0].slug, currencyCode: rows[0].currency_code, settings: rows[0].settings } : null };
  });
  app.put('/mine', async (req, reply) => {
    const b = req.body;
    const { rows } = await app.pg.query('UPDATE agencies SET name = COALESCE($2, name), phone = COALESCE($3, phone), address = COALESCE($4, address), settings = COALESCE($5, settings), updated_at = NOW() WHERE id = $1 RETURNING *', [req.user.agency_id, b.name || null, b.phone || null, b.address || null, b.settings ? JSON.stringify(b.settings) : null]);
    return { success: true, data: rows[0] };
  });
}