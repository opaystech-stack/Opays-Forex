import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.24.0"

// scheduled-reminders — relances d'abonnement & rappels de vol (serveur).
//
// Fonction Edge invoquée par pg_cron toutes les 15 minutes (planification posée
// dans la migration 0003). Elle :
//   1. itère les Abonnements dont la relance de renouvellement est DUE (Req 10.4)
//      et les Reservation_Billet dont le rappel de vol est DÛ (Req 12.5), au
//      moyen des prédicats PURS de planification (mêmes règles que
//      `src/utils/reminderSchedule.js`, réimplémentées inline car l'édge
//      function est standalone et n'importe jamais `src/`) ;
//   2. délègue l'envoi au Service_Envoi UNIQUE, c.-à-d. la fonction edge
//      `whatsapp-send` (aucun autre canal — Req 13.1, 13.3) ;
//   3. consigne chaque envoi dans l'Historique_Messages_WhatsApp partagé
//      (`whatsapp_messages`) avec sa `feature_source` (Req 13.2) ;
//   4. ajoute exactement une entrée horodatée par tentative dans
//      l'Historique_Rappels (`reminder_history`) de l'Abonnement / du vol
//      (Req 10.8, 12.8), un échec restant non bloquant : l'entité demeurée due
//      sera re-sélectionnée au prochain passage (Req 13.5).
//
// Feature: agency-operations-expansion (Exigences 10.4, 12.5, 13.5)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ---------------------------------------------------------------------------
// Constantes et prédicats PURS — miroir de src/utils/reminderSchedule.js et
// des helpers d'Historique_Rappels de src/utils/subscriptionValidation.js.
// (réimplémentés inline : l'édge function ne dépend pas de src/)
// ---------------------------------------------------------------------------

const MS_PER_DAY = 24 * 60 * 60 * 1000
const MS_PER_HOUR = 60 * 60 * 1000

const RENEWAL_THRESHOLD_MIN_DAYS = 1
const RENEWAL_THRESHOLD_MAX_DAYS = 30
const RENEWAL_THRESHOLD_DEFAULT_DAYS = 3

const FLIGHT_LEAD_TIME_MIN_HOURS = 1
const FLIGHT_LEAD_TIME_MAX_HOURS = 168
const FLIGHT_LEAD_TIME_DEFAULT_HOURS = 48

// Types et résultats consignés dans l'Historique_Rappels (Req 10.8, 12.8).
const REMINDER_TYPE_RENEWAL = 'renouvellement'
const REMINDER_TYPE_FLIGHT = 'rappel_vol'
const REMINDER_RESULT_SUCCESS = 'succès'
const REMINDER_RESULT_FAILURE = 'échec'

// Fonctionnalités émettrices de l'Historique_Messages_WhatsApp (Req 13.2).
const FEATURE_SOURCE_SUBSCRIPTION = 'subscription_reminder'
const FEATURE_SOURCE_FLIGHT = 'flight_reminder'

const isFiniteNumber = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v)

const isIntegerInRange = (v: unknown, min: number, max: number): boolean =>
  isFiniteNumber(v) && Number.isInteger(v) && v >= min && v <= max

const isValidRenewalThreshold = (jours: unknown): boolean =>
  isIntegerInRange(jours, RENEWAL_THRESHOLD_MIN_DAYS, RENEWAL_THRESHOLD_MAX_DAYS)

const isValidFlightLeadTime = (heures: unknown): boolean =>
  isIntegerInRange(heures, FLIGHT_LEAD_TIME_MIN_HOURS, FLIGHT_LEAD_TIME_MAX_HOURS)

// Une relance d'Abonnement est DUE quand now >= renewal - seuil (Req 10.4).
const isSubscriptionReminderDue = (
  nowMs: number,
  renewalDateMs: number,
  seuilJours: number
): boolean => {
  if (!isFiniteNumber(nowMs) || !isFiniteNumber(renewalDateMs)) return false
  if (!isValidRenewalThreshold(seuilJours)) return false
  return nowMs >= renewalDateMs - seuilJours * MS_PER_DAY
}

