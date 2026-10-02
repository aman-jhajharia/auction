import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { UserRole } from './types.js';

const isProduction = process.env.NODE_ENV === 'production';
const JWT_SECRET = process.env.JWT_SECRET;
const DEV_SECRET = 'muqabla_dev_secret_key_change_in_production_2026';

// Strict security enforcement in production: refuse to boot with missing or insecure secret
if (isProduction && (!JWT_SECRET || JWT_SECRET === DEV_SECRET || JWT_SECRET.trim().length < 16)) {
  throw new Error('FATAL: A secure, high-entropy JWT_SECRET (minimum 16 characters) must be configured in environment variables for production.');
}

const EFFECTIVE_JWT_SECRET = JWT_SECRET || DEV_SECRET;

export interface JwtPayload {
  userId: string;
  username: string;
  role: UserRole;
  teamId?: string | null;
}

export function generateToken(payload: JwtPayload): string {
  const expiresIn = (process.env.JWT_EXPIRES_IN || '24h') as any;
  return jwt.sign(payload, EFFECTIVE_JWT_SECRET, { expiresIn });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, EFFECTIVE_JWT_SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid authorization header.' });
    return;
  }

  const token = authHeader.split(' ')[1];
  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: 'Invalid or expired token.' });
    return;
  }

  (req as any).user = payload;
  next();
}

export function requireRole(allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as any).user as JwtPayload | undefined;
    if (!user || !allowedRoles.includes(user.role)) {
      res.status(403).json({ error: 'Access forbidden: Insufficient permissions.' });
      return;
    }
    next();
  };
}
