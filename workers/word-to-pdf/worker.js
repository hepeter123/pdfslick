/**
 * Cloudflare Worker: Word-to-PDF conversion proxy
 *
 * Accepts a .doc/.docx file upload via POST, forwards it to ConvertAPI,
 * and returns the resulting PDF to the client.
 *
 * Environment variables (set via `wrangler secret put`):
 *   CONVERTAPI_SECRET  — ConvertAPI secret key (required)
 *
 * Environment variables (set in wrangler.toml [vars]):
 *   ALLOWED_ORIGINS    — Comma-separated allowed origins for CORS
 */

export default {
  async fetch(request, env) {
    // ── CORS preflight ────────────────────────────────────
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(request, env),
      });
    }

    // ── Only POST allowed ─────────────────────────────────
    if (request.method !== 'POST') {
      return jsonError('Method not allowed', 405, request, env);
    }

    try {
      // ── Validate content type ───────────────────────────
      const ct = request.headers.get('content-type') || '';
      if (!ct.includes('multipart/form-data')) {
        return jsonError('Expected multipart/form-data', 400, request, env);
      }

      // ── Parse upload ────────────────────────────────────
      const form = await request.formData();
      const file = form.get('file');

      if (!file || typeof file.name !== 'string') {
        return jsonError('No file provided', 400, request, env);
      }

      // ── File size check (10 MB) ─────────────────────────
      if (file.size > 10 * 1024 * 1024) {
        return jsonError('File too large. Maximum size is 10 MB.', 413, request, env);
      }

      // ── Determine source format ─────────────────────────
      const name = file.name.toLowerCase();
      let fmt;
      if (name.endsWith('.docx')) fmt = 'docx';
      else if (name.endsWith('.doc')) fmt = 'doc';
      else return jsonError('Unsupported format. Upload .doc or .docx.', 400, request, env);

      // ── Check config ────────────────────────────────────
      if (!env.CONVERTAPI_SECRET) {
        console.error('CONVERTAPI_SECRET not configured');
        return jsonError('Service not configured', 500, request, env);
      }

      // ── Call ConvertAPI ─────────────────────────────────
      const apiUrl =
        `https://v2.convertapi.com/convert/${fmt}/to/pdf?Secret=${encodeURIComponent(env.CONVERTAPI_SECRET)}`;

      const apiForm = new FormData();
      apiForm.append('File', file, file.name);

      const apiRes = await fetch(apiUrl, { method: 'POST', body: apiForm });

      if (!apiRes.ok) {
        const body = await apiRes.text();
        console.error('ConvertAPI error', apiRes.status, body);
        return jsonError('Conversion failed. Please try again later.', 502, request, env);
      }

      const result = await apiRes.json();

      // ConvertAPI returns { Files: [{ FileData: "<base64>", ... }] }
      const fileData = result.Files && result.Files[0] && result.Files[0].FileData;
      if (!fileData) {
        console.error('ConvertAPI returned no file data', JSON.stringify(result).slice(0, 500));
        return jsonError('Conversion returned empty result.', 502, request, env);
      }

      // ── Decode base64 → binary ──────────────────────────
      const raw = atob(fileData);
      const bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);

      const pdfName = file.name.replace(/\.docx?$/i, '.pdf');

      // ── Return PDF ──────────────────────────────────────
      return new Response(bytes, {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${pdfName}"`,
          'Cache-Control': 'no-store',
          ...corsHeaders(request, env),
        },
      });
    } catch (err) {
      console.error('Worker error:', err);
      return jsonError('Internal server error', 500, request, env);
    }
  },
};

// ── Helpers ─────────────────────────────────────────────

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = env.ALLOWED_ORIGINS
    ? env.ALLOWED_ORIGINS.split(',').map((s) => s.trim())
    : [];

  // In dev (no ALLOWED_ORIGINS configured), allow any origin
  const isAllowed = allowed.length === 0 || allowed.includes('*') || allowed.includes(origin);

  return {
    'Access-Control-Allow-Origin': isAllowed ? (origin || '*') : '',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function jsonError(message, status, request, env) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(request, env),
    },
  });
}
