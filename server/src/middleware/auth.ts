import { Request, Response, NextFunction } from 'express';
import { verifyToken, JwtPayload } from '../lib/jwt';

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

/**
 * JWT authentication middleware.
 * Verifies the Bearer token and attaches user info to req.user.
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Missing or invalid authorization header' },
    });
    return;
  }

  const token = authHeader.substring(7);
  try {
    req.user = verifyToken(token);
    next();
  } catch {
    res.status(401).json({
      success: false,
      error: { code: 'TOKEN_EXPIRED', message: 'Token expired or invalid' },
    });
  }
}

/**
 * Role-based access control middleware.
 * Requires authMiddleware to run first.
 */
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Insufficient permissions' },
      });
      return;
    }

    next();
  };
}

/**
 * Require ownership or boss role for sales-owned resources.
 * Assumes resource has been loaded on req (e.g., req.customer, req.order).
 * Looks for owner_id on attached resource or resourceId.
 */
export function requireOwnershipOrRole(role: string = 'boss') {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      });
      return;
    }

    if (req.user.role === role) {
      return next();
    }

    // Check ownership: attached resource must have owner_id matching user
    const resource = (req as any).resource;
    if (resource && resource.owner_id === req.user.userId) {
      return next();
    }

    res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Access denied' },
    });
  };
}
