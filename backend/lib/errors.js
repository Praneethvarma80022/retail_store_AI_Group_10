function createHttpError(status, message, details) {
  const error = new Error(message);
  error.status = status;
  error.details = details || null;
  return error;
}

module.exports = {
  createHttpError
};
