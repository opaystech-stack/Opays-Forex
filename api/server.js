import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import pkg from 'pg';
const { Pool } = pkg;
import authRoutes from './routes/auth.js';
import agencyRoutes from './routes/agencies.js';
import walletRoutes from './routes/wallets.js';
import transactionRoutes from './routes/transactions.js';
import customerRoutes from './routes/customers.js';
import employeeRoutes from './routes/employees.js';
import transferRoutes from './routes/transfers.js';
import subscriptionRoutes from './routes/subscriptions.js';
import ticketRoutes from './routes/tickets.js';
import remoteOrderRoutes from './routes/remote-orders.js';
import expenseRoutes from './routes/expenses.js';
import loanRoutes from './routes/loans.js';
import dashboardRoutes from './routes/dashboard.js';

const app = Fastify({
  logger: { level: process.env.NODE_ENV === 'production' ? 'warn' : 'info' },
  trustProxy: true,
});

// CORS
await app.register(cors, {
  origin: process.env.CORS_ORIGIN || true,
  credentials: true,
});

// Cookies
await app.register(cookie, {
  secret: process.env.COOKIE_SECRET || process.env.JWT_SECRET || 'change-me',
  parseOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  },
});

// JWT
await app.register(jwt, {
  secret: process.env.JWT_SECRET || 'change-me-please',
  cookie: {
    cookieName: 'token',
    signed: false,
  },
});

// Database pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});
app.decorate('pg', pool);

// Auth decorator
app.decorate('authenticate', async (request, reply) => {
  try {
    const token = request.cookies.token || request.headers.authorization?.replace('Bearer ', '');
    if (!token) throw new Error('Missing token');
    const decoded = await request.jwtVerify(token);
    request.user = decoded;
  } catch (err) {
    reply.status(401).send({ success: false, error: 'Unauthorized' });
  }
});

// Tenant middleware
app.decorate('requireAgency', async (request, reply) => {
  if (!request.user?.agency_id && request.user?.role !== 'superadmin') {
    return reply.status(403).send({ success: false, error: 'No agency assigned' });
  }
  request.agencyId = request.user.role === 'superadmin'
    ? request.headers['x-agency-id'] || request.user.agency_id
    : request.user.agency_id;
});

// Health check
app.get('/api/health', async () => ({ status: 'ok', time: new Date().toISOString() }));

// Register routes
await app.register(authRoutes, { prefix: '/api/auth' });
await app.register(agencyRoutes, { prefix: '/api/agencies' });
await app.register(walletRoutes, { prefix: '/api/wallets' });
await app.register(transactionRoutes, { prefix: '/api/transactions' });
await app.register(customerRoutes, { prefix: '/api/customers' });
await app.register(employeeRoutes, { prefix: '/api/employees' });
await app.register(transferRoutes, { prefix: '/api/transfers' });
await app.register(subscriptionRoutes, { prefix: '/api/subscriptions' });
await app.register(ticketRoutes, { prefix: '/api/tickets' });
await app.register(remoteOrderRoutes, { prefix: '/api/remote-orders' });
await app.register(expenseRoutes, { prefix: '/api/expenses' });
await app.register(loanRoutes, { prefix: '/api/loans' });
await app.register(dashboardRoutes, { prefix: '/api/dashboard' });

const port = process.env.PORT || 3001;
const host = process.env.HOST || '0.0.0.0';

try {
  await app.listen({ port, host });
  console.log(`OpaysFox API listening on ${host}:${port}`);
} catch (err) {
  console.error(err);
  process.exit(1);
}
