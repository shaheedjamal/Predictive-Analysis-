import { Router } from 'express';
import { getDb } from '../db.ts';
import {
  createSession,
  deleteSession,
  hashPassword,
  logAudit,
  requireAuth,
  verifyPassword,
} from '../services/security.ts';

const router = Router();

function setSessionCookie(res: import('express').Response, sessionId: string) {
  res.cookie('dei_session', sessionId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

router.get('/me', (req, res) => {
  const db = getDb();
  const adminRow = db
    .prepare("SELECT COUNT(*) as cnt FROM users WHERE role = 'Administrator' AND is_active = 1")
    .get() as { cnt: number };

  if (!req.user) {
    res.json({
      authenticated: false,
      user: null,
      needs_admin_setup: adminRow.cnt === 0,
    });
    return;
  }

  res.json({
    authenticated: true,
    user: req.user,
    needs_admin_setup: adminRow.cnt === 0,
  });
});

router.post('/register', (req, res) => {
  const { username, email, password, full_name, institution, setup_as_admin } = req.body ?? {};

  if (!username || !email || !password || !full_name) {
    res.status(400).json({
      error: 'username, email, password, and full_name are all required.',
    });
    return;
  }

  const cleanUsername = String(username).trim();
  const cleanEmail = String(email).trim().toLowerCase();
  const cleanFullName = String(full_name).trim();
  const cleanInstitution = String(institution || 'Independent Research Lab').trim();

  if (cleanUsername.length < 3 || !/^[a-zA-Z0-9_.-]+$/.test(cleanUsername)) {
    res.status(400).json({
      error: 'Username must be at least 3 characters (letters, numbers, _, ., - only).',
    });
    return;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    res.status(400).json({ error: 'Please provide a valid email address.' });
    return;
  }

  if (String(password).length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters long.' });
    return;
  }

  const db = getDb();
  const existing = db
    .prepare('SELECT id FROM users WHERE email = ? OR username = ?')
    .get(cleanEmail, cleanUsername);

  if (existing) {
    res.status(409).json({ error: 'An account with this email or username already exists.' });
    return;
  }

  // Only allow Administrator creation during initial bootstrap when zero active Administrators exist
  const adminCountRow = db
    .prepare("SELECT COUNT(*) as cnt FROM users WHERE role = 'Administrator'")
    .get() as { cnt: number };

  const assignedRole: 'Administrator' | 'Researcher' =
    setup_as_admin === true && adminCountRow.cnt === 0 ? 'Administrator' : 'Researcher';

  const pwHash = hashPassword(String(password));
  const result = db
    .prepare(
      `INSERT INTO users (username, email, password_hash, full_name, institution, role, is_active, is_demo, last_login)
       VALUES (?, ?, ?, ?, ?, ?, 1, 0, datetime('now'))`
    )
    .run(cleanUsername, cleanEmail, pwHash, cleanFullName, cleanInstitution, assignedRole);

  const userId = Number(result.lastInsertRowid);
  const session = createSession(userId);
  setSessionCookie(res, session.id);

  logAudit({
    userId,
    username: cleanUsername,
    action: 'USER_REGISTER',
    resourceType: 'user',
    resourceId: userId,
    details: `Registered with role ${assignedRole}`,
    ipAddress: req.ip,
  });

  res.status(201).json({
    user: {
      id: userId,
      username: cleanUsername,
      email: cleanEmail,
      full_name: cleanFullName,
      institution: cleanInstitution,
      role: assignedRole,
      is_active: 1,
      is_demo: 0,
    },
  });
});

router.post('/login', (req, res) => {
  const { identifier, email, password } = req.body ?? {};
  const loginId = String(identifier || email || '').trim();

  if (!loginId || !password) {
    res.status(400).json({ error: 'Email/username and password are required.' });
    return;
  }

  const db = getDb();
  const user = db
    .prepare(
      `SELECT id, username, email, password_hash, full_name, institution, role, is_active, is_demo
       FROM users
       WHERE LOWER(email) = LOWER(?) OR username = ?`
    )
    .get(loginId, loginId) as
    | {
        id: number;
        username: string;
        email: string;
        password_hash: string;
        full_name: string;
        institution: string;
        role: 'Administrator' | 'Researcher';
        is_active: number;
        is_demo: number;
      }
    | undefined;

  if (!user || !verifyPassword(String(password), user.password_hash)) {
    logAudit({
      username: loginId,
      action: 'LOGIN_FAILED',
      resourceType: 'auth',
      details: 'Invalid credentials submitted',
      ipAddress: req.ip,
    });
    res.status(401).json({ error: 'Invalid email/username or password.' });
    return;
  }

  if (!user.is_active) {
    res.status(403).json({ error: 'This account has been deactivated by an administrator.' });
    return;
  }

  db.prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?").run(user.id);
  const session = createSession(user.id);
  setSessionCookie(res, session.id);

  logAudit({
    userId: user.id,
    username: user.username,
    action: 'USER_LOGIN',
    resourceType: 'auth',
    resourceId: user.id,
    ipAddress: req.ip,
  });

  res.json({
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      full_name: user.full_name,
      institution: user.institution,
      role: user.role,
      is_active: user.is_active,
      is_demo: user.is_demo,
    },
  });
});

router.post('/demo-login', (req, res) => {
  const db = getDb();
  const demoUser = db
    .prepare(
      `SELECT id, username, email, full_name, institution, role, is_active, is_demo
       FROM users WHERE is_demo = 1 AND is_active = 1 LIMIT 1`
    )
    .get() as
    | {
        id: number;
        username: string;
        email: string;
        full_name: string;
        institution: string;
        role: 'Administrator' | 'Researcher';
        is_active: number;
        is_demo: number;
      }
    | undefined;

  if (!demoUser) {
    res.status(404).json({ error: 'Demo researcher account is not available.' });
    return;
  }

  db.prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?").run(demoUser.id);
  const session = createSession(demoUser.id);
  setSessionCookie(res, session.id);

  logAudit({
    userId: demoUser.id,
    username: demoUser.username,
    action: 'DEMO_LOGIN',
    resourceType: 'auth',
    resourceId: demoUser.id,
    ipAddress: req.ip,
  });

  res.json({ user: demoUser });
});

router.post('/logout', (req, res) => {
  if (req.sessionId) {
    deleteSession(req.sessionId);
  }
  if (req.user) {
    logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: 'USER_LOGOUT',
      resourceType: 'auth',
      ipAddress: req.ip,
    });
  }
  res.clearCookie('dei_session', { path: '/' });
  res.json({ ok: true });
});