// Un rappel de vol est DÛ quand now >= vol - délai (Req 12.5).
const isFlightReminderDue = (
  nowMs: number,
  flightInstantMs: number,
  delaiHeures: number
): boolean => {
  if (!isFiniteNumber(nowMs) || !isFiniteNumber(flightInstantMs)) return false
  if (!isValidFlightLeadTime(delaiHeures)) return false
  return nowMs >= flightInstantMs - delaiHeures * MS_PER_HOUR
}

// Convertit une valeur de date (ISO/ms/Date) en ms epoch UTC, ou undefined.
const toEpochMs = (value: unknown): number | undefined => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (value instanceof Date) {
    const ms = value.getTime()
    return Number.isNaN(ms) ? undefined : ms
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const ms = Date.parse(value)
    return Number.isNaN(ms) ? undefined : ms
  }
  return undefined
}

// Construit une entrée d'Historique_Rappels pour une tentative (Req 10.8, 12.8).
const buildReminderHistoryEntry = (
  { type, success, timestamp, error }:
    { type: string; success: boolean; timestamp: number; error?: string }
): Record<string, unknown> => {
  const at = new Date(timestamp)
  const iso = Number.isNaN(at.getTime()) ? new Date(0).toISOString() : at.toISOString()
  const entry: Record<string, unknown> = {
    timestamp: iso,
    type,
    result: success ? REMINDER_RESULT_SUCCESS : REMINDER_RESULT_FAILURE,
  }
  if (!success && typeof error === 'string' && error.trim() !== '') {
    entry.error = error
  }
  return entry
}

// Ajoute une entrée d'Historique_Rappels de façon immuable.
const appendReminderHistoryEntry = (
  history: unknown,
  entry: Record<string, unknown>
): Array<Record<string, unknown>> => {
  const base = Array.isArray(history) ? history : []
  return [...base, entry]
}

// Indique si une relance/un rappel de ce type a DÉJÀ abouti pour cette entité,
// afin de ne pas renvoyer un rappel déjà transmis à chaque passage du cron.
// Les seules tentatives en échec ne bloquent pas un nouvel essai (Req 13.5).
const hasSuccessfulReminder = (history: unknown, type: string): boolean => {
  if (!Array.isArray(history)) return false
  return history.some(
    (e) => e && typeof e === 'object' &&
      (e as any).type === type &&
      (e as any).result === REMINDER_RESULT_SUCCESS
  )
}

// ---------------------------------------------------------------------------
// Composition des messages de relance/rappel (texte par défaut, FR).
// ---------------------------------------------------------------------------

const formatDate = (value: unknown): string => {
  const ms = toEpochMs(value)
  if (ms === undefined) return ''
  return new Date(ms).toISOString().slice(0, 10)
}

const buildSubscriptionMessage = (sub: any): string => {
  const name = sub?.customers?.name ? String(sub.customers.name) : 'cher client'
  const plan = sub?.plan ? ` ${sub.plan}` : ''
  const date = formatDate(sub?.renewal_date)
  const echeance = date ? ` le ${date}` : ' prochainement'
  return `Bonjour ${name}, votre abonnement${plan} arrive à échéance${echeance}. ` +
    `Pensez à le renouveler pour ne pas interrompre votre service.`
}

const buildFlightMessage = (flight: any): string => {
  const name = flight?.customer_name ? String(flight.customer_name) : 'cher client'
  const ticket = flight?.ticket_number ? ` (billet ${flight.ticket_number})` : ''
  const airline = flight?.airline ? ` ${flight.airline}` : ''
  const date = formatDate(flight?.flight_at)
  const quand = date ? ` le ${date}` : ' prochainement'
  return `Bonjour ${name}, rappel de votre vol${airline}${ticket} prévu${quand}. ` +
    `Nous vous souhaitons un excellent voyage.`
}

