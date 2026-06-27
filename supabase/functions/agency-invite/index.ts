import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.24.0"

// Edge Function `agency-invite` (serveur) — Feature: agency-operations-expansion.
//
// Couvre les Exigences 1.2, 1.3, 1.6, 1.7 :
//   - action "invite"  : valide l'e-mail et le rôle, refuse les doublons
//     (invitation `en_attente` ou Compte_Employé actif de la même Agence),
//     crée une `agency_invitation` à l'état `en_attente` et transmet une
//     invitation par e-mail via Supabase Auth admin (Req 1.2, 1.6).
//   - action "accept"  : applique l'expiration au-delà de 168 h (Req 1.7),
//     puis crée/active le Compte_Employé et fait passer l'invitation à
//     `acceptée` (Req 1.3).
//
// La fonction utilise la clé `SERVICE_ROLE` (contourne la RLS) ; elle réalise
// donc elle-même le contrôle d'autorisation de l'appelant. La logique pure de
// `src/utils/authorization.js` est RÉIMPLÉMENTÉE inline : une Edge Function est
// autonome et ne partage pas le bundle de `src/` (même patron que
// `whatsapp-send`). Les secrets restent côté serveur et ne sont jamais exposés.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ----------------------------------------------------------------------------
// Logique pure mirroir de src/utils/authorization.js (Exigences 1.2/1.4/1.5/1.6/1.7).
// ----------------------------------------------------------------------------

const ROLES = ['proprietaire', 'gerant', 'caissier', 'observateur']

const MAX_INVITATION_EMAIL_LENGTH = 254
const INVITATION_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+$/

// 168 heures de validité d'une invitation (Req 1.7).
const INVITATION_EXPIRY_MS = 168 * 60 * 60 * 1000

const isValidRole = (role: unknown): role is string =>
  typeof role === 'string' && ROLES.includes(role)

const isValidInvitationEmail = (email: unknown): email is string => {
  if (typeof email !== 'string') return false
  if (email.length === 0 || email.length > MAX_INVITATION_EMAIL_LENGTH) return false
  return INVITATION_EMAIL_PATTERN.test(email)
}

const normalizeEmail = (email: unknown): string | null =>
  typeof email === 'string' ? email.trim().toLowerCase() : null

// Doublon ssi l'e-mail (insensible casse/espaces) figure déjà parmi les
// e-mails rattachés à une invitation `en_attente` ou à un membre actif (Req 1.6).
const isDuplicateInvitationEmail = (email: unknown, existingEmails: unknown[] = []): boolean => {
  const target = normalizeEmail(email)
  if (target === null) return false
  const list = Array.isArray(existingEmails) ? existingEmails : []
  const normalized = new Set(list.map(normalizeEmail).filter((v) => v !== null))
  return normalized.has(target)
}

// Expirée ssi l'écart acceptation - création dépasse strictement 168 h.
// Horodatages non finis traités comme expirés par prudence (Req 1.7).
const isInvitationExpired = (createdAtMs: number, acceptedAtMs: number): boolean => {
  if (!Number.isFinite(createdAtMs) || !Number.isFinite(acceptedAtMs)) return true
  return acceptedAtMs - createdAtMs > INVITATION_EXPIRY_MS
}

const PERMISSION_ARRAY = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []

// ----------------------------------------------------------------------------
// Helpers HTTP
// ----------------------------------------------------------------------------

const jsonResponse = (body: Record<string, unknown>, status: number) =>
  new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  })

interface InviteBody {
  action?: unknown
  agencyId?: unknown
  email?: unknown
  role?: unknown
  permissionGrants?: unknown
  permissionDenies?: unknown
  invitationId?: unknown
  redirectTo?: unknown
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''
  if (!supabaseUrl || !serviceKey) {
    return jsonResponse({ error: 'server_not_configured' }, 500)
  }

  // 1) Identifier l'appelant via son jeton (en-tête Authorization).
  const authHeader = req.headers.get('Authorization') || ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!token) {
    return jsonResponse({ error: 'unauthorized' }, 401)
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: userData, error: userErr } = await admin.auth.getUser(token)
  if (userErr || !userData?.user) {
    return jsonResponse({ error: 'unauthorized' }, 401)
  }
  const caller = userData.user

  // 2) Parse du corps.
  let body: InviteBody
  try {
    body = (await req.json()) as InviteBody
  } catch {
    return jsonResponse({ error: 'invalid_request' }, 400)
  }

  const action = typeof body?.action === 'string' ? body.action : ''

  if (action === 'invite') {
    return await handleInvite(admin, caller, body)
  }
  if (action === 'accept') {
    return await handleAccept(admin, caller, body)
  }
  return jsonResponse({ error: 'invalid_request' }, 400)
})

