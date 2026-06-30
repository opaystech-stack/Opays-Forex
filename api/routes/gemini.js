export default async function geminiRoutes(app) {
  app.addHook('preHandler', app.authenticate);

  app.post('/proxy', async (request, reply) => {
    try {
      const geminiApiKey = process.env.GEMINI_API_KEY;
      if (!geminiApiKey) {
        app.log.warn('Missing GEMINI_API_KEY in environment variables.');
        return reply.status(500).send({ success: false, error: 'Gemini API not configured on server' });
      }

      const { kind = 'ocr', prompt, mimeType = 'image/jpeg', base64Data, text } = request.body || {};
      if (!prompt) {
        return reply.status(400).send({ success: false, error: 'Prompt is required' });
      }

      const parts = [{ text: prompt }];
      if (base64Data) {
        parts.push({ inlineData: { mimeType, data: base64Data } });
      } else if (text) {
        parts.push({ text });
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
      );

      if (!geminiRes.ok) {
        const errText = await geminiRes.text();
        throw new Error(`Gemini API error: ${geminiRes.statusText} - ${errText}`);
      }

      const geminiJson = await geminiRes.json();
      const textResponse = geminiJson.candidates?.[0]?.content?.parts?.[0]?.text || '';
      if (!textResponse) {
        throw new Error('Empty response from Gemini API.');
      }

      let cleanedText = textResponse.trim();
      if (cleanedText.startsWith('```')) {
        cleanedText = cleanedText.replace(/^```json\s*/i, '').replace(/```$/, '');
      }

      return reply.send({ success: true, kind, text: cleanedText });
    } catch (error) {
      app.log.error(error);
      return reply.status(500).send({ success: false, error: error.message || 'Gemini proxy error' });
    }
  });
}
