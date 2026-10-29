// POST /api/generate: validates the two uploads and forwards them to the n8n
// webhook. The webhook URL and auth secret exist only on the server; the
// browser never sees them. Used by both the Vite dev server (vite.config.ts)
// and the production server (server/index.js).
import { ALLOWED_TYPES, MAX_IMAGE_BYTES, sniffImageType } from '../shared/image-type.js';

const MAX_BODY_BYTES = 2 * MAX_IMAGE_BYTES + 512 * 1024; // two images + multipart overhead
const MAX_RESULT_BYTES = 25 * 1024 * 1024;
const FIELDS = ['image1', 'image2'];

/** Reads and validates server configuration. Throws with a readable message. */
export function loadConfig(env) {
  const errors = [];
  let webhookUrl;
  try {
    webhookUrl = new URL(env.WEBHOOK_URL ?? '');
    if (webhookUrl.protocol !== 'https:') errors.push('WEBHOOK_URL must use https://');
  } catch {
    errors.push('WEBHOOK_URL is missing or not a valid URL');
  }

  const authHeader = env.WEBHOOK_AUTH_HEADER?.trim() || '';
  const authValue = env.WEBHOOK_AUTH_VALUE || '';
  if (authHeader && !authValue) errors.push('WEBHOOK_AUTH_VALUE is required when WEBHOOK_AUTH_HEADER is set');

  if (errors.length) throw new Error(`Invalid server configuration:\n  - ${errors.join('\n  - ')}`);

  return {
    webhookUrl: webhookUrl.toString(),
    authHeader,
    authValue,
    allowedOrigins: (env.ALLOWED_ORIGINS || '')
      .split(',')
      .map((o) => o.trim().replace(/\/$/, ''))
      .filter(Boolean),
    trustProxy: env.TRUST_PROXY === 'true',
    rateLimitMax: positiveInt(env.RATE_LIMIT_MAX, 10),
    rateLimitWindowMs: positiveInt(env.RATE_LIMIT_WINDOW_MS, 10 * 60 * 1000),
    maxConcurrent: positiveInt(env.MAX_CONCURRENT, 4),
    upstreamTimeoutMs: positiveInt(env.UPSTREAM_TIMEOUT_MS, 60_000),
  };
}

