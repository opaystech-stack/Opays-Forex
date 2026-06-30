export default async function(app, _opts) {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requireAgency);
  app.addHook('preHandler', app.requireAccess);
  app.get('/summary', async (req) => {
    const agencyId = req.agencyId;
    const [wallets, txns, customers, pendingTransfers, pendingOrders, openTickets] = await Promise.all([
      app.pg.query('SELECT currency_code, SUM(balance) as total FROM wallets WHERE agency_id = $1 GROUP BY currency_code', [agencyId]),
      app.pg.query("SELECT COUNT(*) as count, COALESCE(SUM(profit_usd),0) as profit FROM transactions WHERE agency_id = $1 AND status = 'completed' AND timestamp >= NOW() - INTERVAL '30 days'", [agencyId]),
      app.pg.query('SELECT COUNT(*) as count FROM customers WHERE agency_id = $1', [agencyId]),
      app.pg.query("SELECT COUNT(*) as count FROM transfers WHERE (agency_id = $1 OR dest_agency_id = $1) AND status = 'pending'", [agencyId]),
      app.pg.query("SELECT COUNT(*) as count FROM remote_orders WHERE agency_id = $1 AND status = 'pending'", [agencyId]),
      app.pg.query("SELECT COUNT(*) as count FROM tickets WHERE agency_id = $1 AND status IN ('open', 'in_progress')", [agencyId]),
    ]);
    return {
      success: true,
      data: {
        walletTotals: wallets.rows,
        monthlyTransactions: parseInt(txns.rows[0].count, 10),
        monthlyProfitUsd: parseFloat(txns.rows[0].profit),
        customerCount: parseInt(customers.rows[0].count, 10),
        pendingTransfers: parseInt(pendingTransfers.rows[0].count, 10),
        pendingOrders: parseInt(pendingOrders.rows[0].count, 10),
        openTickets: parseInt(openTickets.rows[0].count, 10),
      }
    };
  });
}