import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { UserRole } from './types.js';

const DEFAULT_SECRET = 'muqabla_dev_secret_key_change_in_production_2026';
const JWT_SECRET = process.env.JWT_SECRET || DEFAULT_SECRET;

if (process.env.NODE_ENV === 'production' && JWT_SECRET === DEFAULT_SECRET) {
  console.warn('⚠️  WARNING: Running in production with default JWT_SECRET! Please set JWT_SECRET in your .env file immediately.');
}

export interface JwtPayload {
  userId: string;
  username: string;
  role: UserRole;
  teamId?: string | null;
}

export function generateToken(payload: JwtPayload): string {
  const expiresIn = (process.env.JWT_EXPIRES_IN || '24h') as any;
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
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
