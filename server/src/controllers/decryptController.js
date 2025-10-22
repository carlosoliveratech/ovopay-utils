const { getConfig } = require('../config');
const { createError } = require('../errors');
const { handleDecryptImage } = require('../services/decryptService');

async function decryptImage(req, res) {
  const { imageURL } = req.body || {};

  if (typeof imageURL !== 'string' || imageURL.trim().length === 0) {
    throw createError('INVALID_PAYLOAD', 'imageURL is required and must be a non-empty string.', 400);
  }

  const config = getConfig();

  await handleDecryptImage({
    imageUrl: imageURL.trim(),
    res,
    privateKey: config.privateKey,
  });
}

module.exports = {
  decryptImage,
};
