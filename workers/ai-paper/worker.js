/**
 * PDFSlick AI Paper Reader — Cloudflare Worker
 *
 * Proxies requests from the browser to the Claude API.
 * Supports streaming (SSE) responses for real-time output.
 *
 * Environment variables (set via wrangler secret):
 *   CLAUDE_API_KEY — Anthropic API key
 *
 * Endpoints:
 *   POST /api/ai-paper
 *     Body: { task, text, targetLang, stream?, paperContext?, question?, chatHistory? }
 *     task: "metadata" | "summary" | "terms" | "translate" | "explain" | "rewrite" | "chat"
 *     text: paper text (or selected text for translate/explain/rewrite)
 *     targetLang: "zh" | "ja" | "ko" | "es" | "pt" | "fr" | "de"
 *
 *   OPTIONS /api/ai-paper  (CORS preflight)
 */

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-20250514';

const LANG_MAP = {
  zh: 'Simplified Chinese',
  ja: 'Japanese',
  ko: 'Korean',
  es: 'Spanish',
  pt: 'Portuguese',
  fr: 'French',
  de: 'German',
};

const SYSTEM_PROMPTS = {
  metadata: `You are an academic paper metadata extractor. Given the text of a research paper, extract and return a JSON object with these fields:
- "title": the paper's title (English)
- "authors": author names as a comma-separated string
- "year": publication year (string)
- "journal": journal or conference name
If you cannot determine a field, use "—" as the value. Return ONLY the JSON object, no other text.`,

  summary: `You are an academic paper reading assistant. Your job is to help non-experts understand research papers. Given a research paper, provide a clear summary in {TARGET_LANG} that anyone can understand, even without background in this field.

Include:
1. What problem does this paper try to solve? (in one sentence)
2. How did they approach it? (methodology in simple terms)
3. What did they find? (key results)
4. Why does it matter? (significance)

Rules:
- Use everyday language, avoid jargon
- If you must use a technical term, explain it immediately
- Use analogies and examples where helpful
- Keep it under 500 words
- Write as if explaining to a smart friend who knows nothing about this field
- Format with ### headings`,

  terms: `You are an academic vocabulary expert. From the following research paper, identify 8-15 key technical terms that a non-expert reader would likely not understand.

For each term, provide in {TARGET_LANG}:
1. The English term
2. A one-line academic definition
3. A one-line plain explanation (as if explaining to a 15-year-old)
4. An example of how it's used in daily life (if applicable)

Return as JSON array:
[
  {
    "term": "regression analysis",
    "academic": "A statistical method for examining relationships between variables",
    "plain": "A way to figure out if two things are related to each other, and by how much",
    "example": "Like checking if studying more hours actually leads to better test scores"
  }
]

Return ONLY the JSON array, no other text.

Paper text:`,

  translate: `You are a professional academic translator. Translate the following passage from English to {TARGET_LANG}.

Rules:
- Maintain academic rigor and precision
- Keep technical terms with English originals in parentheses, e.g., "回归分析（regression analysis）"
- Preserve the original meaning exactly
- Keep the same paragraph structure

Passage to translate:`,

  explain: `You are an expert at explaining complex academic concepts in simple, everyday language. A user is reading a research paper and has highlighted a passage they don't understand.

Your job:
1. Explain what this passage means in {TARGET_LANG} using the simplest possible language
2. If there are technical terms, explain each one as if talking to a high school student
3. Use analogies from daily life where possible
4. If the passage contains data or statistics, explain what the numbers actually mean in practical terms
5. Keep the explanation concise but thorough

Paper context (for reference):
{PAPER_CONTEXT}

The user highlighted:`,

  rewrite: `You are an academic writing assistant. A user wants to reference a finding from a research paper in their own writing. Help them rephrase it in {TARGET_LANG} in their own words while maintaining academic integrity.

Provide 2-3 rewrite options:
1. A formal academic version (suitable for a thesis or journal paper)
2. A semi-formal version (suitable for a report or presentation)
3. A casual version (suitable for a blog post or study notes)

Each version should:
- Convey the same meaning as the original
- Use completely different sentence structure and wording
- Be clearly NOT plagiarism
- Include a suggested citation format: (Author, Year)

Paper context (for reference):
{PAPER_CONTEXT}

Original passage:`,

  chat: `You are a patient, knowledgeable research assistant helping someone understand an academic paper. Answer the user's question in {TARGET_LANG}.

Rules:
- Base your answer ONLY on the paper content provided
- If the answer cannot be found in the paper, say so honestly
- Use simple, clear language
- If the question involves a technical concept, explain it from scratch
- Keep answers concise (under 200 words unless the question requires more detail)

Paper content:
{PAPER_TEXT}`,
};