// ----------------------------------------------------------------------------
// action "invite" — Exigences 1.2, 1.6
// ----------------------------------------------------------------------------
async function handleInvite(
  admin: ReturnType<typeof createClient>,
  caller: { id: string },
  body: InviteBody
): Promise<Response> {
  const agencyId = typeof body?.agencyId === 'string' ? body.agencyId : ''
  const email = typeof body?.email === 'string' ? body.email.trim() : body?.email
  const role = body?.role
  const grants = PERMISSION_ARRAY(body?.permissionGrants)
  const denies = PERMISSION_ARRAY(body?.permissionDenies)
  const redirectTo = typeof body?.redirectTo === 'string' ? body.redirectTo : undefined

  if (!agencyId) {
    return jsonResponse({ error: 'invalid_request' }, 400)
  }

  // Autorisation de l'appelant : Propriétaire_Agence (owner) OU Compte_Employé
  // actif disposant de la permission `employes.gerer` sur cette agence (Req 1.1).
  const authorized = await callerCanManageEmployees(admin, caller.id, agencyId)
  if (!authorized) {
    return jsonResponse({ error: 'forbidden' }, 403)
  }

  // Validation de l'e-mail (Req 1.2, 1.4).
  if (!isValidInvitationEmail(email)) {
    return jsonResponse({ error: 'invalid_email' }, 400)
  }
  // Validation du rôle (Req 1.5, 2.1).
  if (!isValidRole(role)) {
    return jsonResponse({ error: 'invalid_role' }, 400)
  }

  // Doublon (Req 1.6) : invitations `en_attente` + membres actifs de l'agence.
  const existingEmails = await collectExistingEmails(admin, agencyId)
  if (isDuplicateInvitationEmail(email, existingEmails)) {
    return jsonResponse({ error: 'email_already_used' }, 409)
  }

  // Création de l'Invitation_Collaborateur à l'état `en_attente` (Req 1.2).
  const { data: invitation, error: insertErr } = await admin
    .from('agency_invitations')
    .insert({
      agency_id: agencyId,
      email,
      role,
      permission_grants: grants,
      permission_denies: denies,
      state: 'en_attente',
    })
    .select()
    .single()

  if (insertErr || !invitation) {
    // Violation de l'index unique partiel = doublon concurrent (Req 1.6).
    if (insertErr && /duplicate key|unique/i.test(insertErr.message || '')) {
      return jsonResponse({ error: 'email_already_used' }, 409)
    }
    return jsonResponse({ error: 'invitation_not_created' }, 500)
  }

  // Transmission de l'e-mail d'invitation via Supabase Auth admin (Req 1.2).
  // metadata transporte le contexte d'agence/invitation pour l'acceptation.
  const inviteMeta = {
    agency_id: agencyId,
    invitation_id: invitation.id,
    role,
  }
  let emailSent = false
  try {
    const { error: inviteErr } = await admin.auth.admin.inviteUserByEmail(
      email as string,
      { data: inviteMeta, ...(redirectTo ? { redirectTo } : {}) }
    )
    if (!inviteErr) {
      emailSent = true
    } else {
      // L'utilisateur existe déjà (ou autre) : repli sur un lien magique.
      const { error: linkErr } = await admin.auth.admin.generateLink({
        type: 'magiclink',
        email: email as string,
        options: { data: inviteMeta, ...(redirectTo ? { redirectTo } : {}) },
      })
      emailSent = !linkErr
    }
  } catch {
    emailSent = false
  }

  // L'invitation est enregistrée même si l'e-mail échoue ; l'appelant est
  // informé du statut d'envoi pour pouvoir relancer.
  return jsonResponse(
    {
      success: true,
      invitation: {
        id: invitation.id,
        agencyId: invitation.agency_id,
        email: invitation.email,
        role: invitation.role,
        state: invitation.state,
        createdAt: invitation.created_at,
      },
      emailSent,
    },
    201
  )
}

