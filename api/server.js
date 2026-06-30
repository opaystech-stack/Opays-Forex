import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
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
import debtRoutes from './routes/debts.js';
import rateRoutes from './routes/rates.js';
import templateRoutes from './routes/templates.js';
import reminderRoutes from './routes/reminders.js';
import moduleRoutes from './routes/modules.js';
import flightBookingRoutes from './routes/flight-bookings.js';
import uploadRoutes from './routes/uploads.js';
import orderLinkRoutes from './routes/order-links.js';
import transferMethodRoutes from './routes/transfer-methods.js';
import subscriptionProviderRoutes from './routes/subscription-providers.js';
import invitationRoutes from './routes/invitations.js';
import { resolveTenant } from './lib/tenant.js';
import { computeAccessVerdict } from './lib/access.js';

// --- Durcissement : validation des secrets critiques au démarrage (R3) ------
// Le serveur REFUSE de démarrer si un secret critique est absent ou laissé à
// une valeur par défaut non sécurisée. Générez des secrets forts, par ex. :
//   openssl rand -hex 32
const INSECURE_DEFAULTS = new Set([
  '',
  'change-me',
  'change-me-please',
  'changeme',
  'secret',
]);

function requireSecret(name) {
  const value = process.env[name];
  if (!value || INSECURE_DEFAULTS.has(value.trim())) {
    console.error(
      `[FATAL] La variable d'environnement ${name} est manquante ou utilise une ` +
      `valeur par défaut non sécurisée. Définissez un secret fort ` +
      `(ex. "openssl rand -hex 32") avant de démarrer le serveur.`
    );
    process.exit(1);
  }
  return value;
}

const JWT_SECRET = requireSecret('JWT_SECRET');
const COOKIE_SECRET = requireSecret('COOKIE_SECRET');

if (!process.env.DATABASE_URL) {
  console.error("[FATAL] La variable d'environnement DATABASE_URL est manquante.");
  process.exit(1);
}

const app = Fastify({
  logger: { level: process.env.NODE_ENV === 'production' ? 'warn' : 'info' },
  trustProxy: true,
});

// CORS : liste blanche stricte définie par CORS_ORIGIN (valeurs séparées par
// des virgules). Aucune origine n'est reflétée dynamiquement (R3). Les requêtes
// sans en-tête Origin (same-origin, outils serveur) restent autorisées.
const allowedOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

if (allowedOrigins.length === 0) {
  console.warn(
    '[WARN] CORS_ORIGIN est vide : aucune origine cross-site ne sera autorisée. ' +
    'Définissez CORS_ORIGIN (ex. "https://app.exemple.com") pour le front déployé.'
  );
}

await app.register(cors, {
  origin(origin, cb) {
    if (!origin || allowedOrigins.includes(origin)) {
      return cb(null, true);
    }
    return cb(new Error('Origine non autorisée par la politique CORS'), false);
  },
  credentials: true,
});

// Cookies : secret validé + attributs de sécurité (httpOnly, secure en prod,
// sameSite) appliqués aux cookies de session (R3).
await app.register(cookie, {
  secret: COOKIE_SECRET,
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
  secret: JWT_SECRET,
  cookie: {
    cookieName: 'token',
    signed: false,
  },
});

// Multipart (téléversement de fichiers, limite 5 Mo) — L4
await app.register(multipart, {
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
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

// Tenant middleware — délègue à la logique pure `resolveTenant` (testable,
// verrou d'isolation R1/R2).
app.decorate('requireAgency', async (request, reply) => {
  const result = resolveTenant(request.user, request.headers);
  if (!result.ok) {
    return reply.status(result.status).send({ success: false, error: result.error });
  }
  request.agencyId = result.agencyId;
});

// Access middleware (auth-access-mobile-fixes Z4) — impose l'essai 30 jours et
// l'accès payant CÔTÉ SERVEUR sur les routes de données sensibles. Le verdict
// est calculé à partir de `created_at`/`paid_access` de foxdb (non falsifiable
// côté client) ; un essai expiré sans accès payant est refusé en HTTP 402
// (Payment Required). Complète, sans le remplacer, le verrou `requireAgency`.
app.decorate('requireAccess', async (request, reply) => {
  // Un superadmin (Editeur_Plateforme) n'est jamais soumis à l'essai.
  if (request.user?.role === 'superadmin') return;
  try {
    const { rows } = await app.pg.query(
      'SELECT created_at, paid_access, paid_access_until FROM users WHERE id = $1',
      [request.user.id]
    );
    if (rows.length === 0) {
      return reply.status(401).send({ success: false, error: 'Unauthorized' });
    }
    const { accessGranted } = computeAccessVerdict({
      createdAt: rows[0].created_at,
      paidAccess: rows[0].paid_access ?? false,
      paidAccessUntil: rows[0].paid_access_until ?? null,
    });
    if (!accessGranted) {
      return reply.status(402).send({
        success: false,
        error: 'Trial expired',
        code: 'trial_expired',
      });
    }
  } catch (err) {
    app.log.error(err);
    return reply.status(500).send({ success: false, error: 'Access check failed' });
  }
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
await app.register(debtRoutes, { prefix: '/api/debts' });
await app.register(rateRoutes, { prefix: '/api/rates' });
await app.register(templateRoutes, { prefix: '/api/templates' });
await app.register(reminderRoutes, { prefix: '/api/reminders' });
await app.register(moduleRoutes, { prefix: '/api/modules' });
await app.register(flightBookingRoutes, { prefix: '/api/flight-bookings' });
await app.register(uploadRoutes, { prefix: '/api/uploads' });
await app.register(orderLinkRoutes, { prefix: '/api/order-links' });
await app.register(transferMethodRoutes, { prefix: '/api/transfer-methods' });
await app.register(subscriptionProviderRoutes, { prefix: '/api/subscription-providers' });
await app.register(invitationRoutes, { prefix: '/api/invitations' });

const port = process.env.PORT || 3001;
const host = process.env.HOST || '0.0.0.0';

try {
  await app.listen({ port, host });
  console.log(`OpaysFox API listening on ${host}:${port}`);
} catch (err) {
  console.error(err);
  process.exit(1);
}
