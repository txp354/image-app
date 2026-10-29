# Try-On Studio

Single-page client that uploads two images (`image1` = person, `image2` = garment) and shows
the merged image returned by an n8n workflow. Users must create an account (name, email,
password), sign in, and pay a one-time $9.99 through a Stripe Payment Link before they can use it.

Stack: Vite + React + TypeScript + Tailwind CSS v4 + lucide-react, Supabase Auth
(`@supabase/supabase-js`), Stripe Payment Links, plus a small dependency-free Node server (`server/`) that proxies
requests to n8n.

Production: https://image-app-beta-weld.vercel.app (Vercel, deployed from `main`).

## Run

```sh
cp .env.example .env   # then fill in the Supabase values and WEBHOOK_URL (and the auth secret)
npm install
npm run dev            # http://localhost:5173 (includes the /api/generate proxy)

npm run build          # type-check + build to dist/
npm start              # serve dist/ + proxy on http://127.0.0.1:3000
```

Node 22.9+ is required (`npm start` uses `--env-file-if-exists`). Restart `npm run dev` / `npm start`
after editing `.env`.

If port 5173 is already taken (often by an old dev server), Vite silently moves to 5174 or higher.
Sign-up confirmation links only return to URLs in Supabase's redirect list, which includes
`http://localhost:5173`. Stop the old server, or run `npm run dev -- --port 5173 --strictPort` to fail
instead of switching ports.

## Configuration

All variables are documented in `.env.example`. Only the `VITE_*` values reach the browser; they
are public by design. Everything else is server-side only.

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `VITE_SUPABASE_URL` | yes | | Supabase project URL (`https://` only). Bundled into the client; also used by the server to verify sessions |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | yes | | Supabase publishable key (`sb_publishable_...`). Never use the secret/service_role key here |
| `VITE_STRIPE_PAYMENT_LINK_URL` | yes | | Stripe Payment Link (`https://buy.stripe.com/...`). Bundled into the client; without it the paywall shows "Payments are not configured yet" |
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
browser ──sign up / sign in──────────────────────────────────────────▶ Supabase Auth
browser ──POST /api/generate + Bearer token──▶ server/proxy.js
                                                  ├─ verify token ──▶ Supabase Auth (/auth/v1/user)
                                                  ├─ check purchase ──▶ Supabase REST (purchases, as the user)
                                                  └─ POST + secret header ──▶ n8n webhook
browser ──Pay $9.99──▶ Stripe Payment Link ──redirect ?checkout=success──▶ browser
Stripe ──webhook──▶ Supabase Edge Function stripe-webhook ──▶ public.purchases
```

Apart from Supabase Auth, the browser only talks to its own origin. `WEBHOOK_URL` and the auth secret are read on the
server and are never bundled into client code. **Do not add a `VITE_` prefix to them**, because
Vite embeds every `VITE_*` variable into the public JavaScript.

## Accounts

Users sign up with name, email and password, and sign in with Supabase Auth
(`src/components/AuthForm.tsx`). The app is hidden until they're signed in.
- The name is sent as `full_name` user metadata. A database trigger copies it into
  `public.profiles` (`id`, `full_name`, `created_at`), which has row-level security so users can only
  read and update their own row. The schema is in `supabase/migrations/`; it has already been
  applied to the project.
- The browser sends the Supabase access token to `/api/generate`, and the proxy checks it against
  Supabase Auth (`/auth/v1/user`) before forwarding anything to n8n. Signed-out users get 401.
- Users and profiles can be viewed in the Supabase dashboard (project `hrzsfucxziefnjzttiia`):
  Authentication → Users, and Table Editor → `profiles`.

## Payments

Access costs a one-time $9.99, sold through a Stripe Payment Link.
1. A signed-in user without a purchase sees the paywall (`src/components/Paywall.tsx`). The
   "Pay $9.99" button opens `VITE_STRIPE_PAYMENT_LINK_URL` with `client_reference_id=<user id>`
   and `prefilled_email`.
2. When checkout completes, Stripe calls the Supabase Edge Function `stripe-webhook`
   (`supabase/functions/stripe-webhook/index.ts`). It verifies the `Stripe-Signature` header and
   inserts a row into `public.purchases`, linked to the user by `client_reference_id`.
   - Only sessions from the Payment Links listed in `ALLOWED_PAYMENT_LINKS` in that file count.
   - A full refund (`charge.refunded`) sets `refunded_at`, which revokes access.
3. Stripe redirects to `/?checkout=success`. The app polls `purchases` for up to 60 s until the
   webhook has landed, then unlocks the studio.
4. `/api/generate` also checks `purchases` (as the user, through RLS) and returns **402** without an
   unrefunded purchase, so the paywall can't be bypassed by calling the API directly.

`public.purchases` has RLS. Users can only read their own rows, and only the Edge Function
(service role) can write. View purchases in the Table Editor → `purchases`.

### Stripe objects (currently test mode)

| Object | ID |
| --- | --- |
| Product "Try-On Studio access" | `prod_VX612YqvBGoDUq` (price `price_1UW1p7QuQRTaVdNXDlvfx1wf`, $9.99 one-time) |
| Payment Link | `plink_1UW1pCQuQRTaVdNXIpm0O9Gr` → `https://buy.stripe.com/test_3cI9AVcgp7K68vrdXd8Ra00`, redirects to production `/?checkout=success` |
| Webhook endpoint | `we_1UW1q8QuQRTaVdNXnKsOoCl5` → `https://hrzsfucxziefnjzttiia.supabase.co/functions/v1/stripe-webhook` (`checkout.session.completed`, `checkout.session.async_payment_succeeded`, `charge.refunded`) |

