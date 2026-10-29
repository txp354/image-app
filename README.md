# Try-On Studio

Single-page client that uploads two images (`image1` = person, `image2` = garment) and shows
the merged image returned by an n8n workflow.

Stack: Vite + React + TypeScript + Tailwind CSS v4 + lucide-react, plus a small dependency-free
Node server (`server/`) that proxies requests to n8n.

## Run

```sh
cp .env.example .env   # then fill in WEBHOOK_URL (and the auth secret)
npm install
npm run dev            # http://localhost:5173 (includes the /api/generate proxy)

npm run build          # type-check + build to dist/
npm start              # serve dist/ + proxy on http://127.0.0.1:3000
```

Node 22.9+ is required (`npm start` uses `--env-file-if-exists`). Restart `npm run dev` / `npm start`
after editing `.env`.

## Configuration

All variables are server-side only and documented in `.env.example`.

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `WEBHOOK_URL` | yes | | n8n production webhook (`https://` only; the server refuses to start otherwise) |
| `WEBHOOK_AUTH_HEADER` | no | | Header name sent to n8n, e.g. `X-Webhook-Secret` |
| `WEBHOOK_AUTH_VALUE` | if header set | | Shared secret for that header |
| `ALLOWED_ORIGINS` | no | | Extra comma-separated origins allowed to call `/api/generate` |
| `TRUST_PROXY` | no | `false` | Use `X-Forwarded-For` for client IPs (only behind a reverse proxy) |
| `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW_MS` | no | `10` / `600000` | Requests per IP per window |
| `MAX_CONCURRENT` | no | `4` | Simultaneous requests forwarded to n8n |
| `UPSTREAM_TIMEOUT_MS` | no | `60000` | How long to wait for n8n |
| `HOST` / `PORT` | no | `127.0.0.1` / `3000` | Bind address for `npm start` |

## How requests flow

```
browser ──POST /api/generate──▶ server/proxy.js ──POST + secret header──▶ n8n webhook
```

The browser only ever talks to its own origin. `WEBHOOK_URL` and the auth secret are read on the
server and are never bundled into client code. **Do not add a `VITE_` prefix to them**, because
Vite embeds every `VITE_*` variable into the public JavaScript.

## Security measures

- The webhook URL and secret live server-side only (`.env`, which is gitignored).
- Optional shared-secret header sent to n8n (`WEBHOOK_AUTH_HEADER` / `WEBHOOK_AUTH_VALUE`).
- `/api/generate` rejects requests whose `Origin` is not the app's own (or `ALLOWED_ORIGINS`).
- Per-IP rate limit and a cap on concurrent upstream requests, to limit abuse of the paid AI workflow.
- Uploads are checked on both client and server:
  - at most 10 MB each, and only the `image1`/`image2` fields;
  - file type is identified by its magic bytes, not by the MIME type or extension the client reports;
  - files are renamed before being forwarded.
- The upstream response must be a real JPEG/PNG/WebP (checked by magic bytes, max 25 MB). Upstream
  error bodies are logged, not shown to users.
- `npm start` serves strict security headers:
  - CSP, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS;
  - blocks path traversal and dotfiles;
  - sets slow-client timeouts.

## n8n setup

1. Use the **production** URL (`/webhook/...`) with the workflow activated. `/webhook-test/` only
   answers once, after "Execute workflow" is clicked.
2. Webhook node → **Authentication: Header Auth**, using the same header name and value as
   `WEBHOOK_AUTH_HEADER` / `WEBHOOK_AUTH_VALUE`. Without this, anyone who learns the URL can call
   the workflow directly.
3. Browser CORS is no longer involved, because the proxy calls n8n server-to-server. You can remove the
   permissive *Allowed Origins* setting.
4. End the workflow with **Respond to Webhook → Binary File**.

## Troubleshooting

The error banner shows the proxy's message:

| Message | Cause |
| --- | --- |
| "Server is not configured" (503) | `WEBHOOK_URL` missing or invalid in `.env` (dev) or in Vercel's environment variables. The dev console / Vercel function logs print the reason. |
| "The image API was not found on this server (HTTP 404)" | Host isn't running the proxy, e.g. a static-only host, or `api/generate.js` wasn't deployed. |
| "The images are too large to upload" (413) | Host's body limit exceeded even after downscaling. |
| "The image service returned an error (HTTP 404)" | Workflow not activated, or wrong webhook ID. |
| "The image service returned an error (HTTP 401/403)" | Header Auth in n8n doesn't match `WEBHOOK_AUTH_*`. |
| "The image service did not return an image" | Workflow doesn't end with Respond to Webhook → Binary File. Server log shows what came back. |
| "Too many requests" | Rate limit hit; adjust `RATE_LIMIT_*`. |
| "Origin not allowed" | Page served from an origin other than the one being called; add it to `ALLOWED_ORIGINS`. |

## Deploying

### Vercel

Vercel serves `dist/` as static files and does **not** run `server/index.js`. Instead,
`api/generate.js` mounts the same proxy as a serverless function, and `vercel.json` adds the
security headers.

1. Import the GitHub repo in Vercel. `vercel.json` already sets the framework, build command
   and output directory.
2. Project → Settings → Environment Variables:
   - add `WEBHOOK_URL`;
   - add `WEBHOOK_AUTH_HEADER` / `WEBHOOK_AUTH_VALUE` if you use Header Auth;
   - add any optional limits.
   - Then **redeploy**, because env vars only apply to new deployments.
3. Vercel limits:
   - **Request bodies are capped at 4.5 MB.** The browser therefore downscales photos over ~1.8 MB to at most
     2048px (WebP, or JPEG as a fallback) before uploading (`src/lib/resize.ts`).
   - The response from n8n must also stay under 4.5 MB.
   - Rate limiting is per function instance, so it is a best-effort limit. `TRUST_PROXY` defaults to
     `true` here, because Vercel sets `X-Forwarded-For` itself.

### Any Node host

Run `npm run build && npm start`. Notes:
- Set `HOST=0.0.0.0` if the platform requires it.
- Serve it over HTTPS (normally via the platform or a reverse proxy).
- Set `TRUST_PROXY=true` when behind one, so rate limiting sees real client IPs.
- Static-only hosts (GitHub Pages, plain S3, etc.) won't work, because the proxy has to run somewhere.
