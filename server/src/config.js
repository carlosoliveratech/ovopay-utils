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
    //privateKey: normalizeMultiline(process.env.VALIDME_PRIVATE_KEY).trim(),
    privateKey: Buffer.from(process.env.VALIDME_PRIVATE_KEY, 'base64').toString('utf8'),
    apiRateLimit: Number.isFinite(apiRateLimit) && apiRateLimit > 0 ? apiRateLimit : 100,
    apiRateWindowMs: Number.isFinite(apiRateWindowMs) && apiRateWindowMs > 0 ? apiRateWindowMs : 60000,
  };

  return cachedConfig;
}

module.exports = { getConfig };