The Edge Function needs the secret `STRIPE_WEBHOOK_SECRET` (the endpoint's `whsec_...` signing
secret), set in Supabase → Edge Functions → Secrets. It is deployed with JWT verification **off**,
because Stripe doesn't send a Supabase JWT; the Stripe signature authenticates requests instead.

Test-mode links accept only [test cards](https://docs.stripe.com/testing), e.g. `4242 4242 4242 4242`.
To test checkout locally, temporarily point the Payment Link's redirect at `http://localhost:5173/?checkout=success`.

### Going live

1. Activate the Stripe account. In live mode, create the same product/price, Payment Link (redirect
   `https://image-app-beta-weld.vercel.app/?checkout=success`) and webhook endpoint (same URL and events).
2. Add the live `plink_...` ID to `ALLOWED_PAYMENT_LINKS` in the Edge Function and redeploy it.
3. Set `STRIPE_WEBHOOK_SECRET` to the live endpoint's signing secret.
4. Set `VITE_STRIPE_PAYMENT_LINK_URL` to the live link in Vercel and redeploy.

### Supabase settings

Dashboard → Authentication → [URL Configuration](https://supabase.com/dashboard/project/hrzsfucxziefnjzttiia/auth/url-configuration):

| Setting | Value |
| --- | --- |
| Site URL | `https://image-app-beta-weld.vercel.app` |
| Redirect URLs | `https://image-app-beta-weld.vercel.app/**`<br>`http://localhost:5173/**` |

The sign-up form sends `emailRedirectTo: window.location.origin`. If that origin isn't in the
redirect list, Supabase sends the confirmation link to the Site URL instead. Vercel preview
deployments have their own URLs, so their links go to production unless you add the preview URL too.

**Email confirmation** is on by default. New users must click the emailed link before they can sign
in. Supabase's built-in mailer only sends a few emails per hour, so set up custom SMTP
(Authentication → Emails) before real users sign up.

## Security measures

- `/api/generate` requires a valid Supabase session and a paid, unrefunded purchase.
- Purchases are written only by the signature-verified Stripe webhook; users can't insert or update them.
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

**Blank page:** `VITE_SUPABASE_URL` or `VITE_SUPABASE_PUBLISHABLE_KEY` was missing when the app was
built or started. `src/lib/supabase.ts` throws, and the browser console shows the error. On Vercel,
add the variables and redeploy.

Sign-in form errors come straight from Supabase:

| Message | Cause |
| --- | --- |
| "Email not confirmed" | The user hasn't clicked the confirmation link yet. |
| "Invalid login credentials" | Wrong email or password, or no account with that email. |
| "Email rate limit exceeded" | Supabase's built-in mailer limit; wait, or set up custom SMTP. |
| Confirmation link opens the wrong site | The origin isn't in Redirect URLs (see [Supabase settings](#supabase-settings)). |

The error banner shows the proxy's message:

| Message | Cause |
| --- | --- |
| "Server is not configured" (503) | `WEBHOOK_URL` missing or invalid in `.env` (dev) or in Vercel's environment variables. The dev console / Vercel function logs print the reason. |
| "The image API was not found on this server (HTTP 404)" | Host isn't running the proxy, e.g. a static-only host, or `api/generate.js` wasn't deployed. |
| "The images are too large to upload" (413) | Host's body limit exceeded even after downscaling. |
| "The image service returned an error (HTTP 404)" | Workflow not activated, or wrong webhook ID. |
| "The image service returned an error (HTTP 401/403)" | Header Auth in n8n doesn't match `WEBHOOK_AUTH_*`. |
| "The image service did not return an image" | Workflow doesn't end with Respond to Webhook → Binary File. Server log shows what came back. |
| "Purchase access to start generating" (402) | No unrefunded row in `purchases` for this user. Check the Stripe webhook deliveries and the `stripe-webhook` function logs. |
| "Could not check your purchase" (503) | The server couldn't query Supabase for the purchase; check its logs. |
| "Please sign in to generate images" / "Your session has expired" (401) | Missing or invalid Supabase token, or the server can't reach Supabase (check its logs). |
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
   - add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (needed at build time and by the function);
   - add `VITE_STRIPE_PAYMENT_LINK_URL` (needed at build time);
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
   - The CSP in `vercel.json` hardcodes the Supabase project URL in `connect-src`. Update it if the
     project changes. (`server/index.js` builds it from `VITE_SUPABASE_URL`.)
4. If the production domain changes, update the Site URL and Redirect URLs in
   [Supabase settings](#supabase-settings).

### Any Node host

Run `npm run build && npm start`. Notes:
- Set `HOST=0.0.0.0` if the platform requires it.
- Serve it over HTTPS (normally via the platform or a reverse proxy).
- Set `TRUST_PROXY=true` when behind one, so rate limiting sees real client IPs.
- Static-only hosts (GitHub Pages, plain S3, etc.) won't work, because the proxy has to run somewhere.
