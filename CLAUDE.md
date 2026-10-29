# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev`: Vite dev server at http://localhost:5173. Also mounts the `/api/generate` proxy via a plugin in `vite.config.ts`.
  - If 5173 is busy (often an old dev server), Vite silently moves to 5174+, which isn't in Supabase's redirect list. Use `npm run dev -- --port 5173 --strictPort`. Before stopping whatever holds the port, check that it's an old dev server for this project.
- `npm run build`: type-check (`tsc -b`) then production build to `dist/`. There is no linter or test suite, so this is the main correctness check.
- `npm start`: production server (`server/index.js`). Serves `dist/` and the proxy. Loads `.env` via `node --env-file-if-exists` (Node 22.9+).
- `.env` is read only at startup, so restart the dev or prod server after changing it. The variable reference is in `README.md` and `.env.example`.

## Verifying changes

There are no automated tests, so check the proxy with curl against a running server.
- Send a real `Origin` header (`-H "Origin: http://localhost:5173"`); without one, the proxy returns 403.
- Test images need real magic bytes. A PNG signature (`89 50 4E 47 0D 0A 1A 0A`) plus padding is enough.
- `/api/generate` needs `-H "Authorization: Bearer <access token>"` from a signed-in user, or it returns 401. A missing or fake token returning 401 shows that the auth check runs.
- To exercise the upstream path without triggering the paid n8n workflow, run `WEBHOOK_URL=https://httpbin.org/post PORT=3999 node --env-file=.env server/index.js`.
  - `--env-file` supplies the required `VITE_SUPABASE_*` values, and the inline `WEBHOOK_URL` takes precedence over the one in `.env`.
  - With a real user's token, the request should get a 502 "did not return an image", which proves forwarding and response validation work.
  - Start it with `run_in_background` and stop it afterwards. Don't broadly kill `node` processes.
- After `npm run build`, `grep -r n8n.cloud dist` must find nothing.

## What this is

React 18 + TypeScript SPA (Vite 6, Tailwind v4 via `@tailwindcss/vite`, `lucide-react`, `@supabase/supabase-js`), plus a dependency-free Node proxy. Production is https://image-app-beta-weld.vercel.app, deployed by Vercel from `main`.
- The user signs up (name, email, password) or signs in with Supabase Auth. The studio is hidden until they do.
- Signed-in users without a purchase see the paywall and pay $9.99 once through a Stripe Payment Link.
- The user uploads `image1` (person) and `image2` (garment).
- The browser POSTs them to its own origin at `/api/generate`.
- The proxy forwards them to an n8n webhook and returns the binary image.

## Architecture

- **Secrets never reach the browser.** `WEBHOOK_URL` / `WEBHOOK_AUTH_*` are read in Node only:
  - in dev, via `loadEnv(mode, cwd, '')` in `vite.config.ts`;
  - in prod, via `process.env` in `server/index.js`.
  - Never give them a `VITE_` prefix or import them from `src/`, because Vite inlines `VITE_*` into the bundle. After building, `grep -r n8n.cloud dist` should find nothing.
  - The exceptions are `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` and `VITE_STRIPE_PAYMENT_LINK_URL`. They are public by design, and both the client and `loadConfig()` read them. Never put a Supabase secret or service_role key anywhere.
- **`server/proxy.js` is the single request handler**, mounted in three places:
  - the Vite dev plugin (`vite.config.ts`);
  - the Node server (`server/index.js`, `npm start`);
  - the Vercel serverless function (`api/generate.js`). Vercel never runs `server/index.js`.
  - Security headers are duplicated in `server/index.js` and `vercel.json`. Change both.
  - Vercel caps request and response bodies at 4.5 MB. That's why `src/lib/resize.ts` downscales uploads in the browser before `api.ts` sends them. Keep the per-image target under half that limit.
  - It applies, in order: method, Origin, rate limit, Supabase session check (`verifyUser`, Bearer token checked against `/auth/v1/user`), paid-access check (`hasPaidAccess`: 402 if no purchase, 503 fail-closed if the lookup fails), concurrency cap, body size, multipart parse, per-field magic-byte check, then forwards to n8n.
  - Upstream errors are logged; users get generic JSON `{ error }` messages.
  - Config is parsed and validated in `loadConfig()`, which throws on bad config: the prod server exits, and the dev plugin answers 503.
  - `server/proxy.d.ts` hand-types the JS module for `vite.config.ts`. Keep it in sync.
  - The server is plain ESM JavaScript run directly by Node, with no build step and no npm dependencies. Keep it that way, so `npm start` works on any Node host.
  - New config: add it to `loadConfig()`, `ProxyConfig` in `proxy.d.ts`, `.env.example`, and the README table.
  - There is a single `tsconfig.json`. It includes `src`, `shared`, `server/*.d.ts` and `vite.config.ts`, with both `vite/client` and `node` types.
