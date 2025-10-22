const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { decryptData } = require('../controllers/decryptController');

const router = express.Router();

router.post('/', asyncHandler(decryptData));

module.exports = router;
