const express = require('express');
const { getConfig } = require('./config');
const rateLimiter = require('./middleware/rateLimiter');
const decryptImageRouter = require('./routes/decryptImage');
const decryptDataRouter = require('./routes/decryptData');
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

  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const ms = Date.now() - start;
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${ms}ms)`);
    });
    next();
  });

  app.use('/healthz', healthRouter);
  app.use('/api/decrypt-image', decryptImageRouter);
  app.use('/api/decrypt-data', decryptDataRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
