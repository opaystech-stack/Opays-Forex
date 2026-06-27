import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

// Service_Envoi (serveur) — fonction Edge `whatsapp-send`.
//
// Reproduit le patron de `gemini-proxy` : le secret d'authentification OpenWA
// (`WHATSAPP_API_SECRET`) et l'URL de la passerelle restent **côté serveur** et
// ne figurent jamais dans le corps de réponse ni dans les logs.
//
// Reçoit { to, message }, appelle l'API REST OpenWA (`POST {gatewayUrl}/sendText`)
// et renvoie un statut normalisé { success, messageId? , error? }.
//
// Feature: whatsapp-client-reminders (Exigences 3.1, 3.4, 3.5, 3.6, 3.7, 12.1, 12.2, 12.3)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const DEFAULT_TIMEOUT_MS = 10000

interface SendRequest {
  to?: unknown
  message?: unknown
}

// Résolution de l'URL de passerelle (Ex. 12.2, 12.3) — règle pure réimplémentée
// inline (l'édge function est standalone, ne dépend pas de `src/`).
const isPresent = (url: unknown): url is string =>
  typeof url === 'string' && url.trim() !== ''

const resolveGatewayUrl = (
  sendUrl: string | undefined,
  sharedUrl: string | undefined
): string | undefined => {
  if (isPresent(sendUrl)) return sendUrl
  if (isPresent(sharedUrl)) return sharedUrl
  return undefined
}

// Mapping du résultat passerelle (Ex. 3.4, 3.5, 3.6) — succès ssi HTTP OK ET
// identifiant de message non vide. Règle pure réimplémentée inline.
const mapGatewayResponse = (
  { httpOk, messageId, error }: { httpOk?: boolean; messageId?: string | null; error?: string | null }
): { success: boolean; messageId?: string; error?: string } => {
  const id = typeof messageId === 'string' ? messageId.trim() : messageId
  const hasMessageId = id !== null && id !== undefined && id !== ''

  if (httpOk && hasMessageId) {
    return { success: true, messageId: String(id) }
  }
  if (httpOk && !hasMessageId) {
    return { success: false, error: 'missing_message_id' }
  }
  const cause =
    typeof error === 'string' && error.trim() !== '' ? error : 'gateway_error'
  return { success: false, error: cause }
}

// Extrait un identifiant de message d'une réponse OpenWA hétérogène, sans
// présumer du format exact (id direct, response.id, etc.).
const extractMessageId = (payload: any): string | undefined => {
  if (!payload || typeof payload !== 'object') return undefined
  const candidate =
    payload.id ??
    payload.messageId ??
    payload?.response?.id ??
    payload?.response?.messageId ??
    payload?.data?.id
  if (candidate === null || candidate === undefined) return undefined
  const str = String(candidate).trim()
  return str === '' ? undefined : str
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

  // 1) Parse + validation du corps (Ex. 3.1).
  let body: SendRequest
  try {
    body = (await req.json()) as SendRequest
  } catch {
    return jsonResponse({ error: 'invalid_request' }, 400)
  }

  const to = typeof body?.to === 'string' ? body.to.trim() : ''
  const message = typeof body?.message === 'string' ? body.message.trim() : ''
  if (!to || !message) {
    return jsonResponse({ error: 'invalid_request' }, 400)
  }

  // 2) Résolution de l'URL de passerelle côté serveur (Ex. 12.1, 12.2, 12.3).
  const gatewayUrl = resolveGatewayUrl(
    Deno.env.get('WHATSAPP_SEND_GATEWAY_URL') || undefined,
    Deno.env.get('WHATSAPP_GATEWAY_URL') || undefined
  )
  if (!gatewayUrl) {
    return jsonResponse({ error: 'gateway_not_configured' }, 500)
  }

  // En-tête d'authentification depuis l'environnement (Ex. 3.7), jamais exposé.
  const apiSecret = Deno.env.get('WHATSAPP_API_SECRET') || ''
  const timeoutMs = Number(Deno.env.get('WHATSAPP_SEND_TIMEOUT_MS')) || DEFAULT_TIMEOUT_MS

  const endpoint = `${gatewayUrl.replace(/\/+$/, '')}/sendText`

  // 3) Appel OpenWA encadré par un AbortController (timeout configurable).
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (apiSecret) {
      headers['Authorization'] = `Bearer ${apiSecret}`
      headers['x-api-key'] = apiSecret
    }

    const gatewayRes = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ to, chatId: to, message }),
      signal: controller.signal,
    })

    if (!gatewayRes.ok) {
      // HTTP non-OK : échec maîtrisé sans divulguer l'URL/secret (Ex. 3.6).
      return jsonResponse(
        mapGatewayResponse({ httpOk: false, error: `gateway_status_${gatewayRes.status}` }),
        200
      )
    }

    let payload: any = null
    try {
      payload = await gatewayRes.json()
    } catch {
      payload = null
    }

    // 4) Mapping succès/échec (Ex. 3.4, 3.5).
    const result = mapGatewayResponse({
      httpOk: true,
      messageId: extractMessageId(payload),
    })
    return jsonResponse(result, 200)
  } catch (error: any) {
    // Injoignable / timeout : ne jamais exposer l'URL ni le secret (Ex. 3.6).
    const isTimeout = error?.name === 'AbortError'
    return jsonResponse(
      mapGatewayResponse({ httpOk: false, error: isTimeout ? 'timeout' : 'gateway_unreachable' }),
      200
    )
  } finally {
    clearTimeout(timer)
  }
})