const jsonResponse = (body: Record<string, unknown>, status: number) =>
  new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  })

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  if (!supabaseUrl || !serviceKey) {
    return jsonResponse({ success: false, error: 'missing_supabase_credentials' }, 500)
  }

  // Client à rôle de service : la sélection multi-tenant est faite côté serveur,
  // le cron n'étant rattaché à aucune session utilisateur (Req 3.6 redondante en RLS).
  const supabase = createClient(supabaseUrl, serviceKey)

  const nowMs = Date.now()

  // Délégation de l'envoi au Service_Envoi UNIQUE (fonction edge `whatsapp-send`).
  // Aucun autre canal n'est employé (Req 13.1, 13.3).
  const sendViaServiceEnvoi = async (
    to: string,
    message: string
  ): Promise<{ success: boolean; messageId?: string; error?: string }> => {
    try {
      const res = await fetch(`${supabaseUrl.replace(/\/+$/, '')}/functions/v1/whatsapp-send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceKey}`,
          'apikey': serviceKey,
        },
        body: JSON.stringify({ to, message }),
      })
      const payload = await res.json().catch(() => null)
      if (payload && typeof payload === 'object') {
        return payload as { success: boolean; messageId?: string; error?: string }
      }
      return { success: false, error: `service_envoi_status_${res.status}` }
    } catch (err: any) {
      return { success: false, error: err?.message || 'service_envoi_unreachable' }
    }
  }

  // Cache des Numero_WhatsApp_Agence par défaut, par agence (Req 13.6).
  const defaultWhatsappNumberByAgency = new Map<string, string | null>()
  const resolveWhatsappNumberId = async (agencyId: string): Promise<string | null> => {
    if (!agencyId) return null
    if (defaultWhatsappNumberByAgency.has(agencyId)) {
      return defaultWhatsappNumberByAgency.get(agencyId) ?? null
    }
    const { data } = await supabase
      .from('whatsapp_numbers')
      .select('id')
      .eq('agency_id', agencyId)
      .eq('is_default', true)
      .limit(1)
      .maybeSingle()
    const id = data?.id ?? null
    defaultWhatsappNumberByAgency.set(agencyId, id)
    return id
  }

  // Journalise un envoi dans l'Historique_Messages_WhatsApp partagé (Req 13.2).
  const logWhatsappMessage = async (
    {
      agencyId, whatsappNumberId, featureSource, recipient, content, result,
    }: {
      agencyId: string
      whatsappNumberId: string | null
      featureSource: string
      recipient: string
      content: string
      result: { success: boolean; messageId?: string; error?: string }
    }
  ): Promise<void> => {
    try {
      await supabase.from('whatsapp_messages').insert({
        agency_id: agencyId,
        whatsapp_number_id: whatsappNumberId,
        feature_source: featureSource,
        recipient,
        content,
        status: result.success ? 'sent' : 'failed',
        provider_message_id: result.success ? (result.messageId ?? null) : null,
        error_reason: result.success ? null : (result.error ?? 'send_failed'),
      })
    } catch (err: any) {
      // Résilience : un échec de journalisation n'interrompt pas le lot (Req 13.5).
      console.error('scheduled-reminders: log whatsapp_messages ignoré:', err?.message)
    }
  }

  // Persiste l'Historique_Rappels (colonne JSONB) de l'entité (Req 10.8, 12.8).
  const persistReminderHistory = async (
    table: string,
    entityId: string,
    history: Array<Record<string, unknown>>
  ): Promise<void> => {
    try {
      await supabase.from(table).update({ reminder_history: history }).eq('id', entityId)
    } catch (err: any) {
      console.error(`scheduled-reminders: persistance ${table}.reminder_history ignorée:`, err?.message)
    }
  }

  let processed = 0
  let sent = 0
  let failed = 0
  let skipped = 0
  const errors: string[] = []

  // -------------------------------------------------------------------------
  // 1) Relances de renouvellement d'Abonnement (Req 10.4)
  // -------------------------------------------------------------------------
  try {
    // Bornage de la requête : renouvellement à venir (ou tout juste atteint)
    // dans la fenêtre maximale du seuil (30 j) ; le prédicat pur affine ensuite.
    const horizon = new Date(nowMs + RENEWAL_THRESHOLD_MAX_DAYS * MS_PER_DAY)
      .toISOString().slice(0, 10)
    const { data: subs, error: subErr } = await supabase
      .from('subscriptions')
      .select('id, agency_id, plan, renewal_date, renewal_threshold_days, reminder_history, customers(name, phone)')
      .lte('renewal_date', horizon)
    if (subErr) throw subErr

    for (const sub of subs ?? []) {
      const renewalMs = toEpochMs((sub as any).renewal_date)
      const threshold = (sub as any).renewal_threshold_days ?? RENEWAL_THRESHOLD_DEFAULT_DAYS
      if (renewalMs === undefined) continue
      if (!isSubscriptionReminderDue(nowMs, renewalMs, threshold)) continue

      // Évite de renvoyer une relance déjà transmise pour ce cycle.
      if (hasSuccessfulReminder((sub as any).reminder_history, REMINDER_TYPE_RENEWAL)) {
        continue
      }

      const phone = (sub as any).customers?.phone
      if (!phone || String(phone).trim() === '') {
        skipped += 1
        continue
      }

      processed += 1
      const agencyId = (sub as any).agency_id
      const whatsappNumberId = await resolveWhatsappNumberId(agencyId)
      const content = buildSubscriptionMessage(sub)
      const result = await sendViaServiceEnvoi(String(phone), content)

      await logWhatsappMessage({
        agencyId,
        whatsappNumberId,
        featureSource: FEATURE_SOURCE_SUBSCRIPTION,
        recipient: String(phone),
        content,
        result,
      })

      const entry = buildReminderHistoryEntry({
        type: REMINDER_TYPE_RENEWAL,
        success: result.success,
        timestamp: Date.now(),
        error: result.success ? undefined : result.error,
      })
      const history = appendReminderHistoryEntry((sub as any).reminder_history, entry)
      await persistReminderHistory('subscriptions', (sub as any).id, history)

      if (result.success) sent += 1
      else failed += 1
    }
  } catch (err: any) {
    console.error('scheduled-reminders: erreur sur les abonnements:', err?.message)
    errors.push(`subscriptions: ${err?.message || 'unknown'}`)
  }

  // -------------------------------------------------------------------------
  // 2) Rappels de vol des Reservation_Billet (Req 12.5)
  // -------------------------------------------------------------------------
  try {
    // Bornage : vols à venir dans la fenêtre maximale du délai (168 h).
    const lower = new Date(nowMs).toISOString()
    const upper = new Date(nowMs + FLIGHT_LEAD_TIME_MAX_HOURS * MS_PER_HOUR).toISOString()
    const { data: flights, error: flErr } = await supabase
      .from('flight_bookings')
      .select('id, agency_id, customer_name, customer_whatsapp, ticket_number, airline, flight_at, flight_lead_time_hours, reminder_history')
      .gte('flight_at', lower)
      .lte('flight_at', upper)
    if (flErr) throw flErr

    for (const flight of flights ?? []) {
      const flightMs = toEpochMs((flight as any).flight_at)
      const lead = (flight as any).flight_lead_time_hours ?? FLIGHT_LEAD_TIME_DEFAULT_HOURS
      if (flightMs === undefined) continue
      if (!isFlightReminderDue(nowMs, flightMs, lead)) continue

      if (hasSuccessfulReminder((flight as any).reminder_history, REMINDER_TYPE_FLIGHT)) {
        continue
      }

      const phone = (flight as any).customer_whatsapp
      if (!phone || String(phone).trim() === '') {
        skipped += 1
        continue
      }

      processed += 1
      const agencyId = (flight as any).agency_id
      const whatsappNumberId = await resolveWhatsappNumberId(agencyId)
      const content = buildFlightMessage(flight)
      const result = await sendViaServiceEnvoi(String(phone), content)

      await logWhatsappMessage({
        agencyId,
        whatsappNumberId,
        featureSource: FEATURE_SOURCE_FLIGHT,
        recipient: String(phone),
        content,
        result,
      })

      const entry = buildReminderHistoryEntry({
        type: REMINDER_TYPE_FLIGHT,
        success: result.success,
        timestamp: Date.now(),
        error: result.success ? undefined : result.error,
      })
      const history = appendReminderHistoryEntry((flight as any).reminder_history, entry)
      await persistReminderHistory('flight_bookings', (flight as any).id, history)

      if (result.success) sent += 1
      else failed += 1
    }
  } catch (err: any) {
    console.error('scheduled-reminders: erreur sur les vols:', err?.message)
    errors.push(`flight_bookings: ${err?.message || 'unknown'}`)
  }

  return jsonResponse(
    { success: true, processed, sent, failed, skipped, errors },
    200
  )
})
