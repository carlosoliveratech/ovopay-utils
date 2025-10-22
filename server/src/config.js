const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const crypto = require('crypto');

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

function buildKeyAttempts(normalized) {
  const attempts = [];

  // Direct PEM input.
  if (normalized.includes('-----BEGIN')) {
    attempts.push({ key: normalized, format: 'pem' });
    return attempts;
  }

  const compact = normalized.replace(/\s+/g, '');

  if (!compact) {
    return attempts;
  }

  let decoded;
  try {
    decoded = Buffer.from(compact, 'base64');
  } catch (error) {
    return attempts;
  }

  if (!decoded || decoded.length === 0) {
    return attempts;
  }

  const asUtf8 = decoded.toString('utf8').trim();

  if (asUtf8.includes('-----BEGIN')) {
    attempts.push({ key: asUtf8, format: 'pem' });
  }

  // Support DER encoded keys (PKCS#1 or PKCS#8) that were base64-wrapped.
  attempts.push({ key: decoded, format: 'der', type: 'pkcs1' });
  attempts.push({ key: decoded, format: 'der', type: 'pkcs8' });

  return attempts;
}

function parsePrivateKey(rawValue) {
  if (!rawValue) {
    throw new Error('VALIDME_PRIVATE_KEY is empty.');
  }

  const normalized = normalizeMultiline(rawValue).trim();
  const attempts = buildKeyAttempts(normalized);

  for (const attempt of attempts) {
    try {
      return crypto.createPrivateKey({
        key: attempt.key,
        format: attempt.format,
        type: attempt.type,
      });
    } catch (error) {
      // try next
    }
  }

  throw new Error('VALIDME_PRIVATE_KEY must be provided in PEM format or base64-wrapped PEM/DER.');
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
