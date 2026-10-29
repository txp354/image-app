# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev`: Vite dev server at http://localhost:5173. Also mounts the `/api/generate` proxy via a plugin in `vite.config.ts`.
- `npm run build`: type-check (`tsc -b`) then production build to `dist/`. There is no linter or test suite, so this is the main correctness check.
- `npm start`: production server (`server/index.js`). Serves `dist/` and the proxy. Loads `.env` via `node --env-file-if-exists` (Node 22.9+).
- `.env` is read only at startup, so restart the dev or prod server after changing it. The variable reference is in `README.md` and `.env.example`.

## Verifying changes

There are no automated tests, so check the proxy with curl against a running server.
- Send a real `Origin` header (`-H "Origin: http://localhost:5173"`); without one, the proxy returns 403.
- Test images need real magic bytes. A PNG signature (`89 50 4E 47 0D 0A 1A 0A`) plus padding is enough.
- To exercise the upstream path without triggering the paid n8n workflow, run `WEBHOOK_URL=https://httpbin.org/post PORT=3999 node server/index.js`. A successful request should then get a 502 "did not return an image", which proves forwarding and response validation work.
- After `npm run build`, `grep -r n8n.cloud dist` must find nothing.

## What this is

React 18 + TypeScript SPA (Vite 6, Tailwind v4 via `@tailwindcss/vite`, `lucide-react`), plus a dependency-free Node proxy.
- The user uploads `image1` (person) and `image2` (garment).
- The browser POSTs them to its own origin at `/api/generate`.
- The proxy forwards them to an n8n webhook and returns the binary image.

## Architecture

- **Secrets never reach the browser.** `WEBHOOK_URL` / `WEBHOOK_AUTH_*` are read in Node only:
  - in dev, via `loadEnv(mode, cwd, '')` in `vite.config.ts`;
  - in prod, via `process.env` in `server/index.js`.
  - Never give them a `VITE_` prefix or import them from `src/`, because Vite inlines `VITE_*` into the bundle. After building, `grep -r n8n.cloud dist` should find nothing.
- **`server/proxy.js` is the single request handler** for both dev and prod.
  - It applies, in order: method, Origin, rate limit, concurrency cap, body size, multipart parse, per-field magic-byte check, then forwards to n8n.
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
- **Prod security headers** (CSP etc.) are set in `server/index.js`. They are not applied in dev, because Vite HMR needs inline scripts. If you add an external resource (font, CDN, analytics), update the CSP there.

## n8n gotchas

- The production URL is `/webhook/...`. `/webhook-test/...` answers only once, after "Execute workflow".
- The Webhook node should use Header Auth that matches `WEBHOOK_AUTH_HEADER` / `WEBHOOK_AUTH_VALUE`.
- The workflow must end in "Respond to Webhook" with a binary file response. Non-image responses become a 502 from the proxy.

## Styling conventions

The visual style is a neutral editorial retail look (style reference only; no third-party branding):
- White background, 1px `ink` borders, `well` grey image areas, square corners.
- Labels are small uppercase with `tracking-[0.14em]`. The primary button is solid `ink`; secondary buttons are outlined.
- Design tokens (`ink`, `muted`, `line`, `well`, font Jost) are defined in the `@theme` block in `src/index.css`. There is no `tailwind.config.js`.