/** @returns {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => void} */
export function createGenerateHandler(config) {
  const limiter = createRateLimiter(config.rateLimitMax, config.rateLimitWindowMs);
  let inFlight = 0;

  return async function handleGenerate(req, res) {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return sendError(res, 405, 'Method not allowed.');
    }
    if (!isAllowedOrigin(req, config.allowedOrigins)) {
      return sendError(res, 403, 'Origin not allowed.');
    }
    const contentType = req.headers['content-type'] || '';
    if (!contentType.startsWith('multipart/form-data')) {
      return sendError(res, 415, 'Expected multipart/form-data.');
    }

    const ip = clientIp(req, config.trustProxy);
    const retryAfter = limiter(ip);
    if (retryAfter) {
      res.setHeader('Retry-After', String(retryAfter));
      return sendError(res, 429, `Too many requests. Try again in ${retryAfter} seconds.`);
    }
    if (inFlight >= config.maxConcurrent) {
      res.setHeader('Retry-After', '30');
      return sendError(res, 503, 'The server is busy. Please try again shortly.');
    }

    inFlight++;
    try {
      const body = await readBody(req, MAX_BODY_BYTES);
      if (!body) return sendError(res, 413, 'Upload is too large. Each image must be 10 MB or less.');

      const form = await parseMultipart(body, contentType);
      if (!form) return sendError(res, 400, 'Malformed upload.');

      const outbound = new FormData();
      for (const field of FIELDS) {
        const file = form.get(field);
        if (!(file instanceof Blob)) return sendError(res, 400, `Missing ${field}.`);
        if (file.size > MAX_IMAGE_BYTES) return sendError(res, 413, `${field} is larger than 10 MB.`);
        const type = sniffImageType(new Uint8Array(await file.slice(0, 16).arrayBuffer()));
        if (!type) return sendError(res, 415, `${field} is not a JPEG, PNG or WebP image.`);
        // Re-wrap with the detected type and a neutral name; drop anything else the client sent.
        outbound.append(field, new Blob([file], { type }), `${field}.${type.split('/')[1]}`);
      }

      const headers = config.authHeader ? { [config.authHeader]: config.authValue } : {};
      let upstream;
      try {
        upstream = await fetch(config.webhookUrl, {
          method: 'POST',
          body: outbound,
          headers,
          redirect: 'error',
          signal: AbortSignal.timeout(config.upstreamTimeoutMs),
        });
      } catch (err) {
        const timedOut = err?.name === 'TimeoutError';
        console.error(`[generate] upstream ${timedOut ? 'timeout' : 'request failed'}:`, err?.message);
        return sendError(
          res,
          timedOut ? 504 : 502,
          timedOut
            ? 'The image service took too long to respond. Please try again.'
            : 'Could not reach the image service. Please try again.',
        );
      }

      if (!upstream.ok) {
        console.error(`[generate] upstream returned HTTP ${upstream.status}`);
        await upstream.body?.cancel();
        return sendError(res, 502, `The image service returned an error (HTTP ${upstream.status}).`);
      }

      const result = await readStream(upstream.body, MAX_RESULT_BYTES);
      if (!result) return sendError(res, 502, 'The image service returned a file that is too large.');
      const resultType = sniffImageType(result);
      if (!resultType || !ALLOWED_TYPES.includes(resultType)) {
        console.error(`[generate] upstream returned non-image content (${upstream.headers.get('content-type')})`);
        return sendError(res, 502, 'The image service did not return an image.');
      }

      res.writeHead(200, {
        'Content-Type': resultType,
        'Content-Length': result.byteLength,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      res.end(result);
    } catch (err) {
      console.error('[generate] unexpected error:', err);
      if (!res.headersSent) sendError(res, 500, 'Something went wrong. Please try again.');
      else res.destroy();
    } finally {
      inFlight--;
    }
  };
}

function sendError(res, status, message) {
  if (res.headersSent) return;
  const body = JSON.stringify({ error: message });
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(body);
}

/** Browsers always send Origin on cross-origin and same-origin POSTs; block other sites from using the proxy. */
function isAllowedOrigin(req, allowedOrigins) {
  const origin = req.headers.origin;
  if (!origin) return false;
  if (allowedOrigins.includes(origin)) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

function clientIp(req, trustProxy) {
  if (trustProxy) {
    const forwarded = req.headers['x-forwarded-for'];
    const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.socket.remoteAddress || 'unknown';
}

/** Fixed-window limiter. Returns seconds until retry when the limit is hit, otherwise 0. */
function createRateLimiter(max, windowMs) {
  const hits = new Map();
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) if (entry.resetAt <= now) hits.delete(key);
  }, windowMs);
  sweep.unref();

  return (key) => {
    const now = Date.now();
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    entry.count++;
    return entry.count > max ? Math.ceil((entry.resetAt - now) / 1000) : 0;
  };
}

/** Buffers the request body, or resolves null once it exceeds `limit` bytes. */
function readBody(req, limit) {
  const declared = Number(req.headers['content-length']);
  if (declared > limit) {
    req.resume();
    return Promise.resolve(null);
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > limit) {
        req.removeAllListeners('data');
        req.resume();
        resolve(null);
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function parseMultipart(body, contentType) {
  try {
    return await new Response(body, { headers: { 'Content-Type': contentType } }).formData();
  } catch {
    return null;
  }
}

/** Reads a web stream into a Uint8Array, or returns null once it exceeds `limit` bytes. */
async function readStream(stream, limit) {
  if (!stream) return new Uint8Array();
  const reader = stream.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

function positiveInt(value, fallback) {
  const n = Number.parseInt(value ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
