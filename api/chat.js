// SpecialMinds — Vercel Serverless Function
// api/chat.js — Claude API proxy (CommonJS)
// COPPA-safe: no student PII logged or stored server-side

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-20250514';
const MAX_TOKENS = 600;

function stripPII(text) {
  if (!text || typeof text !== 'string') return text;
  return text
    .replace(/\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g, '[phone]')
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[email]')
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[ssn]');
}

function validateMessages(messages) {
  if (!Array.isArray(messages)) return false;
  if (messages.length === 0 || messages.length > 20) return false;
  return messages.every(m =>
    m &&
    typeof m === 'object' &&
    ['user', 'assistant'].includes(m.role) &&
    typeof m.content === 'string' &&
    m.content.length > 0 &&
    m.content.length < 4000
  );
}

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Vercel auto-parses JSON body — req.body is already an object
  const { messages, system } = req.body || {};

  if (!validateMessages(messages)) {
    return res.status(400).json({ error: 'Invalid messages format' });
  }

  const safeMessages = messages.map(m => ({
    role: m.role,
    content: stripPII(m.content.trim()),
  }));

  const safeSystem = system
    ? stripPII(system).slice(0, 3000)
    : 'You are a helpful, patient AI tutor for students with learning differences. Keep responses brief and encouraging.';

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('[SpecialMinds] ANTHROPIC_API_KEY not set');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  try {
    const response = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: safeSystem,
        messages: safeMessages,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error('[SpecialMinds] Anthropic error:', response.status, errBody.slice(0, 200));
      return res.status(response.status).json({ error: 'AI service temporarily unavailable' });
    }

    const data = await response.json();
    return res.status(200).json({ content: data.content || [] });

  } catch (err) {
    console.error('[SpecialMinds] Function error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
