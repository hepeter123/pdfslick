# AI Paper Assistant — Cloudflare Worker Deployment Guide

This guide walks you through deploying the AI Paper Assistant backend (Cloudflare Worker) that proxies requests to the Claude API.

---

## Prerequisites

1. **Anthropic API account** — Sign up at https://console.anthropic.com
2. **Cloudflare account** — The same account used for pdf-slick.com
3. **Node.js 18+** — Required for the Wrangler CLI
4. **Wrangler CLI** — Cloudflare's deployment tool

---

## Step 1: Get a Claude API Key

1. Go to https://console.anthropic.com/settings/keys
2. Click **Create Key**
3. Name it `pdfslick-ai-paper`
4. Copy the key (starts with `sk-ant-...`) — you'll need it in Step 4

---

## Step 2: Install Wrangler

```bash
npm install -g wrangler
```

Then log in to your Cloudflare account:

```bash
wrangler login
```

This opens a browser window for authentication.

---

## Step 3: Deploy the Worker

```bash
cd workers/ai-paper
wrangler deploy
```

On first deploy, Wrangler creates a `*.workers.dev` subdomain. Note the URL, e.g.:
```
https://pdfslick-ai-paper.YOUR_SUBDOMAIN.workers.dev
```

---

## Step 4: Set the API Key Secret

```bash
wrangler secret put CLAUDE_API_KEY
```

When prompted, paste your Claude API key from Step 1. This is stored encrypted — it never appears in code or logs.

---

## Step 5: Update the Frontend

Open `js/ai-paper.js` and set the `WORKER_URL` constant:

```javascript
const WORKER_URL = 'https://pdfslick-ai-paper.YOUR_SUBDOMAIN.workers.dev';
```

Replace `YOUR_SUBDOMAIN` with your actual Cloudflare Workers subdomain.

---

## Step 6: (Optional) Custom Domain

To use a custom domain like `ai-api.pdf-slick.com`:

1. In the Cloudflare dashboard, go to **Workers & Pages** > your worker > **Settings** > **Triggers**
2. Add a **Custom Domain**: `ai-api.pdf-slick.com`
3. Cloudflare auto-provisions DNS and SSL
4. Update `WORKER_URL` in `js/ai-paper.js`:
   ```javascript
   const WORKER_URL = 'https://ai-api.pdf-slick.com';
   ```

Alternatively, edit `workers/ai-paper/wrangler.toml` and uncomment the routes section:

```toml
routes = [
  { pattern = "ai-api.pdf-slick.com/*", zone_name = "pdf-slick.com" }
]
```

Then run `wrangler deploy` again.

---

## Step 7: (Optional) Restrict CORS

For production, edit `worker.js` and change the CORS origin from `*` to your domain:

```javascript
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'https://pdf-slick.com',
  // ...
};
```

---

## Step 8: Rebuild Language Pages

After updating `WORKER_URL`, regenerate the multi-language pages:

```bash
node build-i18n.js
```

Then commit and push:

```bash
git add .
git commit -m "Connect AI Paper Assistant to Worker"
git push
```

---

## Testing

1. Open https://pdf-slick.com/ai-paper/
2. Upload a PDF academic paper
3. Select a target language and click "Analyze with AI"
4. Verify:
   - Text extraction works (Step 1 completes)
   - AI metadata appears (Step 2)
   - Summary streams in with typing effect (Step 3)
   - Both translations complete (Steps 4-5)
   - Chat Q&A responds to questions

---

## Cost Estimation

Using Claude claude-sonnet-4-20250514:
- Input: ~$3 / million tokens
- Output: ~$15 / million tokens

Per paper (assuming ~10k tokens input, ~4k tokens output per task, 4 tasks):
- Input cost: 40k tokens = ~$0.12
- Output cost: 16k tokens = ~$0.24
- **Total per paper: ~$0.36**

Chat questions add ~$0.02-0.05 each.

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "API key not configured" | Run `wrangler secret put CLAUDE_API_KEY` again |
| CORS errors in browser | Check `Access-Control-Allow-Origin` in worker.js |
| 502 errors | Check Claude API status at https://status.anthropic.com |
| Streaming not working | Ensure `stream: true` in the fetch body |
| Worker not responding | Run `wrangler tail` to see live logs |

---

## File Reference

| File | Purpose |
|------|---------|
| `workers/ai-paper/worker.js` | Cloudflare Worker source code |
| `workers/ai-paper/wrangler.toml` | Worker configuration |
| `js/ai-paper.js` | Frontend logic (set `WORKER_URL` here) |
| `ai-paper/index.html` | AI Paper Assistant page |