// ----------------------------------------------------------------------------
// action "accept" — Exigences 1.3, 1.7
// ----------------------------------------------------------------------------
async function handleAccept(
  admin: ReturnType<typeof createClient>,
  caller: { id: string; email?: string | null },
  body: InviteBody
): Promise<Response> {
  const invitationId = typeof body?.invitationId === 'string' ? body.invitationId : ''
  if (!invitationId) {
    return jsonResponse({ error: 'invalid_request' }, 400)
  }

  const { data: invitation, error: fetchErr } = await admin
    .from('agency_invitations')
    .select('*')
    .eq('id', invitationId)
    .single()

  if (fetchErr || !invitation) {
    return jsonResponse({ error: 'invitation_not_found' }, 404)
  }

  // Une invitation déjà acceptée ou expirée n'est pas acceptable de nouveau.
  if (invitation.state === 'acceptée') {
    return jsonResponse({ error: 'invitation_already_accepted' }, 409)
  }
  if (invitation.state === 'expirée') {
    return jsonResponse({ error: 'invitation_expired' }, 410)
  }

  // L'acceptant doit être le destinataire de l'invitation (e-mail identique).
  if (normalizeEmail(caller.email) !== normalizeEmail(invitation.email)) {
    return jsonResponse({ error: 'forbidden' }, 403)
  }

  const createdAtMs = Date.parse(invitation.created_at)
  const nowMs = Date.now()

  // Expiration au-delà de 168 h (Req 1.7) : passer à `expirée`, ne créer
  // aucun Compte_Employé, et signaler l'expiration.
  if (isInvitationExpired(createdAtMs, nowMs)) {
    await admin
      .from('agency_invitations')
      .update({ state: 'expirée' })
      .eq('id', invitationId)
      .eq('state', 'en_attente')
    return jsonResponse({ error: 'invitation_expired' }, 410)
  }

  // Créer ou activer le Compte_Employé avec rôle + permissions de l'invitation
  // et fixer l'activation à `actif` (Req 1.3).
  const { error: memberErr } = await admin
    .from('agency_members')
    .upsert(
      {
        agency_id: invitation.agency_id,
        user_id: caller.id,
        role: invitation.role,
        activation_state: 'actif',
        permission_grants: invitation.permission_grants ?? [],
        permission_denies: invitation.permission_denies ?? [],
      },
      { onConflict: 'agency_id,user_id' }
    )

  if (memberErr) {
    return jsonResponse({ error: 'member_not_created' }, 500)
  }

  // Faire passer l'invitation à `acceptée` (transition atomique depuis
  // `en_attente` pour éviter une double acceptation concurrente).
  const { data: updated, error: updateErr } = await admin
    .from('agency_invitations')
    .update({ state: 'acceptée', accepted_at: new Date(nowMs).toISOString() })
    .eq('id', invitationId)
    .eq('state', 'en_attente')
    .select()
    .single()

  if (updateErr || !updated) {
    return jsonResponse({ error: 'invitation_not_updated' }, 409)
  }

  return jsonResponse(
    {
      success: true,
      member: {
        agencyId: invitation.agency_id,
        userId: caller.id,
        role: invitation.role,
        activationState: 'actif',
      },
      invitation: { id: invitationId, state: 'acceptée' },
    },
    200
  )
}

// ----------------------------------------------------------------------------
// Accès données (service role)
// ----------------------------------------------------------------------------

// Vrai si l'appelant est le Propriétaire_Agence (owner) ou un membre actif
// disposant de `employes.gerer` (rôle proprietaire/gerant ou octroi explicite,
// hors retrait) sur l'agence visée.
async function callerCanManageEmployees(
  admin: ReturnType<typeof createClient>,
  userId: string,
  agencyId: string
): Promise<boolean> {
  const { data: agency } = await admin
    .from('agencies')
    .select('owner_id')
    .eq('id', agencyId)
    .single()
  if (agency && agency.owner_id === userId) {
    return true
  }

  const { data: member } = await admin
    .from('agency_members')
    .select('role, activation_state, permission_grants, permission_denies')
    .eq('agency_id', agencyId)
    .eq('user_id', userId)
    .single()
  if (!member || member.activation_state !== 'actif') {
    return false
  }

  const REQUIRED = 'employes.gerer'
  const denies = PERMISSION_ARRAY(member.permission_denies)
  if (denies.includes(REQUIRED)) {
    return false
  }
  const grants = PERMISSION_ARRAY(member.permission_grants)
  // `proprietaire` et `gerant` détiennent `employes.gerer` par défaut.
  const roleHas = member.role === 'proprietaire' || member.role === 'gerant'
  return roleHas || grants.includes(REQUIRED)
}

// E-mails déjà rattachés à l'agence : invitations `en_attente` + membres
// actifs (résolus via l'API admin), pour le contrôle de doublon (Req 1.6).
async function collectExistingEmails(
  admin: ReturnType<typeof createClient>,
  agencyId: string
): Promise<string[]> {
  const emails: string[] = []

  const { data: pending } = await admin
    .from('agency_invitations')
    .select('email')
    .eq('agency_id', agencyId)
    .eq('state', 'en_attente')
  if (Array.isArray(pending)) {
    for (const row of pending) {
      if (typeof row?.email === 'string') emails.push(row.email)
    }
  }

  const { data: members } = await admin
    .from('agency_members')
    .select('user_id')
    .eq('agency_id', agencyId)
    .eq('activation_state', 'actif')
  if (Array.isArray(members)) {
    for (const m of members) {
      if (typeof m?.user_id !== 'string') continue
      try {
        const { data: u } = await admin.auth.admin.getUserById(m.user_id)
        if (u?.user?.email) emails.push(u.user.email)
      } catch {
        // utilisateur introuvable : ignoré pour le contrôle de doublon.
      }
    }
  }

  return emails
}
