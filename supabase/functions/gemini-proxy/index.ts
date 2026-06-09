import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY') || ''
    if (!geminiApiKey) {
      throw new Error('Missing GEMINI_API_KEY in Edge Function environment variables.')
    }

    const body = await req.json()
    const {
      kind = 'ocr',
      prompt = '',
      mimeType = 'image/jpeg',
      base64Data = '',
      text = ''
    } = body || {}

    if (!prompt) {
      throw new Error('Prompt requis pour l’appel Gemini proxy.')
    }

    const parts: any[] = [{ text: prompt }]
    if (base64Data) {
      parts.push({ inlineData: { mimeType, data: base64Data } })
    } else if (text) {
      parts.push({ text })
    }

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
      throw new Error(`Gemini proxy error: ${geminiRes.statusText} - ${errText}`)
    }

    const geminiJson = await geminiRes.json()
    const textResponse = geminiJson.candidates?.[0]?.content?.parts?.[0]?.text || ''
    if (!textResponse) {
      throw new Error('Empty response from Gemini API.')
    }

    let cleanedText = textResponse.trim()
    if (cleanedText.startsWith('```')) {
      cleanedText = cleanedText.replace(/^```json\s*/i, '').replace(/```$/, '')
    }

    return new Response(
      JSON.stringify({ success: true, kind, text: cleanedText }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  } catch (error: any) {
    return new Response(
      JSON.stringify({ success: false, error: error?.message || 'Erreur Gemini proxy' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
