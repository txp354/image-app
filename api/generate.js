// Vercel serverless function for POST /api/generate. Vercel serves dist/ as
// static files and never runs server/index.js, so the proxy is mounted here.
import { createGenerateHandler, loadConfig } from '../server/proxy.js';

let handler = null;
try {
  // Vercel overwrites X-Forwarded-For with the real client IP, so it is safe to trust by default.
  handler = createGenerateHandler(loadConfig({ TRUST_PROXY: 'true', ...process.env }));
} catch (err) {
  console.error(err.message);
}

export default function generate(req, res) {
  if (handler) return handler(req, res);
  res.statusCode = 503;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ error: 'Server is not configured. Check the environment variables in the Vercel project settings.' }));
}
