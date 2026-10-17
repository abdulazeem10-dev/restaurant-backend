function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  const status = Number.isInteger(err.status) ? err.status : 500;
  if (status >= 500) console.error(err);
  return res.status(status).json({
    error: status >= 500 ? "Internal server error" : err.message
  });
}

module.exports = errorHandler;
