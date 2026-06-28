import {
  isValidRole,
  isValidInvitationEmail,
  INVITATION_EXPIRY_HOURS,
} from '../../src/utils/authorization.js';
import { generateOrderToken } from '../../src/utils/orderToken.js';

export default async function invitationRoutes(app) {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requireAgency);

  app.get('/', async (request) => {
    const { rows } = await app.pg.query(
      'SELECT * FROM agency_invitations WHERE agency_id = $1 ORDER BY created_at DESC',
      [request.agencyId]
    );
    return { success: true, data: rows };
  });

  // Invite un collaborateur (validation pure réutilisée : e-mail + rôle).
  app.post('/', async (request, reply) => {
    const { email, role = 'caissier' } = request.body || {};
    if (!isValidInvitationEmail(email)) {
      return reply.status(400).send({ success: false, error: 'Adresse e-mail invalide' });
    }
    if (!isValidRole(role)) {
      return reply.status(400).send({ success: false, error: 'Rôle invalide' });
    }

    // Refus des doublons (invitation en attente ou membre actif de l'agence).
    const dup = await app.pg.query(
      `SELECT 1 FROM agency_invitations
       WHERE agency_id = $1 AND lower(email) = lower($2) AND status = 'en_attente' LIMIT 1`,
      [request.agencyId, email]
    );
    if (dup.rows.length > 0) {
      return reply.status(409).send({ success: false, error: 'Une invitation est déjà en attente pour cet e-mail' });
    }

    const token = generateOrderToken();
    const expiresAt = new Date(Date.now() + INVITATION_EXPIRY_HOURS * 60 * 60 * 1000).toISOString();
    const { rows } = await app.pg.query(
      `INSERT INTO agency_invitations (agency_id, email, role, token, status, invited_by, expires_at)
       VALUES ($1, $2, $3, $4, 'en_attente', $5, $6) RETURNING *`,
      [request.agencyId, email, role, token, request.user.id, expiresAt]
    );
    return reply.status(201).send({ success: true, data: rows[0] });
  });

  app.put('/:id/revoke', async (request, reply) => {
    const { rows } = await app.pg.query(
      "UPDATE agency_invitations SET status = 'expiree' WHERE id = $1 AND agency_id = $2 RETURNING *",
      [request.params.id, request.agencyId]
    );
    if (rows.length === 0) return reply.status(404).send({ success: false, error: 'Invitation introuvable' });
    return { success: true, data: rows[0] };
  });
}
