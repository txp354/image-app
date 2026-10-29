import type { IncomingMessage, ServerResponse } from 'node:http';

export interface ProxyConfig {
  webhookUrl: string;
  authHeader: string;
  authValue: string;
  allowedOrigins: string[];
  trustProxy: boolean;
  rateLimitMax: number;
  rateLimitWindowMs: number;
  maxConcurrent: number;
  upstreamTimeoutMs: number;
}

export function loadConfig(env: Record<string, string | undefined>): ProxyConfig;
export function createGenerateHandler(
  config: ProxyConfig,
): (req: IncomingMessage, res: ServerResponse) => void;
