import { Router } from 'express';
import { randomUUID } from 'crypto';
import db, { DEFAULT_CLIENT_ID, normalizeClientId, provisionClientDefaults } from '../db.js';
import { adminRequired, authRequired } from '../auth.js';
import { hashPassword } from '../password.js';

const router = Router();

const PLATFORM_ADMIN_CLIENT_ID = normalizeClientId(process.env.PLATFORM_ADMIN_CLIENT_ID || DEFAULT_CLIENT_ID) || DEFAULT_CLIENT_ID;

const platformAdminRequired = (req, res, next) => {
  if (!req.auth?.user || req.auth.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin only' });
  }
  if (req.auth.user.clientId !== PLATFORM_ADMIN_CLIENT_ID) {
    return res.status(403).json({ error: 'Platform admin only' });
  }
  return next();
};

router.use(authRequired, adminRequired, platformAdminRequired);

router.get('/', (_req, res) => {
  const clients = db.prepare(`
    SELECT
      c.id,
      c.name,
      c.created_at,
      c.updated_at,
      (SELECT COUNT(*) FROM users u WHERE u.client_id = c.id) AS user_count,
      (SELECT COUNT(*) FROM users u WHERE u.client_id = c.id AND u.role = 'admin') AS admin_count
    FROM clients c
    ORDER BY c.id ASC
  `).all();

  return res.json({
    clients: clients.map((c) => ({
      id: c.id,
      name: c.name,
      userCount: Number(c.user_count || 0),
      adminCount: Number(c.admin_count || 0),
      createdAt: c.created_at,
      updatedAt: c.updated_at,
    })),
  });
});

router.post('/', (req, res) => {
  const rawClientId = String(req.body?.clientId || '').trim();
  const clientId = normalizeClientId(rawClientId);
  const name = String(req.body?.name || '').trim();

  if (!clientId) return res.status(400).json({ error: 'Valid clientId is required' });

  const existing = db.prepare('SELECT id, name, created_at, updated_at FROM clients WHERE id = ?').get(clientId);
  if (existing) {
    return res.json({
      client: {
        id: existing.id,
        name: existing.name,
        createdAt: existing.created_at,
        updatedAt: existing.updated_at,
      },
      created: false,
    });
  }

  provisionClientDefaults(clientId, name || rawClientId || clientId);
  const created = db.prepare('SELECT id, name, created_at, updated_at FROM clients WHERE id = ?').get(clientId);
  return res.status(201).json({
    client: {
      id: created.id,
      name: created.name,
      createdAt: created.created_at,
      updatedAt: created.updated_at,
    },
    created: true,
  });
});

router.post('/:clientId/admin', (req, res) => {
  const clientId = normalizeClientId(req.params.clientId);
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');

  if (!clientId) return res.status(400).json({ error: 'Valid clientId is required' });
  if (!username || !password) return res.status(400).json({ error: 'Username and password are required' });

  const client = db.prepare('SELECT id FROM clients WHERE id = ?').get(clientId);
  if (!client) {
    return res.status(404).json({ error: 'Client not found' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE client_id = ? AND username = ?').get(clientId, username);
  if (existing) {
    return res.status(409).json({ error: 'Username already exists for this client' });
  }

  const now = new Date().toISOString();
  const id = randomUUID();
  db.prepare(`
    INSERT INTO users (
      id, client_id, username, password_hash, role, assigned_dashboard_id,
      ha_url, ha_token, full_name, email, phone, avatar_url,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'admin', 'default', '', '', '', '', '', '', ?, ?)
  `).run(id, clientId, username, hashPassword(password), now, now);

  return res.status(201).json({
    user: {
      id,
      clientId,
      username,
      role: 'admin',
      assignedDashboardId: 'default',
      createdAt: now,
      updatedAt: now,
    },
  });
});

export default router;
