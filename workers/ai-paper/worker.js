/**
 * PDFSlick AI Paper Reader — Cloudflare Worker
 *
 * Proxies requests from the browser to the DeepSeek API (OpenAI-compatible).
 * Supports streaming (SSE) responses for real-time output.
 *
 * Environment variables (set via wrangler secret):
 *   DEEPSEEK_API_KEY — DeepSeek API key
 *
 * Endpoints:
 *   POST /api/ai-paper
 *     Body: { task, text, targetLang, stream?, paperContext?, question?, chatHistory? }
 *     task: "metadata" | "summary" | "terms" | "translate" | "explain" | "rewrite" | "chat"
 *
 *   OPTIONS /api/ai-paper  (CORS preflight)
 */

const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';
const MODEL = 'deepseek-chat';

const LANG_MAP = {
  zh: 'Simplified Chinese',
  ja: 'Japanese',
  ko: 'Korean',
  es: 'Spanish',
  pt: 'Portuguese',
  fr: 'French',
  de: 'German',
};

// ─── System Prompts ──────────────────────────────────────────
// Optimized for DeepSeek-V3 with clearer instructions

const SYSTEM_PROMPTS = {
  metadata: `You are an academic paper metadata extractor. Given paper text, extract and return ONLY a JSON object:
{"title":"...","authors":"...","year":"...","journal":"..."}
Use "—" for unknown fields. No other text.`,

  summary: `You are an academic paper reading assistant. Help non-experts understand research papers.

Given a paper, provide a clear summary in {TARGET_LANG}:
1. What problem does this paper try to solve? (one sentence)
2. How did they approach it? (methodology in simple terms)
3. What did they find? (key results)
4. Why does it matter? (significance)

Rules:
- Use everyday language, avoid jargon
- If you must use a technical term, explain it immediately in parentheses
- Use analogies where helpful
- Keep it under 500 words
- Format with ### headings
- Write as if explaining to a smart friend with no background in this field`,

  terms: `You are an academic vocabulary expert. From the paper, identify 8-15 key technical terms a non-expert wouldn't understand.

For each term, provide in {TARGET_LANG}:
1. English term
2. One-line academic definition
3. One-line plain explanation (as if explaining to a 15-year-old)
4. Daily-life example (if applicable)

Return ONLY a JSON array:
[{"term":"...","academic":"...","plain":"...","example":"..."}]
No other text outside the JSON.`,

  translate: `You are a professional academic translator. Translate accurately while keeping it natural and readable.

Rules:
- Translate to {TARGET_LANG}
- Preserve academic meaning precisely
- Keep proper nouns, model names, formulas, abbreviations in original form (e.g. "FPGA" stays "FPGA")
- For technical terms, add original in parentheses after translation (e.g. "压电式传感器 (piezoelectric sensor)")
- Output ONLY the translation, no commentary`,

  explain: `You are a patient and friendly academic tutor. Explain complex academic text in simple, everyday language that anyone can understand — even someone with no background in the field.

Rules:
- Use short sentences. Avoid jargon completely.
- If a technical term must be mentioned, immediately explain it in parentheses.
- Use analogies and real-life comparisons to make concepts relatable.
- Structure: (1) What is this about in one sentence, (2) Why does it matter, (3) How does it work simply.
- Write in {TARGET_LANG}.
- Keep explanations concise — 3-6 sentences unless the passage is very complex.
- Tone: friendly, like a smart friend explaining over coffee. Never condescending.

Paper context (for reference):
{PAPER_CONTEXT}

Explain the following passage:`,

  rewrite: `You are an academic writing assistant. Help the user rephrase a passage from a research paper in {TARGET_LANG} in their own words while maintaining academic integrity.

Provide 2-3 rewrite options:
1. **Formal academic** (suitable for thesis or journal paper)
2. **Semi-formal** (suitable for report or presentation)
3. **Casual** (suitable for blog post or study notes)

Each version should:
- Convey the same meaning as the original
- Use completely different sentence structure and wording
- Include a suggested citation format: (Author, Year)

Paper context:
{PAPER_CONTEXT}

Original passage to rewrite:`,

  chat: `You are an AI research assistant helping a user understand an academic paper. The paper content is provided as context.

Rules:
- Answer based on the paper's content. Cite relevant sections briefly.
- If the answer goes beyond the paper, say so honestly.
- Match the user's language — Chinese question = Chinese answer, English = English.
- Use clear, accessible language. Avoid unnecessary jargon.
- Keep answers focused and concise (under 200 words unless more detail is needed).

Paper content:
{PAPER_TEXT}`,
};

const MAX_TOKENS = {
  metadata: 256,
  summary: 2048,
  terms: 2048,
  translate: 1024,
  explain: 1024,
  rewrite: 1024,
  chat: 1024,
};

const TEMPERATURE = {
  metadata: 0,
  summary: 0.3,
  terms: 0.1,
  translate: 0.1,
  explain: 0.5,
  rewrite: 0.6,
  chat: 0.5,
};

