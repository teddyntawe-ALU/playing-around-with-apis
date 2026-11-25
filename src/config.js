// Centralised, environment-driven configuration.
// Nothing environment-specific (ports, keys, hostnames) lives in the source code.
import 'dotenv/config';
import os from 'node:os';

function toInt(value, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

// Express accepts true/false, a hop count, or a comma-separated list of addresses.
function parseTrustProxy(value) {
  if (value === undefined || value === '') return 'loopback';
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^\d+$/.test(value)) return Number(value);
  return value;
}

export function loadConfig(env = process.env) {
  return Object.freeze({
    env: env.NODE_ENV || 'development',
    port: toInt(env.PORT, 3000),
    host: env.HOST || '0.0.0.0',
    serverName: env.SERVER_NAME || os.hostname(),
    trustProxy: parseTrustProxy(env.TRUST_PROXY),
    openFda: Object.freeze({
      baseUrl: env.OPENFDA_BASE_URL || 'https://api.fda.gov',
      apiKey: env.OPENFDA_API_KEY || '',
      timeoutMs: toInt(env.OPENFDA_TIMEOUT_MS, 8000),
    }),
    cache: Object.freeze({
      ttlMs: toInt(env.CACHE_TTL_SECONDS, 300) * 1000,
      maxEntries: toInt(env.CACHE_MAX_ENTRIES, 500),
    }),
  });
}

export const config = loadConfig();
