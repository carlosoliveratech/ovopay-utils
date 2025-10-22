const https = require('https');
const dns = require('dns').promises;
const net = require('net');
const { createError, AppError } = require('../errors');
const { isPrivateAddress } = require('../utils/ip');
const { detectMime } = require('../utils/mime');
const { isLikelyBase64Chunk } = require('../utils/base64');
const { decryptBlock, decryptBuffer, RSA_BLOCK_SIZE } = require('../utils/crypto');

const MAX_BASE64_BYTES = 25 * 1024 * 1024; // 25MB safety guard for base64 payloads.
const PRELUDE_INSPECTION_BYTES = 4096;
const BASE64_PAYLOAD_REGEX = /^[A-Za-z0-9+/]+={0,2}$/;

function parseAndValidateUrl(urlString) {
  let parsed;
  try {
    parsed = new URL(urlString);
  } catch (error) {
    throw createError('INVALID_PAYLOAD', 'imageURL must be a valid HTTPS URL.', 400);
  }

  if (parsed.protocol !== 'https:') {
    throw createError('INVALID_PAYLOAD', 'Only HTTPS URLs are allowed.', 400);
  }

  if (!parsed.hostname) {
    throw createError('INVALID_PAYLOAD', 'imageURL must include a hostname.', 400);
  }

  if (parsed.username || parsed.password) {
    throw createError('INVALID_PAYLOAD', 'Authentication information in URL is not allowed.', 400);
  }

  if (parsed.port && parsed.port !== '443') {
    throw createError('INVALID_PAYLOAD', 'Only standard HTTPS port 443 is permitted.', 400);
  }

  return parsed;
}

async function assertPublicHostname(url) {
  if (net.isIP(url.hostname)) {
    if (isPrivateAddress(url.hostname)) {
      throw createError('INVALID_PAYLOAD', 'Target host is not publicly routable.', 400);
    }
    return;
  }

  let records;
  try {
    records = await dns.lookup(url.hostname, { all: true });
  } catch (error) {
    throw createError('DOWNLOAD_ERROR', `Unable to resolve host: ${url.hostname}`, 502, {
      cause: error,
    });
  }

  if (!records || records.length === 0) {
    throw createError('DOWNLOAD_ERROR', `No DNS records found for ${url.hostname}`, 502);
  }

  for (const record of records) {
    if (isPrivateAddress(record.address)) {
      throw createError('INVALID_PAYLOAD', 'Target host resolves to a private address.', 400);
    }
  }
}

function downloadEncryptedResource(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(
      {
        hostname: url.hostname,
        path: `${url.pathname || ''}${url.search || ''}`,
        port: url.port || 443,
        protocol: url.protocol,
        timeout: 15000,
        headers: {
          'User-Agent': 'ovopay-utils/1.0',
          Accept: '*/*',
        },
        rejectUnauthorized: true,
      },
      (response) => {
        if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400) {
          response.resume();
          reject(
            createError(
              'DOWNLOAD_ERROR',
              'Redirect responses are not supported for security reasons.',
              502
            )
          );
          return;
        }

        if (response.statusCode && response.statusCode >= 400) {
          response.resume();
          reject(
            createError(
              'DOWNLOAD_ERROR',
              `Remote server responded with status ${response.statusCode}.`,
              502
            )
          );
          return;
        }

        resolve({
          stream: response,
          contentType: response.headers['content-type'],
        });
      }
    );

    request.on('timeout', () => {
      request.destroy(new Error('Request timed out'));
    });

    request.on('error', (error) => {
      reject(createError('DOWNLOAD_ERROR', error.message, 502, { cause: error }));
    });
  });
}

class RsaStreamDecryptor {
  constructor(privateKey, res, options = {}) {
    this.privateKey = privateKey;
    this.res = res;
    this.contentTypeHint = options.contentTypeHint;
    this.leftover = Buffer.alloc(0);
    this.headersSent = false;
    this.detectedType = undefined;
    this.preludeBuffer = Buffer.alloc(0);
  }

  write(chunk) {
    if (!chunk || chunk.length === 0) {
      return;
    }

    const combined = this.leftover.length ? Buffer.concat([this.leftover, chunk]) : chunk;
    const fullBlocks = Math.floor(combined.length / RSA_BLOCK_SIZE);
    const usedBytes = fullBlocks * RSA_BLOCK_SIZE;

    for (let offset = 0; offset < usedBytes; offset += RSA_BLOCK_SIZE) {
      const block = combined.subarray(offset, offset + RSA_BLOCK_SIZE);
      const decrypted = decryptBlock(block, this.privateKey);
      this.handleDecryptedChunk(decrypted);
    }

    this.leftover = combined.subarray(usedBytes);
  }

