const crypto = require('crypto');
const { createError } = require('../errors');

const RSA_BLOCK_SIZE = 256;

function decryptBlock(block, privateKey) {
  try {
    return crypto.privateDecrypt(
      {
        key: privateKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      },
      block
    );
  } catch (primaryError) {
    try {
      return crypto.privateDecrypt(
        {
          key: privateKey,
          padding: crypto.constants.RSA_PKCS1_PADDING,
        },
        block
      );
    } catch (fallbackError) {
      throw createError('DECRYPTION_FAILED', fallbackError.message, 422, {
        cause: primaryError,
      });
    }
  }
}

function decryptBuffer(encryptedBuffer, privateKey) {
  if (!Buffer.isBuffer(encryptedBuffer) || encryptedBuffer.length === 0) {
    throw createError('INVALID_ENCRYPTED_PAYLOAD', 'Encrypted payload must be a non-empty buffer.', 422);
  }

  if (encryptedBuffer.length % RSA_BLOCK_SIZE !== 0) {
    throw createError(
      'INVALID_ENCRYPTED_SIZE',
      'Encrypted payload size must be a multiple of 256 bytes.',
      422
    );
  }

  const decryptedBlocks = [];

  for (let offset = 0; offset < encryptedBuffer.length; offset += RSA_BLOCK_SIZE) {
    const block = encryptedBuffer.subarray(offset, offset + RSA_BLOCK_SIZE);
    decryptedBlocks.push(decryptBlock(block, privateKey));
  }

  return Buffer.concat(decryptedBlocks);
}

module.exports = {
  RSA_BLOCK_SIZE,
  decryptBlock,
  decryptBuffer,
};
