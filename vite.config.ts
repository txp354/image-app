import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { createGenerateHandler, loadConfig } from './server/proxy.js';

// Mounts the same /api/generate proxy used in production on the dev server,
// so the webhook URL stays server-side during development too.
function generateApi(env: Record<string, string>): Plugin {
  return {
    name: 'generate-api',
    configureServer(server) {
      let handler: ReturnType<typeof createGenerateHandler> | null = null;
      try {
        handler = createGenerateHandler(loadConfig(env));
      } catch (err) {
        server.config.logger.warn(`\n${(err as Error).message}\n/api/generate will return 503 until .env is fixed.\n`);
      }
      server.middlewares.use('/api/generate', (req, res) => {
        if (handler) return handler(req, res);
        res.statusCode = 503;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Server is not configured. See .env.example.' }));
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // '' prefix loads all variables, not just VITE_*. They are used only here in
  // Node and are never exposed to the client bundle.
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), tailwindcss(), generateApi(env)],
  };
});
