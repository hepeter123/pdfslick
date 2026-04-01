# AI Paper Reader — Cloudflare Worker Deployment Guide

This guide walks you through deploying the AI Paper Reader backend (Cloudflare Worker) that proxies requests to the DeepSeek API.

---

## Prerequisites

1. **DeepSeek API account** — Sign up at https://platform.deepseek.com
2. **Cloudflare account** — The same account used for pdf-slick.com
3. **Node.js 18+** — Required for the Wrangler CLI
4. **Wrangler CLI** — Cloudflare's deployment tool

---

## Step 1: Get a DeepSeek API Key

1. Go to https://platform.deepseek.com/api_keys
2. Create a new API key
3. Copy the key (starts with `sk-...`) — you'll need it in Step 4

---

## Step 2: Install Wrangler

```bash
npm install -g wrangler
```

Then log in to your Cloudflare account:

```bash
wrangler login
```

---

## Step 3: Deploy the Worker

```bash
cd workers/ai-paper
wrangler deploy
```

Note the URL, e.g.:
```
https://pdfslick-ai-paper.YOUR_SUBDOMAIN.workers.dev
```

---

## Step 4: Set the API Key Secret

```bash
wrangler secret put DEEPSEEK_API_KEY
```

When prompted, paste your DeepSeek API key. This is stored encrypted — it never appears in code or logs.

---

## Step 5: Update the Frontend

Open `js/ai-paper.js` and set the `WORKER_URL` constant:

```javascript
const WORKER_URL = 'https://pdfslick-ai-paper.YOUR_SUBDOMAIN.workers.dev';
```

Replace `YOUR_SUBDOMAIN` with your actual Cloudflare Workers subdomain.

---

## Step 6: (Optional) Custom Domain

To use `ai-api.pdf-slick.com`:

1. In Cloudflare dashboard → **Workers & Pages** → your worker → **Settings** → **Triggers**
2. Add **Custom Domain**: `ai-api.pdf-slick.com`
3. Update `WORKER_URL` in `js/ai-paper.js`:
   ```javascript
   const WORKER_URL = 'https://ai-api.pdf-slick.com';
   ```

---

## Step 7: (Optional) Restrict CORS

For production, edit `worker.js`:

```javascript
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'https://pdf-slick.com',
};
```

---

## Step 8: Rebuild & Deploy

```bash
node build-i18n.js
git add .
git commit -m "Connect AI Paper Reader to DeepSeek API"
git push
```

---

## Testing

1. Open https://pdf-slick.com/ai-paper/
2. Upload a PDF paper
3. Select text → click Explain/Translate/Rewrite
4. Verify:
   - AI responds with streaming text (typing effect)
   - Summary and Key Terms work
   - Chat Q&A responds
   - Error messages display properly for failures

---

## Cost Estimation (DeepSeek-V3)

DeepSeek-V3 pricing (as of 2025):
- Input: ~$0.27 / million tokens (cache hit: $0.07)
- Output: ~$1.10 / million tokens

Per paper (estimated ~8k input + ~2k output tokens per task):
- **~$0.005 per task** (very affordable!)
- **~$0.02-0.03 per full paper analysis** (summary + terms + a few explains)

Much cheaper than Claude/GPT-4 while delivering comparable quality for this use case.

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "API key not configured" | Run `wrangler secret put DEEPSEEK_API_KEY` again |
| CORS errors | Check `Access-Control-Allow-Origin` in worker.js |
| 402 error | DeepSeek balance exhausted — top up at platform.deepseek.com |
| 429 error | Rate limited — wait and retry, or reduce request frequency |
| Streaming not working | Ensure `stream: true` in the request body |
| Worker not responding | Run `wrangler tail` to see live logs |

---

## File Reference

| File | Purpose |
|------|---------|
| `workers/ai-paper/worker.js` | Cloudflare Worker (DeepSeek API proxy) |
| `workers/ai-paper/wrangler.toml` | Worker configuration |
| `js/ai-paper.js` | Frontend logic (`WORKER_URL` is set here) |
| `.env` | Local env file with API key (NOT committed to git) |
| `MIMA.env` | API key backup (NOT committed to git) |
