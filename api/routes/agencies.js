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
    const r = rows[0];
    // On expose owner_id et un `state` (derive de is_active) car le client en a
    // besoin pour deriver le role Proprietaire_Agence et l'etat de l'agence
    // (AgencyGate / permissions). Sans owner_id ni state, le menu et les droits
    // restaient vides en mode API.
    return {
      success: true,
      data: r
        ? {
            id: r.id,
            name: r.name,
            slug: r.slug,
            owner_id: r.owner_id,
            state: r.is_active === false ? 'suspendue' : 'active',
            currencyCode: r.currency_code,
            settings: r.settings,
          }
        : null,
    };
  });
  app.get('/my-list', async (req) => {
    const { rows } = await app.pg.query(
      `SELECT DISTINCT a.* FROM agencies a
       LEFT JOIN users u ON u.agency_id = a.id
       WHERE a.id = $1 OR a.owner_id = $1 OR u.id = $1
       ORDER BY a.created_at DESC`,
      [req.user.id]
    );
    return { success: true, data: rows.map(r => ({ id: r.id, name: r.name, slug: r.slug, isActive: r.is_active, createdAt: r.created_at })) };
  });
  app.put('/mine', async (req, reply) => {
    const b = req.body;
    const { rows } = await app.pg.query('UPDATE agencies SET name = COALESCE($2, name), phone = COALESCE($3, phone), address = COALESCE($4, address), settings = COALESCE($5, settings), updated_at = NOW() WHERE id = $1 RETURNING *', [req.user.agency_id, b.name || null, b.phone || null, b.address || null, b.settings ? JSON.stringify(b.settings) : null]);
    return { success: true, data: rows[0] };
  });

  // DELETE /agencies/:id — supprimer une agence (propriétaire ou superadmin)
  app.delete('/:id', async (req, reply) => {
    const { id } = req.params;
    // Vérifier que l'utilisateur est propriétaire de l'agence ou superadmin
    const { rows: check } = await app.pg.query('SELECT owner_id FROM agencies WHERE id = $1 LIMIT 1', [id]);
    if (!check.length) return reply.code(404).send({ success: false, error: 'Agence introuvable' });
    if (check[0].owner_id !== req.user.id && req.user.role !== 'superadmin') {
      return reply.code(403).send({ success: false, error: 'Non autorisé' });
    }
    // Supprimer les données liées à l'agence
    await app.pg.query('DELETE FROM wallets WHERE agency_id = $1', [id]);
    await app.pg.query('DELETE FROM transactions WHERE agency_id = $1', [id]);
    await app.pg.query('DELETE FROM expenses WHERE agency_id = $1', [id]);
    await app.pg.query('DELETE FROM loans WHERE agency_id = $1', [id]);
    await app.pg.query('DELETE FROM debts WHERE agency_id = $1', [id]);
    await app.pg.query('DELETE FROM customers WHERE agency_id = $1', [id]);
    await app.pg.query('DELETE FROM agency_members WHERE agency_id = $1', [id]);
    await app.pg.query('DELETE FROM agency_invitations WHERE agency_id = $1', [id]);
    await app.pg.query('DELETE FROM module_states WHERE agency_id = $1', [id]);
    await app.pg.query('DELETE FROM module_entitlements WHERE agency_id = $1', [id]);
    await app.pg.query('DELETE FROM transfer_methods WHERE agency_id = $1', [id]);
    await app.pg.query('DELETE FROM subscription_providers WHERE agency_id = $1', [id]);
    await app.pg.query('DELETE FROM transfers WHERE agency_id = $1', [id]);
    await app.pg.query('DELETE FROM subscriptions WHERE agency_id = $1', [id]);
    await app.pg.query('DELETE FROM flight_bookings WHERE agency_id = $1', [id]);
    await app.pg.query('DELETE FROM remote_orders WHERE agency_id = $1', [id]);
    await app.pg.query('DELETE FROM order_links WHERE agency_id = $1', [id]);
    // Supprimer l'agence elle-même
    await app.pg.query('DELETE FROM agencies WHERE id = $1', [id]);
    return { success: true };
  });
}
