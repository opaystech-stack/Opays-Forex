import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.24.0"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ""
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ""
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY') || ""

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
        const imgRes = await fetch(mediaUrl)
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
        console.error("Failed to download media file:", err)
      }
    }

    // Fetch active wallets list from database to feed into Gemini prompt
    const { data: wallets, error: wErr } = await supabase
      .from('wallets')
      .select('*')
      .eq('is_active', true)

    if (wErr || !wallets || wallets.length === 0) {
      throw new Error("Failed to fetch wallets or no active wallets found: " + (wErr?.message || "empty"))
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
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: { responseMimeType: 'application/json' }
        })
      }
    )

    if (!geminiRes.ok) {
      const errText = await geminiRes.text()
      throw new Error(`Gemini API error: ${geminiRes.statusText} - ${errText}`)
    }

    const geminiJson = await geminiRes.json()
    const textResponse = geminiJson.candidates?.[0]?.content?.parts?.[0]?.text
    if (!textResponse) {
      throw new Error("Empty response from Gemini API.")
    }

    // Clean markdown wrap if present
    let cleanedText = textResponse.trim()
    if (cleanedText.startsWith('```')) {
      cleanedText = cleanedText.replace(/^```json\s*/i, '').replace(/```$/, '')
    }

    console.log("Parsed Gemini text response:", cleanedText)
    const parsed = JSON.parse(cleanedText)

    // Resolve matched Wallet IDs
    const matchedSource = wallets.find((w: any) => 
      w.name.toLowerCase().includes(parsed.sourceWalletName?.toLowerCase()) || 
      parsed.sourceWalletName?.toLowerCase().includes(w.name.toLowerCase())
    )
    const matchedDest = wallets.find((w: any) => 
      w.name.toLowerCase().includes(parsed.destWalletName?.toLowerCase()) || 
      parsed.destWalletName?.toLowerCase().includes(w.name.toLowerCase())
    )

    if (!matchedSource || !matchedDest) {
      throw new Error(`Could not resolve matched wallets: source=${parsed.sourceWalletName}, dest=${parsed.destWalletName}`)
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
