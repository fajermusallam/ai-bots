const Anthropic = require('@anthropic-ai/sdk');
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  const headers = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  try {
    const body = JSON.parse(event.body);
    const { type } = body;

    // ── ١. المحادثة الرئيسية ────────────────────────────
    if (type === 'chat') {
      const { system, messages } = body;
      const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        system,
        messages
      });
      return {
        statusCode: 200, headers,
        body: JSON.stringify({ content: [{ text: response.content[0]?.text || '' }] })
      };
    }

    // ── ٢. استخراج الملف الشخصي (خفيف) ─────────────────
    if (type === 'extract') {
      const { messages } = body;
      const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        system: 'Extract user info from conversation. Reply ONLY with JSON: {"name":"","goals":[],"level":"","notes":""}. name=mentioned name or empty. goals=list of vocal goals mentioned. level=beginner/intermediate/advanced or empty. notes=any important personal details. If nothing new found, return all empty.',
        messages
      });
      return {
        statusCode: 200, headers,
        body: JSON.stringify({ content: [{ text: response.content[0]?.text || '{}' }] })
      };
    }

    // ── ٣. توليد المحتوى ──────────────────────────────────
    if (type === 'content') {
      const { system, messages } = body;
      const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        system,
        messages
      });
      return {
        statusCode: 200, headers,
        body: JSON.stringify({ content: [{ text: response.content[0]?.text || '' }] })
      };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'نوع طلب غير معروف' }) };

  } catch (err) {
    console.error('Sawt function error:', err);
    return {
      statusCode: 200, headers,
      body: JSON.stringify({ content: [{ text: 'عذراً، حدث خطأ. حاول مجدداً.' }] })
    };
  }
};
