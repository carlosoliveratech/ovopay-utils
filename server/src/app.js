const express = require('express');
const { getConfig } = require('./config');
const rateLimiter = require('./middleware/rateLimiter');
const decryptRouter = require('./routes/decrypt');
const healthRouter = require('./routes/health');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

function createApp() {
  const app = express();
  const config = getConfig();

  app.disable('x-powered-by');
  app.use(
    express.json({
      limit: '1mb',
    })
  );

  app.use(
    rateLimiter({
      limit: config.apiRateLimit,
      windowMs: config.apiRateWindowMs,
    })
  );

  app.use('/healthz', healthRouter);
  app.use('/api/decrypt-image', decryptRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
