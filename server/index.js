// Production server: serves the built app from dist/ with security headers and
// mounts the webhook proxy at /api/generate. Run with `npm start` after `npm run build`.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGenerateHandler, loadConfig } from './proxy.js';

const DIST = resolve(fileURLToPath(new URL('../dist', import.meta.url)));
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

const SECURITY_HEADERS = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' https://fonts.googleapis.com",
    'font-src https://fonts.gstatic.com',
    "img-src 'self' blob: data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; '),
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
};

let config;
try {
  config = loadConfig(process.env);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
const handleGenerate = createGenerateHandler(config);

const server = createServer(async (req, res) => {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(name, value);

  const { pathname } = new URL(req.url ?? '/', 'http://localhost');
  if (pathname === '/api/generate') return handleGenerate(req, res);

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    return res.end();
  }

  try {
    const file = await resolveStatic(pathname);
    const body = await readFile(file);
    const isHashedAsset = file.startsWith(join(DIST, 'assets') + sep);
    res.writeHead(200, {
      'Content-Type': MIME[extname(file)] ?? 'application/octet-stream',
      'Content-Length': body.byteLength,
      'Cache-Control': isHashedAsset ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
});

/** Maps a URL path to a file inside dist/, refusing anything that escapes it or is a dotfile. */
async function resolveStatic(pathname) {
  const decoded = decodeURIComponent(pathname);
  if (decoded.includes('\0') || decoded.split('/').some((part) => part.startsWith('.'))) {
    throw new Error('forbidden');
  }
  const candidate = resolve(DIST, '.' + decoded);
  if (candidate !== DIST && !candidate.startsWith(DIST + sep)) throw new Error('forbidden');

  const info = await stat(candidate).catch(() => null);
  if (info?.isFile()) return candidate;
  if (info?.isDirectory()) return join(candidate, 'index.html');
  // Single-page app: unknown routes without a file extension fall back to index.html.
  if (!extname(decoded)) return join(DIST, 'index.html');
  throw new Error('not found');
}

// Guard against slow-client attacks holding connections open.
server.headersTimeout = 20_000;
server.requestTimeout = config.upstreamTimeoutMs + 30_000;

server.listen(PORT, HOST, () => {
  console.log(`Try-On Studio listening on http://${HOST}:${PORT}`);
});
