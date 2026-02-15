import type { ErrorRequestHandler } from "express";

export class HttpError extends Error {
  statusCode: number;
  details?: unknown;

  constructor(statusCode: number, message: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

export function badRequest(message: string, details?: unknown): HttpError {
  return new HttpError(400, message, details);
}

export function notFound(message: string): HttpError {
  return new HttpError(404, message);
}

export function conflict(message: string, details?: unknown): HttpError {
  return new HttpError(409, message, details);
}

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  const statusCode = error instanceof HttpError ? error.statusCode : 500;
  const payload: Record<string, unknown> = {
    error: {
      message:
        error instanceof Error && statusCode !== 500
          ? error.message
          : "Internal server error"
    }
  };

  if (error instanceof HttpError && error.details !== undefined) {
    payload.error = {
      ...(payload.error as Record<string, unknown>),
      details: error.details
    };
  }

  if (statusCode === 500) {
    console.error(error);
  }

  res.status(statusCode).json(payload);
};
