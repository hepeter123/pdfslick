# Word-to-PDF Worker Deployment Guide

This guide covers deploying the Cloudflare Worker that powers the Word-to-PDF conversion feature.

## Architecture

```
Browser  ──POST /──►  Cloudflare Worker  ──POST──►  ConvertAPI
         ◄── PDF ──                      ◄── PDF ──
```

The Worker acts as a proxy: it receives the uploaded Word file, forwards it to ConvertAPI for conversion, and streams the resulting PDF back to the browser.

## Prerequisites

- [Node.js](https://nodejs.org/) 18+
- A [Cloudflare account](https://dash.cloudflare.com/sign-up) (free)
- A [ConvertAPI account](https://www.convertapi.com/) (free tier: 250 conversions)

## Step 1: Get ConvertAPI Secret

1. Sign up at https://www.convertapi.com/
2. Go to your [dashboard](https://www.convertapi.com/a/auth)
3. Copy your **Secret** (not the API Key)

## Step 2: Install dependencies

```bash
cd workers/word-to-pdf
npm install
```

## Step 3: Test locally

```bash
npx wrangler dev
```

In another terminal, set the secret for local dev:
```bash
# Create a .dev.vars file for local secrets
echo "CONVERTAPI_SECRET=your_secret_here" > .dev.vars
```

Then restart `wrangler dev`. The Worker will be available at `http://localhost:8787`.

Test with curl:
```bash
curl -X POST http://localhost:8787 \
  -F "file=@test-document.docx" \
  --output result.pdf
```

## Step 4: Deploy to Cloudflare

```bash
# Login to Cloudflare (first time only)
npx wrangler login

# Deploy the Worker
npx wrangler deploy
```

After deployment, note the Worker URL (e.g., `https://pdfslick-word-to-pdf.<your-subdomain>.workers.dev`).

## Step 5: Set the ConvertAPI secret

```bash
npx wrangler secret put CONVERTAPI_SECRET
# Paste your ConvertAPI secret when prompted
```

## Step 6: Configure CORS (production)

Edit `wrangler.toml` and set your production domain:

```toml
[vars]
ALLOWED_ORIGINS = "https://pdfslick.com,https://www.pdfslick.com"
```

Then redeploy:
```bash
npx wrangler deploy
```

## Step 7: Update frontend

Edit `js/word-to-pdf.js` and replace the `WORKER_URL` constant:

```javascript
const WORKER_URL = 'https://pdfslick-word-to-pdf.<your-subdomain>.workers.dev';
```

## Cost Breakdown

### Cloudflare Workers (free plan)
- 100,000 requests/day
- 10ms CPU time per request
- No monthly cost

### ConvertAPI
| Plan | Conversions | Price |
|------|-------------|-------|
| Free trial | 250 (one-time) | $0 |
| Package 500 | 500 | $15 |
| Package 1500 | 1,500 | $29 |
| Package 5000 | 5,000 | $49 |

### Frontend rate limiting
The frontend enforces a per-user daily limit (3 free conversions/day via localStorage) to control costs. This is a soft limit — it can be bypassed by clearing storage, but it deters casual overuse.

For production, consider adding server-side rate limiting using Cloudflare's [Rate Limiting Rules](https://developers.cloudflare.com/waf/rate-limiting-rules/) (free tier: 1 rule).

## Optional: Custom domain routing

To serve the Worker from your own domain (e.g., `api.pdfslick.com/word-to-pdf`):

1. Go to Cloudflare Dashboard → Workers & Pages → your worker
2. Click "Settings" → "Triggers"
3. Add a custom route: `api.pdfslick.com/word-to-pdf/*`
4. Update `WORKER_URL` in the frontend accordingly

## Troubleshooting

**"Service not configured"** — The `CONVERTAPI_SECRET` is not set. Run `npx wrangler secret put CONVERTAPI_SECRET`.

**CORS errors** — Check `ALLOWED_ORIGINS` in `wrangler.toml` includes your frontend domain. For local dev, leave it empty to allow all origins.

**"Conversion failed"** — Check ConvertAPI dashboard for remaining credits. The free trial is 250 conversions total.

**Large file timeouts** — The Worker has a 30-second CPU time limit (paid plan). Files near the 10MB limit may take longer. ConvertAPI handles the heavy lifting, so timeouts are rare.
