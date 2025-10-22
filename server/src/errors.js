class AppError extends Error {
  constructor(code, message, statusCode = 500, options = {}) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = options.details;

    if (options.cause) {
      this.cause = options.cause;
    }
    Error.captureStackTrace(this, AppError);
  }
}

function createError(code, message, statusCode, options) {
  return new AppError(code, message, statusCode, options);
}

module.exports = {
  AppError,
  createError,
};
