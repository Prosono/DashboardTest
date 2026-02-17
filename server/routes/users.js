import { Router } from 'express';
import { randomUUID } from 'crypto';
import db from '../db.js';
import { adminRequired, authRequired, safeUser } from '../auth.js';
import { hashPassword } from '../password.js';

const router = Router();

router.use(authRequired, adminRequired);

const parseRole = (value, fallback = 'user') => {
  if (value === undefined || value === null) return fallback;
  const next = String(value).trim();
  if (next === 'admin' || next === 'inspector') return next;
  return 'user';
};

const parseHaFields = (body = {}, fallback = {}) => {
  const haUrl = body?.haUrl !== undefined ? String(body.haUrl || '').trim() : String(fallback.ha_url || '');
  const haToken = body?.haToken !== undefined ? String(body.haToken || '').trim() : String(fallback.ha_token || '');
  const hasOnlyOne = (haUrl && !haToken) || (!haUrl && haToken);
  if (hasOnlyOne) return { error: 'HA URL and HA token must both be set or both be empty' };
  return { haUrl, haToken };
};

router.get('/', (_req, res) => {
  const users = db.prepare('SELECT * FROM users ORDER BY username ASC').all();
  res.json({ users: users.map(safeUser) });
});

router.post('/', (req, res) => {
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '').trim();
  const role = parseRole(req.body?.role, 'user');
  const assignedDashboardId = String(req.body?.assignedDashboardId || 'default').trim() || 'default';
  const parsedHa = parseHaFields(req.body);

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  if (parsedHa.error) return res.status(400).json({ error: parsedHa.error });

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) return res.status(409).json({ error: 'Username already exists' });

  const dash = db.prepare('SELECT id FROM dashboards WHERE id = ?').get(assignedDashboardId);
  if (!dash) return res.status(400).json({ error: 'Assigned dashboard does not exist' });

  const now = new Date().toISOString();
  const id = randomUUID();

  db.prepare(`
    INSERT INTO users (id, username, password_hash, role, assigned_dashboard_id, ha_url, ha_token, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, username, hashPassword(password), role, assignedDashboardId, parsedHa.haUrl, parsedHa.haToken, now, now);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  res.status(201).json({ user: safeUser(user) });
});

router.put('/:id', (req, res) => {
  const id = String(req.params.id || '').trim();
  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'User not found' });

  const username = req.body?.username !== undefined ? String(req.body.username).trim() : existing.username;
  const role = parseRole(req.body?.role, existing.role);
  const assignedDashboardId = req.body?.assignedDashboardId !== undefined ? String(req.body.assignedDashboardId || '').trim() : existing.assigned_dashboard_id;
  const password = req.body?.password !== undefined ? String(req.body.password) : '';
  const parsedHa = parseHaFields(req.body, existing);
  const fullName = req.body?.fullName !== undefined ? String(req.body.fullName || '').trim() : (existing.full_name || '');
  const email = req.body?.email !== undefined ? String(req.body.email || '').trim() : (existing.email || '');
  const phone = req.body?.phone !== undefined ? String(req.body.phone || '').trim() : (existing.phone || '');
  const avatarUrl = req.body?.avatarUrl !== undefined ? String(req.body.avatarUrl || '').trim() : (existing.avatar_url || '');

  if (!username) return res.status(400).json({ error: 'Username cannot be empty' });
  if (parsedHa.error) return res.status(400).json({ error: parsedHa.error });
  const duplicate = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(username, id);
  if (duplicate) return res.status(409).json({ error: 'Username already exists' });

  const dash = db.prepare('SELECT id FROM dashboards WHERE id = ?').get(assignedDashboardId);
  if (!dash) return res.status(400).json({ error: 'Assigned dashboard does not exist' });

  if (existing.role === 'admin' && role !== 'admin') {
    const adminCount = db.prepare("SELECT COUNT(*) AS total FROM users WHERE role = 'admin'").get()?.total || 0;
    if (adminCount <= 1) return res.status(400).json({ error: 'Cannot demote the last admin user' });
  }

  const now = new Date().toISOString();

  db.prepare(`
    UPDATE users
    SET username = ?, role = ?, assigned_dashboard_id = ?, ha_url = ?, ha_token = ?, full_name = ?, email = ?, phone = ?, avatar_url = ?, updated_at = ?
    WHERE id = ?
  `).run(username, role, assignedDashboardId, parsedHa.haUrl, parsedHa.haToken, fullName, email, phone, avatarUrl, now, id);

  if (password) {
    db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
      .run(hashPassword(password), now, id);
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  res.json({ user: safeUser(user) });
});

router.delete('/:id', (req, res) => {
  const id = String(req.params.id || '').trim();
  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'User not found' });
  if (id === req.auth.user.id) return res.status(400).json({ error: 'Cannot delete your own user' });

  if (existing.role === 'admin') {
    const adminCount = db.prepare("SELECT COUNT(*) AS total FROM users WHERE role = 'admin'").get()?.total || 0;
    if (adminCount <= 1) return res.status(400).json({ error: 'Cannot delete the last admin user' });
  }

  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  return res.json({ success: true });
});

export default router;
