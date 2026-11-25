// A single error type for everything the API reports to clients.
// `code` is machine-readable (the frontend switches on it); `message` is safe to show users.
export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

export const badRequest = (message, details) =>
  new AppError(400, 'INVALID_INPUT', message, details);

export const notFound = (message = 'Not found.') => new AppError(404, 'NOT_FOUND', message);
