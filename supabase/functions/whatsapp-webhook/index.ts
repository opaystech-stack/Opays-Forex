import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.24.0"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Correction A2 — Encadrement des appels réseau externes par un timeout (Exigence 2.1)
// Chaque fetch externe (téléchargement média, API Gemini) est encadré d'un AbortController
// avec un délai configurable. Le minuteur est systématiquement nettoyé dans un `finally`.
// En cas de dépassement, fetch lève une AbortError, traitée par l'appelant.
async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

// Détecte une erreur d'annulation provoquée par le dépassement du timeout (AbortController).
function isTimeoutError(err: any): boolean {
  return err?.name === 'AbortError' || err?.name === 'TimeoutError'
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Correction A1 — Vérification du WEBHOOK_SECRET (Exigences 1.3, 2.2, 14.1)
    // Si WEBHOOK_SECRET est configuré, on exige un secret correspondant fourni
    // soit via l'en-tête 'x-webhook-secret', soit via le paramètre de requête '?secret='.
    // Sinon (non configuré) : avertissement journalisé + comportement nominal inchangé (rétro-compatibilité).
    const webhookSecret = Deno.env.get('WEBHOOK_SECRET')
    if (webhookSecret) {
      const url = new URL(req.url)
      const providedSecret = req.headers.get('x-webhook-secret') || url.searchParams.get('secret')
      if (!providedSecret || providedSecret !== webhookSecret) {
        console.warn("Webhook authentication failed: missing or invalid secret.")
        return new Response(
          JSON.stringify({ success: false, reason: 'unauthorized' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
        )
      }
    } else {
      console.warn("WEBHOOK_SECRET is not configured: webhook authentication is disabled (backward-compatible mode).")
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ""
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ""
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY') || ""

    // Correction A2 — Délais de timeout configurables (défaut 10 000 ms) (Exigence 2.1)
    const mediaTimeoutMs = Number(Deno.env.get('MEDIA_TIMEOUT_MS')) || 10000
    const geminiTimeoutMs = Number(Deno.env.get('GEMINI_TIMEOUT_MS')) || 10000

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase credentials in Edge Function environment.")
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Parse incoming webhook payload
    const payload = await req.json()
    console.log("Received Webhook payload:", JSON.stringify(payload))

    // Handle generic webhook structures
    // OpenWA webhook events typically place message details inside payload.data
    const data = payload.data || payload
    const text = data.body || data.message?.text || ""
    const sender = data.from || data.sender?.id || "Client WhatsApp"
    const mediaUrl = data.mediaUrl || null
    const mediaMimeType = data.mimeType || "image/jpeg"
    const base64Media = data.media || null // base64 attachment if sent directly

    // Download media if URL is present and not sent directly
    let base64Data = base64Media
    if (!base64Data && mediaUrl) {
      try {
        console.log(`Downloading media from URL: ${mediaUrl}`)
        // Correction A2 — timeout sur le téléchargement média. Le média est en repli souple :
        // tout échec (y compris un timeout) retombe sur le traitement texte seul.
        const imgRes = await fetchWithTimeout(mediaUrl, {}, mediaTimeoutMs)
        if (imgRes.ok) {
          const arrayBuffer = await imgRes.arrayBuffer()
          const uint8 = new Uint8Array(arrayBuffer)
          let binary = ""
          for (let i = 0; i < uint8.length; i++) {
            binary += String.fromCharCode(uint8[i])
          }
          base64Data = btoa(binary)
        }
      } catch (err) {
        // Repli souple : on journalise 'media_download_failed' et on poursuit en texte seul.
        if (isTimeoutError(err)) {
          console.error(`media_download_failed: timeout after ${mediaTimeoutMs}ms`, err)
        } else {
          console.error("media_download_failed:", err)
        }
      }
    }

    // Fetch active wallets list from database to feed into Gemini prompt
    const { data: wallets, error: wErr } = await supabase
      .from('wallets')
      .select('*')
      .eq('is_active', true)

    // Correction A3 — Portefeuille inconnu (cas métier, Exigences 2.3, 2.4)
    // Aucun portefeuille actif n'est un cas métier traitable, pas une panne serveur :
    // on renvoie 422 (Unprocessable Entity) sans interrompre les requêtes ultérieures.
    if (wErr || !wallets || wallets.length === 0) {
      console.warn("no_matching_wallet: failed to fetch wallets or no active wallets found", wErr?.message || "empty")
      return new Response(
        JSON.stringify({ success: false, reason: 'no_matching_wallet' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 422 }
      )
    }

    // Fetch exchange rates for profit calculation
    const { data: rates } = await supabase
      .from('exchange_rates')
      .select('*')
      .order('date', { ascending: false })

    // Build Prompt for Gemini
    const prompt = `Tu es un assistant comptable expert pour un bureau de change Forex et Mobile Money.
Analyse ce message de transaction (texte ou capture de reçu). Extrais les informations requises et renvoie-les sous la forme d'un objet JSON brut. Le JSON doit suivre exactement ce format :
{
  "sourceWalletName": "Nom exact du portefeuille source",
  "destWalletName": "Nom exact du portefeuille destination",
  "sourceAmount": "Montant donné (nombre ou chaîne numérique)",
  "destAmount": "Montant reçu (nombre ou chaîne numérique)",
  "fee": "Frais s'ils sont indiqués, sinon 0",
  "transactionId": "ID unique de la transaction réseau (référence de litige)",
  "note": "Note explicative résumée"
}

Les portefeuilles disponibles dans l'application sont :
${wallets.map((w: any) => `- ${w.name} (${w.currency})`).join('\n')}

Règles de sélection :
1. Choisis le portefeuille source et destination qui correspondent le mieux au message.
2. Si une information n'est pas présente, laisse le champ à "" ou 0 pour fee.
3. Réponds uniquement avec le JSON valide, sans balises markdown, sans texte d'introduction ni de conclusion.`

    // Call Gemini API
    if (!geminiApiKey) {
      throw new Error("Missing GEMINI_API_KEY in Edge Function environment variables.")
    }

    let parts: any[] = [{ text: prompt }]
    if (base64Data) {
      parts.push({
        inlineData: {
          mimeType: mediaMimeType,
          data: base64Data
        }
      })
    } else {
      parts.push({ text: `Message WhatsApp reçu : "${text}"` })
    }

    console.log("Calling Gemini API...")
    // Correction A2 — timeout sur l'appel Gemini. Contrairement au média (repli souple),
    // un dépassement de délai côté Gemini est une panne maîtrisée → réponse 504.
    let geminiRes: Response
    try {
      geminiRes = await fetchWithTimeout(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: { responseMimeType: 'application/json' }
          })
        },
        geminiTimeoutMs
      )
    } catch (err) {
      if (isTimeoutError(err)) {
        console.error(`Gemini API call timed out after ${geminiTimeoutMs}ms`)
        return new Response(
          JSON.stringify({ success: false, reason: 'timeout' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 504 }
        )
      }
      // Correction A4 — Panne Gemini en amont (injoignable, non-timeout) → 502 (Exigence 2.4)
      console.error("gemini_upstream: Gemini API unreachable", err)
      return new Response(
        JSON.stringify({ success: false, reason: 'gemini_upstream' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 502 }
      )
    }

    // Correction A4 — Réponse HTTP non-OK de Gemini → 502 (Exigence 2.4)
    if (!geminiRes.ok) {
      const errText = await geminiRes.text()
      console.error(`gemini_upstream: Gemini API error ${geminiRes.status} ${geminiRes.statusText} - ${errText}`)
      return new Response(
        JSON.stringify({ success: false, reason: 'gemini_upstream' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 502 }
      )
    }

    const geminiJson = await geminiRes.json()
    const textResponse = geminiJson.candidates?.[0]?.content?.parts?.[0]?.text
    // Correction A4/A6 — Réponse Gemini vide → 422 non analysable (Exigence 2.4)
    if (!textResponse) {
      console.warn("gemini_unparseable: empty response from Gemini API")
      return new Response(
        JSON.stringify({ success: false, reason: 'gemini_unparseable' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 422 }
      )
    }

    // Correction A6 — Parsing JSON protégé (retrait markdown + try/catch).
    // JSON.parse ne doit jamais remonter au catch global (500) : une réponse
    // non analysable est un cas métier → 422 (Exigence 2.4).
    let parsed: any
    try {
      let cleanedText = textResponse.trim()
      if (cleanedText.startsWith('```')) {
        cleanedText = cleanedText.replace(/^```json\s*/i, '').replace(/```$/, '')
      }
      console.log("Parsed Gemini text response:", cleanedText)
      parsed = JSON.parse(cleanedText)
    } catch (parseErr) {
      console.warn("gemini_unparseable: failed to parse Gemini JSON response", parseErr)
      return new Response(
        JSON.stringify({ success: false, reason: 'gemini_unparseable' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 422 }
      )
    }

    // Resolve matched Wallet IDs
    const matchedSource = wallets.find((w: any) => 
      w.name.toLowerCase().includes(parsed.sourceWalletName?.toLowerCase()) || 
      parsed.sourceWalletName?.toLowerCase().includes(w.name.toLowerCase())
    )
    const matchedDest = wallets.find((w: any) => 
      w.name.toLowerCase().includes(parsed.destWalletName?.toLowerCase()) || 
      parsed.destWalletName?.toLowerCase().includes(w.name.toLowerCase())
    )

    // Correction A3 — Résolution source/dest impossible (cas métier, Exigences 2.3, 2.4) → 422
    if (!matchedSource || !matchedDest) {
      console.warn(`no_matching_wallet: could not resolve matched wallets: source=${parsed.sourceWalletName}, dest=${parsed.destWalletName}`)
      return new Response(
        JSON.stringify({ success: false, reason: 'no_matching_wallet' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 422 }
      )
    }

    const sAmt = parseFloat(parsed.sourceAmount) || 0
    const dAmt = parseFloat(parsed.destAmount) || 0
    const feeAmt = parseFloat(parsed.fee) || 0

    // Compute estimated Profit in USD
    let profitUSD = 0.0
    if (sAmt > 0 && dAmt > 0) {
      const getUSD = (amount: number, currency: string) => {
        if (currency === 'USD') return amount
        const rate = rates?.find((r: any) => r.currency === currency)
        return rate && rate.rate_to_usd > 0 ? amount / rate.rate_to_usd : 0
      }

      const sUSD = getUSD(sAmt, matchedSource.currency)
      const dUSD = getUSD(dAmt, matchedDest.currency)
      
      // Assume fee is debited from source wallet currency
      const feeUSD = getUSD(feeAmt, matchedSource.currency)

      profitUSD = sUSD - dUSD - feeUSD
    }

    // Insert draft transaction in Supabase
    const draftTxn = {
      source_wallet_id: matchedSource.id,
      dest_wallet_id: matchedDest.id,
      source_amount: sAmt,
      dest_amount: dAmt,
      exchange_rate: sAmt > 0 ? dAmt / sAmt : 0,
      fee: feeAmt,
      fee_wallet_id: matchedSource.id, // defaults to source wallet
      profit_usd: profitUSD,
      status: 'draft',
      transaction_id: parsed.transactionId || null,
      note: parsed.note || `📱 WhatsApp de ${sender}`,
      timestamp: new Date().toISOString()
    }

    console.log("Inserting draft transaction:", JSON.stringify(draftTxn))
    const { data: insertedData, error: insErr } = await supabase
      .from('transactions')
      .insert([draftTxn])
      .select()

    if (insErr) {
      throw insErr
    }

    return new Response(
      JSON.stringify({ success: true, message: "Draft transaction created.", data: insertedData }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error: any) {
    console.error("Webhook Execution Error:", error)
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
