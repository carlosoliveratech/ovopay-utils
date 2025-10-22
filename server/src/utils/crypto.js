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

module.exports = {
  RSA_BLOCK_SIZE,
  decryptBlock,
};
