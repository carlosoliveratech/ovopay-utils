const { getConfig } = require('../config');
const { createError } = require('../errors');
const { handleDecryptImage, handleDecryptData } = require('../services/decryptService');

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

async function decryptData(req, res) {
  const { data } = req.body || {};

  if (typeof data !== 'string' || data.trim().length === 0) {
    throw createError('INVALID_PAYLOAD', 'data is required and must be a non-empty string.', 400);
  }

  const config = getConfig();
  const decryptedBuffer = await handleDecryptData({
    encryptedData: data,
    privateKey: config.privateKey,
  });

  const decryptedText = decryptedBuffer.toString('utf8');

  res.json({
    data: decryptedText,
  });
}

module.exports = {
  decryptImage,
  decryptData,
};
