import { Router } from 'express';
import { randomUUID } from 'crypto';
import db, { DEFAULT_CLIENT_ID, normalizeClientId, provisionClientDefaults } from '../db.js';
import { adminRequired, authRequired } from '../auth.js';
import { hashPassword } from '../password.js';
import {
  fetchDashboardVersionRow,
  listDashboardVersions,
  saveDashboardVersionSnapshot,
  toDashboardVersionMeta,
} from '../dashboardVersions.js';

const router = Router();

const PLATFORM_ADMIN_CLIENT_ID = normalizeClientId(process.env.PLATFORM_ADMIN_CLIENT_ID || DEFAULT_CLIENT_ID) || DEFAULT_CLIENT_ID;
const normalizeDashboardId = (value) => String(value || 'default').trim().replace(/\s+/g, '_').toLowerCase();
const parseLimit = (value, fallback = 30) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(200, parsed));
};
const toDashboardMeta = (row) => ({
  id: row.id,
  clientId: row.client_id,
  name: row.name,
  updatedAt: row.updated_at,
  createdAt: row.created_at,
});

const platformAdminRequired = (req, res, next) => {
  if (!req.auth?.user || req.auth.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin only' });
  }
  if (!req.auth.user.isPlatformAdmin) {
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

router.get('/:clientId/ha-config', (req, res) => {
  const clientId = normalizeClientId(req.params.clientId);
  if (!clientId) return res.status(400).json({ error: 'Valid clientId is required' });

  const client = db.prepare('SELECT id FROM clients WHERE id = ?').get(clientId);
  if (!client) return res.status(404).json({ error: 'Client not found' });

  const row = db.prepare('SELECT * FROM ha_config WHERE client_id = ?').get(clientId);
  const oauthTokens = row?.oauth_tokens
    ? (() => {
      try { return JSON.parse(row.oauth_tokens); } catch { return null; }
    })()
    : null;

  return res.json({
    config: {
      url: row?.url || '',
      fallbackUrl: row?.fallback_url || '',
      authMethod: row?.auth_method || 'oauth',
      token: row?.token || '',
      oauthTokens,
      updatedAt: row?.updated_at || null,
    },
  });
});

router.put('/:clientId/ha-config', (req, res) => {
  const clientId = normalizeClientId(req.params.clientId);
  if (!clientId) return res.status(400).json({ error: 'Valid clientId is required' });

  const client = db.prepare('SELECT id FROM clients WHERE id = ?').get(clientId);
  if (!client) return res.status(404).json({ error: 'Client not found' });

  const existing = db.prepare('SELECT * FROM ha_config WHERE client_id = ?').get(clientId);
  const currentAuthMethod = existing?.auth_method === 'token' ? 'token' : 'oauth';

  const hasUrl = Object.prototype.hasOwnProperty.call(req.body || {}, 'url');
  const hasFallbackUrl = Object.prototype.hasOwnProperty.call(req.body || {}, 'fallbackUrl');
  const hasAuthMethod = Object.prototype.hasOwnProperty.call(req.body || {}, 'authMethod');
  const hasToken = Object.prototype.hasOwnProperty.call(req.body || {}, 'token');
  const hasOauthTokens = Object.prototype.hasOwnProperty.call(req.body || {}, 'oauthTokens');

  const url = hasUrl ? String(req.body?.url || '').trim() : (existing?.url || '');
  const fallbackUrl = hasFallbackUrl ? String(req.body?.fallbackUrl || '').trim() : (existing?.fallback_url || '');
  const authMethod = hasAuthMethod
    ? (String(req.body?.authMethod || '').trim() === 'token' ? 'token' : 'oauth')
    : currentAuthMethod;
  const token = hasToken ? String(req.body?.token || '').trim() : (existing?.token || '');

  let oauthTokens;
  if (hasOauthTokens) {
    oauthTokens = req.body?.oauthTokens ?? null;
  } else {
    oauthTokens = existing?.oauth_tokens
      ? (() => {
        try { return JSON.parse(existing.oauth_tokens); } catch { return null; }
      })()
      : null;
  }

  const now = new Date().toISOString();
  const oauthTokensJson = oauthTokens ? JSON.stringify(oauthTokens) : null;

  db.prepare(`
    INSERT INTO ha_config (client_id, url, fallback_url, auth_method, token, oauth_tokens, updated_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(client_id) DO UPDATE SET
      url = excluded.url,
      fallback_url = excluded.fallback_url,
      auth_method = excluded.auth_method,
      token = excluded.token,
      oauth_tokens = excluded.oauth_tokens,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at
  `).run(clientId, url, fallbackUrl, authMethod, token, oauthTokensJson, req.auth.user.id, existing?.created_at || now, now);

  return res.json({
    config: {
      url,
      fallbackUrl,
      authMethod,
      token,
      oauthTokens,
      updatedAt: now,
    },
  });
});

router.get('/:clientId/dashboards', (req, res) => {
  const clientId = normalizeClientId(req.params.clientId);
  if (!clientId) return res.status(400).json({ error: 'Valid clientId is required' });
  const client = db.prepare('SELECT id FROM clients WHERE id = ?').get(clientId);
  if (!client) return res.status(404).json({ error: 'Client not found' });
  const rows = db.prepare('SELECT client_id, id, name, created_at, updated_at FROM dashboards WHERE client_id = ? ORDER BY updated_at DESC').all(clientId);
  return res.json({ dashboards: rows.map(toDashboardMeta) });
});

router.get('/:clientId/dashboards/:dashboardId', (req, res) => {
  const clientId = normalizeClientId(req.params.clientId);
  const dashboardId = normalizeDashboardId(req.params.dashboardId);
  if (!clientId) return res.status(400).json({ error: 'Valid clientId is required' });
  const client = db.prepare('SELECT id FROM clients WHERE id = ?').get(clientId);
  if (!client) return res.status(404).json({ error: 'Client not found' });
  const row = db.prepare('SELECT * FROM dashboards WHERE client_id = ? AND id = ?').get(clientId, dashboardId);
  if (!row) return res.status(404).json({ error: 'Dashboard not found' });
  return res.json({
    ...toDashboardMeta(row),
    data: JSON.parse(row.data),
  });
});

router.get('/:clientId/dashboards/:dashboardId/versions', (req, res) => {
  const clientId = normalizeClientId(req.params.clientId);
  const dashboardId = normalizeDashboardId(req.params.dashboardId);
  if (!clientId) return res.status(400).json({ error: 'Valid clientId is required' });
  const client = db.prepare('SELECT id FROM clients WHERE id = ?').get(clientId);
  if (!client) return res.status(404).json({ error: 'Client not found' });
  const existing = db.prepare('SELECT id FROM dashboards WHERE client_id = ? AND id = ?').get(clientId, dashboardId);
  if (!existing) return res.status(404).json({ error: 'Dashboard not found' });
  const limit = parseLimit(req.query?.limit, 30);
  return res.json({ versions: listDashboardVersions(clientId, dashboardId, limit) });
});

router.post('/:clientId/dashboards/:dashboardId/versions/:versionId/restore', (req, res) => {
  const clientId = normalizeClientId(req.params.clientId);
  const dashboardId = normalizeDashboardId(req.params.dashboardId);
  const versionId = String(req.params.versionId || '').trim();
  if (!clientId) return res.status(400).json({ error: 'Valid clientId is required' });
  if (!versionId) return res.status(400).json({ error: 'versionId is required' });

  const client = db.prepare('SELECT id FROM clients WHERE id = ?').get(clientId);
  if (!client) return res.status(404).json({ error: 'Client not found' });

  const existing = db.prepare('SELECT * FROM dashboards WHERE client_id = ? AND id = ?').get(clientId, dashboardId);
  if (!existing) return res.status(404).json({ error: 'Dashboard not found' });

  const versionRow = fetchDashboardVersionRow(clientId, dashboardId, versionId);
  if (!versionRow) return res.status(404).json({ error: 'Dashboard version not found' });

  let restoredData;
  try {
    restoredData = JSON.parse(versionRow.data);
  } catch {
    return res.status(500).json({ error: 'Stored dashboard version is invalid JSON' });
  }

  let backupVersionId = null;
  const now = new Date().toISOString();
  db.exec('BEGIN');
  try {
    backupVersionId = saveDashboardVersionSnapshot({
      clientId,
      dashboardId,
      name: existing.name,
      data: existing.data,
      createdBy: req.auth?.user?.id || null,
      sourceUpdatedAt: existing.updated_at,
    });
    db.prepare('UPDATE dashboards SET data = ?, updated_at = ? WHERE client_id = ? AND id = ?')
      .run(JSON.stringify(restoredData), now, clientId, dashboardId);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  const row = db.prepare('SELECT client_id, id, name, created_at, updated_at FROM dashboards WHERE client_id = ? AND id = ?')
    .get(clientId, dashboardId);
  return res.json({
    dashboard: toDashboardMeta(row),
    data: restoredData,
    restoredVersion: toDashboardVersionMeta(versionRow),
    backupVersionId,
  });
});

router.put('/:clientId/dashboards/:dashboardId', (req, res) => {
  const clientId = normalizeClientId(req.params.clientId);
  const dashboardId = normalizeDashboardId(req.params.dashboardId);
  const name = String(req.body?.name || dashboardId).trim() || dashboardId;
  const data = req.body?.data;
  if (!clientId) return res.status(400).json({ error: 'Valid clientId is required' });
  const client = db.prepare('SELECT id FROM clients WHERE id = ?').get(clientId);
  if (!client) return res.status(404).json({ error: 'Client not found' });
  if (!data || typeof data !== 'object') {
    return res.status(400).json({ error: 'Dashboard data is required' });
  }

  const existing = db.prepare('SELECT * FROM dashboards WHERE client_id = ? AND id = ?').get(clientId, dashboardId);
  const now = new Date().toISOString();
  if (!existing) {
    db.prepare('INSERT INTO dashboards (client_id, id, name, data, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(clientId, dashboardId, name, JSON.stringify(data), req.auth.user.id, now, now);
  } else {
    db.exec('BEGIN');
    try {
      saveDashboardVersionSnapshot({
        clientId,
        dashboardId,
        name: existing.name,
        data: existing.data,
        createdBy: req.auth.user.id,
        sourceUpdatedAt: existing.updated_at,
      });
      db.prepare('UPDATE dashboards SET name = ?, data = ?, updated_at = ? WHERE client_id = ? AND id = ?')
        .run(name, JSON.stringify(data), now, clientId, dashboardId);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  const row = db.prepare('SELECT client_id, id, name, created_at, updated_at FROM dashboards WHERE client_id = ? AND id = ?').get(clientId, dashboardId);
  return res.json({ dashboard: toDashboardMeta(row) });
});

router.put('/:clientId', (req, res) => {
  const clientId = normalizeClientId(req.params.clientId);
  const name = String(req.body?.name || '').trim();

  if (!clientId) return res.status(400).json({ error: 'Valid clientId is required' });
  if (!name) return res.status(400).json({ error: 'Client name is required' });

  const existing = db.prepare('SELECT id FROM clients WHERE id = ?').get(clientId);
  if (!existing) return res.status(404).json({ error: 'Client not found' });

  const now = new Date().toISOString();
  db.prepare('UPDATE clients SET name = ?, updated_at = ? WHERE id = ?').run(name, now, clientId);

  const updated = db.prepare('SELECT id, name, created_at, updated_at FROM clients WHERE id = ?').get(clientId);
  return res.json({
    client: {
      id: updated.id,
      name: updated.name,
      createdAt: updated.created_at,
      updatedAt: updated.updated_at,
    },
  });
});

router.delete('/:clientId', (req, res) => {
  const clientId = normalizeClientId(req.params.clientId);
  const confirmation = String(req.body?.confirmation || '').trim();

  if (!clientId) return res.status(400).json({ error: 'Valid clientId is required' });
  if (confirmation !== 'OK') {
    return res.status(400).json({ error: 'Type OK in confirmation field to delete this client' });
  }
  if (clientId === PLATFORM_ADMIN_CLIENT_ID) {
    return res.status(400).json({ error: 'Cannot delete platform admin client' });
  }
  if (req.auth?.user?.clientId === clientId) {
    return res.status(400).json({ error: 'Cannot delete the currently active client' });
  }

  const existing = db.prepare('SELECT id FROM clients WHERE id = ?').get(clientId);
  if (!existing) return res.status(404).json({ error: 'Client not found' });

  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE client_id = ?)').run(clientId);
    db.prepare('DELETE FROM users WHERE client_id = ?').run(clientId);
    db.prepare('DELETE FROM dashboard_versions WHERE client_id = ?').run(clientId);
    db.prepare('DELETE FROM dashboards WHERE client_id = ?').run(clientId);
    db.prepare('DELETE FROM ha_config WHERE client_id = ?').run(clientId);
    db.prepare('DELETE FROM clients WHERE id = ?').run(clientId);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  return res.json({ success: true });
});

export default router;
