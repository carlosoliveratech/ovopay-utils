const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

let cachedConfig;

function resolveEnvPath() {
  const candidates = [
    path.resolve(__dirname, '..', '.env'),
    path.resolve(__dirname, '..', '..', '.env'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

function loadEnvFile() {
  const envPath = resolveEnvPath();
  if (envPath) {
    dotenv.config({ path: envPath });
  } else {
    dotenv.config();
  }
}

function normalizeMultiline(value) {
  if (!value) {
    return value;
  }

  return value.includes('\\n') ? value.replace(/\\n/g, '\n') : value;
}

function parsePrivateKey(rawValue) {
  if (!rawValue) {
    return rawValue;
  }

  const normalized = normalizeMultiline(rawValue).trim();

  if (normalized.includes('-----BEGIN')) {
    return normalized;
  }

  const compact = normalized.replace(/\s+/g, '');

  try {
    const decoded = Buffer.from(compact, 'base64').toString('utf8').trim();
    if (decoded && decoded.includes('-----BEGIN')) {
      return decoded;
    }
  } catch (error) {
    // fall through to throw below
  }

  throw new Error('VALIDME_PRIVATE_KEY must be a PEM string or base64-encoded PEM.');
}

function getConfig() {
  if (cachedConfig) {
    return cachedConfig;
  }

  loadEnvFile();

  const required = ['VALIDME_PRIVATE_KEY'];

  const missing = required.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  const apiRateLimit = parseInt(process.env.API_RATE_LIMIT || '100', 10);
  const apiRateWindowMs = parseInt(process.env.API_RATE_WINDOW_MS || '60000', 10);

  cachedConfig = {
    port: parseInt(process.env.PORT || '3000', 10),
    supabaseUrl: process.env.VITE_SUPABASE_URL,
    supabaseAnonKey: process.env.VITE_SUPABASE_ANON_KEY,
    privateKey: parsePrivateKey(process.env.VALIDME_PRIVATE_KEY),
    apiRateLimit: Number.isFinite(apiRateLimit) && apiRateLimit > 0 ? apiRateLimit : 100,
    apiRateWindowMs: Number.isFinite(apiRateWindowMs) && apiRateWindowMs > 0 ? apiRateWindowMs : 60000,
  };

  return cachedConfig;
}

module.exports = { getConfig };
