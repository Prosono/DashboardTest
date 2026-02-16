import { Router } from 'express';
import { randomUUID } from 'crypto';
import db from '../db.js';
import { adminRequired, authRequired, safeUser } from '../auth.js';
import { hashPassword } from '../password.js';

const router = Router();

router.use(authRequired, adminRequired);

router.get('/', (_req, res) => {
  const users = db.prepare('SELECT * FROM users ORDER BY username ASC').all();
  res.json({ users: users.map(safeUser) });
});

router.post('/', (req, res) => {
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '').trim();
  const role = String(req.body?.role || 'user').trim() === 'admin' ? 'admin' : 'user';
  const assignedDashboardId = String(req.body?.assignedDashboardId || 'default').trim() || 'default';

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) return res.status(409).json({ error: 'Username already exists' });

  const dash = db.prepare('SELECT id FROM dashboards WHERE id = ?').get(assignedDashboardId);
  if (!dash) return res.status(400).json({ error: 'Assigned dashboard does not exist' });

  const now = new Date().toISOString();
  const id = randomUUID();

  db.prepare('INSERT INTO users (id, username, password_hash, role, assigned_dashboard_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, username, hashPassword(password), role, assignedDashboardId, now, now);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  res.status(201).json({ user: safeUser(user) });
});

router.put('/:id', (req, res) => {
  const id = String(req.params.id || '').trim();
  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'User not found' });

  const username = req.body?.username !== undefined ? String(req.body.username).trim() : existing.username;
  const role = req.body?.role !== undefined ? (String(req.body.role) === 'admin' ? 'admin' : 'user') : existing.role;
  const assignedDashboardId = req.body?.assignedDashboardId !== undefined ? String(req.body.assignedDashboardId || '').trim() : existing.assigned_dashboard_id;
  const password = req.body?.password !== undefined ? String(req.body.password) : '';

  if (!username) return res.status(400).json({ error: 'Username cannot be empty' });
  const duplicate = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(username, id);
  if (duplicate) return res.status(409).json({ error: 'Username already exists' });

  const dash = db.prepare('SELECT id FROM dashboards WHERE id = ?').get(assignedDashboardId);
  if (!dash) return res.status(400).json({ error: 'Assigned dashboard does not exist' });

  const now = new Date().toISOString();

  db.prepare('UPDATE users SET username = ?, role = ?, assigned_dashboard_id = ?, updated_at = ? WHERE id = ?')
    .run(username, role, assignedDashboardId, now, id);

  if (password) {
    db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
      .run(hashPassword(password), now, id);
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  res.json({ user: safeUser(user) });
});

export default router;