router.put('/profile', requireAuth, (req, res) => {
  const { full_name, institution, current_password, new_password } = req.body ?? {};
  const db = getDb();
  const userId = req.user!.id;

  const updates: string[] = [];
  const values: (string | number)[] = [];

  if (full_name && String(full_name).trim().length >= 2) {
    updates.push('full_name = ?');
    values.push(String(full_name).trim());
  }
  if (institution !== undefined) {
    updates.push('institution = ?');
    values.push(String(institution).trim());
  }

  if (new_password) {
    if (String(new_password).length < 8) {
      res.status(400).json({ error: 'New password must be at least 8 characters.' });
      return;
    }
    const row = db
      .prepare('SELECT password_hash, is_demo FROM users WHERE id = ?')
      .get(userId) as { password_hash: string; is_demo: number };
    if (row.is_demo) {
      res.status(403).json({ error: 'Demo account password cannot be modified.' });
      return;
    }
    if (!current_password || !verifyPassword(String(current_password), row.password_hash)) {
      res.status(400).json({ error: 'Current password is incorrect.' });
      return;
    }
    updates.push('password_hash = ?');
    values.push(hashPassword(String(new_password)));
  }

  if (updates.length > 0) {
    values.push(userId);
    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    logAudit({
      userId,
      username: req.user!.username,
      action: 'PROFILE_UPDATE',
      resourceType: 'user',
      resourceId: userId,
    });
  }

  const updated = db
    .prepare(
      'SELECT id, username, email, full_name, institution, role, is_active, is_demo FROM users WHERE id = ?'
    )
    .get(userId);
  res.json({ user: updated });
});

export default router;