- **`shared/image-type.js`** (+ `.d.ts`) is imported by both the client (`src/lib/validate.ts`, `src/lib/api.ts`) and the server.
  - It holds the allowed types, the 10 MB limit and `sniffImageType()`.
  - Types are always determined by magic bytes, never by the reported MIME type. SVG is deliberately excluded, because a blob URL inherits the app origin.
- **Client state lives only in `App.tsx`.** The spec's `idle | ready | loading | success | error` state is derived, not stored.
  - `src/lib/api.ts` turns every failure into a user-readable `Error.message`, which the UI renders directly.
  - Object URLs: `ImageDropzone` creates and revokes its preview URL in an effect. `App` revokes the previous result URL through a ref when it changes and on unmount.
- **Auth** uses Supabase (`src/lib/supabase.ts`, `src/components/AuthForm.tsx`). `App.tsx` holds the session and renders `AuthForm` when signed out. `api.ts` attaches the access token. Sign-up stores the name as `full_name` metadata; a trigger copies it into `public.profiles` (RLS: own row only).
- **Prod security headers** (CSP etc.) are set in `server/index.js` and `vercel.json`. `connect-src` includes the Supabase URL: built from env in `server/index.js`, hardcoded in `vercel.json`. They are not applied in dev, because Vite HMR needs inline scripts. If you add an external resource (font, CDN, analytics), update the CSP there.

## Payments

- `public.purchases` is the source of truth for access: an unrefunded row with the user's `user_id`. Never put an access flag on `profiles`, because users can update their own profile row.
- Only the Edge Function `stripe-webhook` (`supabase/functions/stripe-webhook/index.ts`, service role) writes purchases.
  - It verifies `Stripe-Signature` with Web Crypto (no Stripe SDK or secret key) and needs the secret `STRIPE_WEBHOOK_SECRET`.
  - Deploy it with the Supabase MCP `deploy_edge_function`, `verify_jwt: false`.
  - Only Payment Links in its `ALLOWED_PAYMENT_LINKS` grant access. The user is matched by `client_reference_id`, which `src/lib/access.ts` appends to the link.
- The client gate (`App.tsx` + `Paywall.tsx`) is UX only. The proxy's `hasPaidAccess` is the enforcement.
- Stripe is test mode only (account `acct_1UW1LWQuQRTaVdNX`). The Payment Link redirects to production `/?checkout=success`. Going live is described in the README.
- Testing without email: sign up, then `update auth.users set email_confirmed_at = now() where email = ...`. Pay with the test card 4242 4242 4242 4242, and delete the test user afterwards.

## n8n gotchas

- The production URL is `/webhook/...`. `/webhook-test/...` answers only once, after "Execute workflow".
- The Webhook node should use Header Auth that matches `WEBHOOK_AUTH_HEADER` / `WEBHOOK_AUTH_VALUE`.
- The workflow must end in "Respond to Webhook" with a binary file response. Non-image responses become a 502 from the proxy.

## Supabase gotchas

- Project ref `hrzsfucxziefnjzttiia`. The Supabase MCP server is configured in `.mcp.json` (gitignored), so you can inspect tables, apply migrations and run advisors directly.
- Schema changes: apply with the MCP `apply_migration` tool, then save the same SQL to `supabase/migrations/<version>_<name>.sql`. Take `<version>` from `list_migrations`, so the repo matches the database. Run the security advisor afterwards.
  - Every table in `public` needs RLS plus policies.
  - Trigger functions use `security definer set search_path = ''`, with execute revoked from `anon`/`authenticated`.
- `src/lib/supabase.ts` throws at import when `VITE_SUPABASE_*` is missing, which shows as a blank page. Vercel needs these at build time.
- Auth URL Configuration: Site URL `https://image-app-beta-weld.vercel.app`; Redirect URLs are that URL with `/**` and `http://localhost:5173/**`. Confirmation links to any other origin fall back to the Site URL.
- Email confirmation is on, so `signUp` returns no session until the user clicks the emailed link. `AuthForm` handles that case. Supabase's built-in mailer is heavily rate-limited.
- The display name comes from `user_metadata.full_name`. `public.profiles` holds the same value for database queries.

## Styling conventions

The visual style is a neutral editorial retail look (style reference only; no third-party branding):
- White background, 1px `ink` borders, `well` grey image areas, square corners.
- Labels are small uppercase with `tracking-[0.14em]`. The primary button is solid `ink`; secondary buttons are outlined.
- Design tokens (`ink`, `muted`, `line`, `well`, font Jost) are defined in the `@theme` block in `src/index.css`. There is no `tailwind.config.js`.
