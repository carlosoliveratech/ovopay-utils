const { AppError, createError } = require('../errors');

function notFoundHandler(req, res) {
  res.status(404).json({
    code: 'NOT_FOUND',
    message: 'Resource not found.',
  });
}

function errorHandler(err, req, res, next) {
  const appError =
    err instanceof AppError
      ? err
      : createError('INTERNAL_ERROR', 'An unexpected error occurred.', 500, { cause: err });

  if (appError.statusCode >= 500) {
    // eslint-disable-next-line no-console
    console.error(appError);
  }

  res.status(appError.statusCode).json({
    code: appError.code,
    message: appError.message,
  });
}

module.exports = {
  notFoundHandler,
  errorHandler,
};
