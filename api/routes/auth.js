import bcrypt from 'bcrypt';
import { z } from 'zod';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  agencyName: z.string().min(2).optional(),
});

export default async function authRoutes(app, opts) {
  // Register
  app.post('/register', async (request, reply) => {
    const body = registerSchema.parse(request.body);
    const { email, password, firstName, lastName, agencyName } = body;

    const existing = await app.pg.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return reply.status(409).send({ success: false, error: 'Email already registered' });
    }

    const client = await app.pg.connect();
    try {
      await client.query('BEGIN');

      let agencyId = null;
      if (agencyName) {
        const slug = agencyName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        const agencyRes = await client.query(
          `INSERT INTO agencies (name, slug, email, is_active)
           VALUES ($1, $2, $3, true)
           ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
           RETURNING id`,
          [agencyName, `${slug}-${Date.now().toString(36)}`, email]
        );
        agencyId = agencyRes.rows[0].id;
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const userRes = await client.query(
        `INSERT INTO users (email, password_hash, first_name, last_name, role, agency_id, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, true) RETURNING id, email, first_name, last_name, role, agency_id`,
        [email, passwordHash, firstName || '', lastName || '', agencyId ? 'agency_admin' : 'agent', agencyId]
      );

      await client.query('COMMIT');

      const user = userRes.rows[0];
      const token = app.jwt.sign({
        id: user.id,
        email: user.email,
        role: user.role,
        agency_id: user.agency_id,
      });

      reply.setCookie('token', token, { path: '/', httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 7 * 86400 });
      return { success: true, user: mapUser(user), token };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });

  // Login
  app.post('/login', async (request, reply) => {
    const { email, password } = loginSchema.parse(request.body);

    const result = await app.pg.query(
      'SELECT id, email, password_hash, first_name, last_name, role, agency_id, is_active FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return reply.status(401).send({ success: false, error: 'Invalid credentials' });
    }

    const user = result.rows[0];
    if (!user.is_active) {
      return reply.status(403).send({ success: false, error: 'Account disabled' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return reply.status(401).send({ success: false, error: 'Invalid credentials' });
    }

    await app.pg.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

    const token = app.jwt.sign({
      id: user.id,
      email: user.email,
      role: user.role,
      agency_id: user.agency_id,
    });

    reply.setCookie('token', token, { path: '/', httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 7 * 86400 });
    return { success: true, user: mapUser(user), token };
  });

  // Me
  app.get('/me', { preHandler: [app.authenticate] }, async (request) => {
    const result = await app.pg.query(
      'SELECT id, email, first_name, last_name, role, agency_id, is_active, created_at FROM users WHERE id = $1',
      [request.user.id]
    );
    if (result.rows.length === 0) {
      return { success: false, error: 'User not found' };
    }
    return { success: true, user: mapUser(result.rows[0]) };
  });

  // Logout
  app.post('/logout', async (request, reply) => {
    reply.clearCookie('token', { path: '/' });
    return { success: true };
  });
}

function mapUser(row) {
  return {
    id: row.id,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    role: row.role,
    agencyId: row.agency_id,
    isActive: row.is_active,
    createdAt: row.created_at,
  };
}
