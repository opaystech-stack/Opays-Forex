// Appel optionnel à Google Gemini pour la composition de messages (Agent CRM).
// Si GEMINI_API_KEY est absent, on renvoie `null` afin que l'appelant bascule
// sur un gabarit local déterministe (aucune dépendance dure à l'API).

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash';

export async function generateText(prompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 256 },
      }),
    });
    if (!res.ok) {
      console.warn(`[gemini] HTTP ${res.status} — repli sur gabarit local.`);
      return null;
    }
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    return typeof text === 'string' && text.trim() ? text.trim() : null;
  } catch (err) {
    console.warn('[gemini] échec appel — repli sur gabarit local:', err?.message);
    return null;
  }
}
