import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { getDb } from '../db.ts';

export interface AuthUser {
  id: number;
  username: string;
  email: string;
  full_name: string;
  institution: string;
  role: 'Administrator' | 'Researcher';
  is_active: number;
  is_demo: number;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      sessionId?: string;
    }
  }
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, originalHex] = parts;
  const derived = crypto.scryptSync(password, salt, 64);
  const original = Buffer.from(originalHex, 'hex');
  if (derived.length !== original.length) return false;
  return crypto.timingSafeEqual(derived, original);
}

export function createSession(userId: number): { id: string; expiresAt: string } {
  const db = getDb();
  const id = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)').run(
    id,
    userId,
    expiresAt
  );
  return { id, expiresAt };
}

export function deleteSession(sessionId: string): void {
  const db = getDb();
  db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
}

export function getUserFromSession(sessionId: string | undefined): AuthUser | null {
  if (!sessionId) return null;
  const db = getDb();
  const row = db
    .prepare(
      `SELECT u.id, u.username, u.email, u.full_name, u.institution, u.role, u.is_active, u.is_demo, s.expires_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.id = ?`
    )
    .get(sessionId) as (AuthUser & { expires_at: string }) | undefined;

  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    deleteSession(sessionId);
    return null;
  }
  if (!row.is_active) return null;

  return {
    id: row.id,
    username: row.username,
    email: row.email,
    full_name: row.full_name,
    institution: row.institution,
    role: row.role,
    is_active: row.is_active,
    is_demo: row.is_demo,
  };
}

export function attachAuth(req: Request, _res: Response, next: NextFunction): void {
  const token =
    req.cookies?.dei_session ||
    (req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.slice(7).trim()
      : undefined);

  if (token) {
    const user = getUserFromSession(token);
    if (user) {
      req.user = user;
      req.sessionId = token;
    }
  }
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required. Please sign in.' });
    return;
  }
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }
  if (req.user.role !== 'Administrator') {
    res.status(403).json({ error: 'Administrator privileges required for this action.' });
    return;
  }
  next();
}

export function logAudit(params: {
  userId?: number | null;
  username?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | number | null;
  details?: string;
  ipAddress?: string;
}): void {
  try {
    const db = getDb();
    db.prepare(
      `INSERT INTO audit_logs (user_id, username, action, resource_type, resource_id, details, ip_address)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      params.userId ?? null,
      params.username ?? 'system',
      params.action,
      params.resourceType,
      params.resourceId != null ? String(params.resourceId) : null,
      params.details ?? null,
      params.ipAddress ?? null
    );
  } catch {
    // Do not crash request flow on audit failure
  }
}

export function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
}