// ─── CORS ─────────────────────────────────────────────────────
const ALLOWED_ORIGINS = new Set([
  'https://pdf-slick.com',
  'https://www.pdf-slick.com',
  'http://localhost:8080',
  'http://localhost:5500',
  'http://localhost:3000',
  'http://127.0.0.1:8080',
  'http://127.0.0.1:5500',
  'http://127.0.0.1:3000',
]);

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : 'https://pdf-slick.com',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function corsResponse(body, init = {}, request) {
  const headers = new Headers(init.headers || {});
  const cors = request ? corsHeaders(request) : { 'Access-Control-Allow-Origin': 'https://pdf-slick.com', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
  for (const [k, v] of Object.entries(cors)) headers.set(k, v);
  return new Response(body, { ...init, headers });
}

// ─── IP Rate Limiting (in-memory, per Worker instance) ─────────
// TODO: Upgrade to Cloudflare KV for persistent rate limiting across Worker restarts
const RATE_LIMIT_PER_DAY = 50;
const _ipCounts = new Map(); // ip -> { count, date }

function checkRateLimit(ip) {
  const today = new Date().toISOString().slice(0, 10);
  const entry = _ipCounts.get(ip);
  if (!entry || entry.date !== today) {
    _ipCounts.set(ip, { count: 1, date: today });
    return true;
  }
  if (entry.count >= RATE_LIMIT_PER_DAY) return false;
  entry.count++;
  return true;
}

// ─── Main Handler ──────────────────────────────────────────────
export default {
  async fetch(request, env) {
    const r = request; // short alias, passed to every corsResponse

    if (r.method === 'OPTIONS') {
      return corsResponse(null, { status: 204 }, r);
    }

    const url = new URL(r.url);
    if (r.method !== 'POST' || url.pathname !== '/api/ai-paper') {
      return corsResponse(JSON.stringify({ error: 'Not found' }), {
        status: 404, headers: { 'Content-Type': 'application/json' },
      }, r);
    }

    let body;
    try {
      body = await r.json();
    } catch {
      return corsResponse(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      }, r);
    }

    const { task, text, targetLang, paperContext, chatHistory } = body;

    // ── IP rate limiting ──
    const clientIP = r.headers.get('CF-Connecting-IP') || r.headers.get('X-Forwarded-For') || 'unknown';
    if (!checkRateLimit(clientIP)) {
      return corsResponse(JSON.stringify({ error: 'Daily request limit reached. Please try again tomorrow.' }), {
        status: 429, headers: { 'Content-Type': 'application/json' },
      }, r);
    }

    if (!task || !text || !targetLang) {
      return corsResponse(JSON.stringify({ error: 'Missing required fields: task, text, targetLang' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      }, r);
    }

    if (!SYSTEM_PROMPTS[task]) {
      return corsResponse(JSON.stringify({ error: 'Invalid task: ' + task }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      }, r);
    }

    // ── API key check ──
    const apiKey = env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      return corsResponse(JSON.stringify({ error: 'API key not configured.' }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      }, r);
    }

    const langName = LANG_MAP[targetLang] || 'English';

    // ── Build system prompt ──
    let systemPrompt = SYSTEM_PROMPTS[task].replace(/\{TARGET_LANG\}/g, langName);

    if (task === 'explain' || task === 'rewrite') {
      const ctx = (paperContext || text).substring(0, 6000);
      systemPrompt = systemPrompt.replace('{PAPER_CONTEXT}', ctx);
    }
    if (task === 'chat') {
      systemPrompt = systemPrompt.replace('{PAPER_TEXT}', text.substring(0, 15000));
    }

    // ── Build messages array (OpenAI format) ──
    let apiMessages = [{ role: 'system', content: systemPrompt }];

    if (task === 'chat') {
      if (chatHistory && Array.isArray(chatHistory)) {
        for (const msg of chatHistory.slice(-10)) {
          apiMessages.push({ role: msg.role, content: msg.content });
        }
      }
      apiMessages.push({ role: 'user', content: body.question || 'Please summarize the key points.' });
    } else {
      apiMessages.push({ role: 'user', content: text.substring(0, 15000) });
    }

    const wantStream = body.stream !== false;

    try {
      const apiRes = await fetch(DEEPSEEK_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + apiKey,
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: MAX_TOKENS[task] || 1024,
          temperature: TEMPERATURE[task] ?? 0.3,
          messages: apiMessages,
          stream: wantStream,
        }),
      });

      if (!apiRes.ok) {
        const errText = await apiRes.text();
        console.error('DeepSeek API error:', apiRes.status, errText); // Keep for wrangler tail debugging
        let userError = 'AI processing failed';
        if (apiRes.status === 402) userError = 'API quota exhausted. Please try again later.';
        else if (apiRes.status === 429) userError = 'Too many requests. Please wait a moment.';
        else if (apiRes.status === 401) userError = 'API key invalid. Please check configuration.';
        return corsResponse(JSON.stringify({ error: userError, status: apiRes.status }), {
          status: 502, headers: { 'Content-Type': 'application/json' },
        }, r);
      }

      if (wantStream) {
        return corsResponse(apiRes.body, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
        }, r);
      } else {
        const data = await apiRes.json();
        const content = data.choices?.[0]?.message?.content || '';
        return corsResponse(JSON.stringify({ result: content }), {
          status: 200, headers: { 'Content-Type': 'application/json' },
        }, r);
      }
    } catch (err) {
      console.error('Worker error:', err); // Keep for wrangler tail debugging
      return corsResponse(JSON.stringify({ error: 'Internal worker error: ' + (err.message || '') }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      }, r);
    }
  },
};
