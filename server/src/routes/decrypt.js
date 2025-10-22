const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { decryptImage } = require('../controllers/decryptController');

const router = express.Router();

router.post('/', asyncHandler(decryptImage));

module.exports = router;