const MAX_TOKENS = {
  metadata: 512,
  summary: 4096,
  terms: 4096,
  translate: 4096,
  explain: 2048,
  rewrite: 2048,
  chat: 1024,
};

const TEMPERATURE = {
  metadata: 0,
  summary: 0,
  terms: 0,
  translate: 0,
  explain: 0.1,
  rewrite: 0.2,
  chat: 0.3,
};

// CORS headers
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*', // TODO: restrict to pdf-slick.com in production
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

function corsResponse(body, init = {}) {
  const headers = new Headers(init.headers || {});
  for (const [k, v] of Object.entries(CORS_HEADERS)) {
    headers.set(k, v);
  }
  return new Response(body, { ...init, headers });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return corsResponse(null, { status: 204 });
    }

    const url = new URL(request.url);
    if (request.method !== 'POST' || url.pathname !== '/api/ai-paper') {
      return corsResponse(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return corsResponse(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { task, text, targetLang, paperContext, chatHistory } = body;

    if (!task || !text || !targetLang) {
      return corsResponse(JSON.stringify({ error: 'Missing required fields: task, text, targetLang' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!SYSTEM_PROMPTS[task]) {
      return corsResponse(JSON.stringify({ error: 'Invalid task: ' + task }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const langName = LANG_MAP[targetLang] || 'English';

    // Build system prompt
    let systemPrompt = SYSTEM_PROMPTS[task]
      .replace(/\{TARGET_LANG\}/g, langName);

    if (task === 'explain' || task === 'rewrite') {
      const ctx = (paperContext || text).substring(0, 15000);
      systemPrompt = systemPrompt.replace('{PAPER_CONTEXT}', ctx);
    }

    if (task === 'chat') {
      systemPrompt = systemPrompt.replace('{PAPER_TEXT}', text.substring(0, 30000));
    }

    // Build messages array
    let messages;
    if (task === 'chat') {
      messages = [];
      if (chatHistory && Array.isArray(chatHistory)) {
        for (const msg of chatHistory) {
          messages.push({ role: msg.role, content: msg.content });
        }
      }
      const question = body.question || 'Please summarize the key points.';
      messages.push({ role: 'user', content: question });
    } else {
      const truncatedText = text.substring(0, 30000);
      messages = [{ role: 'user', content: truncatedText }];
    }

    if (!env.CLAUDE_API_KEY) {
      return corsResponse(JSON.stringify({ error: 'API key not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const wantStream = body.stream !== false;

    try {
      const claudeBody = {
        model: MODEL,
        max_tokens: MAX_TOKENS[task] || 4096,
        temperature: TEMPERATURE[task] ?? 0,
        system: systemPrompt,
        messages,
        stream: wantStream,
      };

      const claudeRes = await fetch(CLAUDE_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.CLAUDE_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(claudeBody),
      });

      if (!claudeRes.ok) {
        const errText = await claudeRes.text();
        console.error('Claude API error:', claudeRes.status, errText);
        return corsResponse(JSON.stringify({ error: 'AI processing failed', detail: errText }), {
          status: 502,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (wantStream) {
        return corsResponse(claudeRes.body, {
          status: 200,
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          },
        });
      } else {
        const data = await claudeRes.json();
        const content = data.content?.[0]?.text || '';
        return corsResponse(JSON.stringify({ result: content }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    } catch (err) {
      console.error('Worker error:', err);
      return corsResponse(JSON.stringify({ error: 'Internal worker error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  },
};
