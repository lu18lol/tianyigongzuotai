import { Request, Response, NextFunction } from 'express';
import logger from '../lib/logger';

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
}

export function errorHandler(err: AppError, _req: Request, res: Response, _next: NextFunction): void {
  const statusCode = err.statusCode || 500;
  const code = err.code || 'INTERNAL_ERROR';

  logger.error({ err, statusCode, code }, 'Request error');

  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message: statusCode === 500 ? 'Internal server error' : err.message,
    },
  });
}

export function createError(statusCode: number, message: string, code?: string): AppError {
  const err = new Error(message) as AppError;
  err.statusCode = statusCode;
  err.code = code || 'ERROR';
  return err;
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: 'Route not found' },
  });
}
