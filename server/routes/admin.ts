import { Router } from 'express';
import { getDb } from '../db.ts';
import { logAudit, requireAdmin } from '../services/security.ts';

const router = Router();

router.get('/users', requireAdmin, (_req, res) => {
  const db = getDb();
  const users = db
    .prepare(
      `SELECT id, username, email, full_name, institution, role, is_active, is_demo, created_at, last_login
       FROM users ORDER BY id ASC`
    )
    .all();
  res.json({ users });
});

router.patch('/users/:id', requireAdmin, (req, res) => {
  const targetId = Number(req.params.id);
  const { role, is_active } = req.body ?? {};
  const db = getDb();

  const existing = db
    .prepare('SELECT id, username, role, is_active FROM users WHERE id = ?')
    .get(targetId) as
    | { id: number; username: string; role: string; is_active: number }
    | undefined;

  if (!existing) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }

  if (targetId === req.user!.id && is_active === 0) {
    res.status(400).json({ error: 'You cannot deactivate your own active administrator account.' });
    return;
  }

  if (role && ['Administrator', 'Researcher'].includes(role)) {
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, targetId);
  }
  if (typeof is_active === 'boolean' || is_active === 0 || is_active === 1) {
    db.prepare('UPDATE users SET is_active = ? WHERE id = ?').run(is_active ? 1 : 0, targetId);
  }

  logAudit({
    userId: req.user!.id,
    username: req.user!.username,
    action: 'ADMIN_USER_UPDATED',
    resourceType: 'user',
    resourceId: targetId,
    details: `Updated user ${existing.username}: role=${role ?? existing.role}, is_active=${is_active ?? existing.is_active}`,
  });

  const updated = db
    .prepare(
      'SELECT id, username, email, full_name, institution, role, is_active, is_demo, created_at, last_login FROM users WHERE id = ?'
    )
    .get(targetId);

  res.json({ user: updated });
});

router.get('/audit-logs', requireAdmin, (_req, res) => {
  const db = getDb();
  const logs = db
    .prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 100')
    .all();
  res.json({ logs });
});

export default router;