  handleDecryptedChunk(chunk) {
    if (this.headersSent) {
      this.res.write(chunk);
      return;
    }

    this.preludeBuffer = this.preludeBuffer.length
      ? Buffer.concat([this.preludeBuffer, chunk])
      : chunk;

    if (!this.detectedType) {
      this.detectedType = detectMime(this.preludeBuffer) || this.normalizeContentTypeHint();
    }

    if (this.detectedType || this.preludeBuffer.length >= PRELUDE_INSPECTION_BYTES) {
      this.sendHeaders();
      this.res.write(this.preludeBuffer);
      this.preludeBuffer = Buffer.alloc(0);
    }
  }

  normalizeContentTypeHint() {
    if (!this.contentTypeHint) {
      return undefined;
    }
    const hint = String(this.contentTypeHint).split(';')[0].trim().toLowerCase();
    return hint.startsWith('image/') ? hint : undefined;
  }

  sendHeaders() {
    if (this.headersSent) {
      return;
    }

    const type =
      this.detectedType || this.normalizeContentTypeHint() || 'application/octet-stream';
    this.res.setHeader('Content-Type', type);
    this.headersSent = true;
  }

  finish() {
    if (this.leftover.length !== 0) {
      throw createError(
        'INVALID_ENCRYPTED_SIZE',
        'Encrypted payload size must be a multiple of 256 bytes.',
        422
      );
    }

    if (!this.headersSent) {
      if (!this.detectedType) {
        this.detectedType =
          detectMime(this.preludeBuffer) || this.normalizeContentTypeHint() || undefined;
      }
      this.sendHeaders();
      if (this.preludeBuffer.length) {
        this.res.write(this.preludeBuffer);
      }
    }

    this.res.end();
  }
}

async function decryptEncryptedStream({ sourceStream, res, privateKey, contentTypeHint }) {
  const decryptor = new RsaStreamDecryptor(privateKey, res, { contentTypeHint });
  let maybeBase64 = true;
  const bufferedChunks = [];
  let streaming = false;
  let totalBuffered = 0;

  try {
    for await (const chunk of sourceStream) {
      if (!streaming) {
        bufferedChunks.push(chunk);
        totalBuffered += chunk.length;

        if (maybeBase64) {
          maybeBase64 = isLikelyBase64Chunk(chunk);
        }

        if (!maybeBase64) {
          streaming = true;
          const buffered = Buffer.concat(bufferedChunks);
          decryptor.write(buffered);
          bufferedChunks.length = 0;
        } else if (totalBuffered > MAX_BASE64_BYTES) {
          throw createError(
            'PAYLOAD_TOO_LARGE',
            `Base64 payload exceeds ${MAX_BASE64_BYTES} bytes limit.`,
            413
          );
        }
        continue;
      }

      decryptor.write(chunk);
    }

    if (!streaming) {
      const buffered = bufferedChunks.length
        ? Buffer.concat(bufferedChunks)
        : Buffer.alloc(0);

      if (buffered.length === 0) {
        decryptor.finish();
        return;
      }

      if (maybeBase64) {
        const base64String = buffered.toString('utf8').replace(/\s/g, '');
        if (!base64String || base64String.length % 4 !== 0) {
          throw createError('INVALID_BASE64', 'Encrypted payload is not valid base64.', 422);
        }
        const encryptedBuffer = Buffer.from(base64String, 'base64');
        decryptor.write(encryptedBuffer);
      } else {
        decryptor.write(buffered);
      }
    }

    decryptor.finish();
  } catch (error) {
    sourceStream.destroy();
    if (error instanceof AppError) {
      throw error;
    }
    throw createError('DECRYPTION_FAILED', error.message, 422, { cause: error });
  }
}

function decodeEncryptedStringToBuffer(encryptedString) {
  const sanitized = encryptedString.replace(/\s/g, '');

  if (!sanitized || sanitized.length % 4 !== 0 || !BASE64_PAYLOAD_REGEX.test(sanitized)) {
    throw createError('INVALID_BASE64', 'Encrypted payload is not valid base64.', 422);
  }

  const buffer = Buffer.from(sanitized, 'base64');

  if (buffer.length === 0) {
    throw createError('INVALID_ENCRYPTED_PAYLOAD', 'Encrypted payload is empty.', 422);
  }

  return buffer;
}

async function handleDecryptImage({ imageUrl, res, privateKey }) {
  const url = parseAndValidateUrl(imageUrl);
  await assertPublicHostname(url);
  const download = await downloadEncryptedResource(url);
  await decryptEncryptedStream({
    sourceStream: download.stream,
    res,
    privateKey,
    contentTypeHint: download.contentType,
  });
}

async function handleDecryptData({ encryptedData, privateKey }) {
  try {
    const buffer = decodeEncryptedStringToBuffer(encryptedData);
    return decryptBuffer(buffer, privateKey);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw createError('DECRYPTION_FAILED', error.message, 422, { cause: error });
  }
}

module.exports = {
  parseAndValidateUrl,
  assertPublicHostname,
  downloadEncryptedResource,
  decryptEncryptedStream,
  handleDecryptImage,
  handleDecryptData,
};
