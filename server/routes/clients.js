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
import { mergeHaConfigPayload, parseHaConfigRow, serializeHaConnections } from '../haConfig.js';

const router = Router();

const PLATFORM_ADMIN_CLIENT_ID = normalizeClientId(process.env.PLATFORM_ADMIN_CLIENT_ID || DEFAULT_CLIENT_ID) || DEFAULT_CLIENT_ID;
const normalizeDashboardId = (value) => String(value || 'default').trim().replace(/\s+/g, '_').toLowerCase();
const parseLimit = (value, fallback = 30) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(200, parsed));
};
const parseUrlHost = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    return parsed.host || parsed.hostname || '';
  } catch {
    return raw.replace(/^https?:\/\//i, '').split('/')[0] || raw;
  }
};
const getConnectionConfigStatus = (connection) => {
  const authMethod = String(connection?.authMethod || 'oauth').trim() === 'token' ? 'token' : 'oauth';
  const url = String(connection?.url || '').trim();
  const token = String(connection?.token || '').trim();
  const oauthTokens = connection?.oauthTokens && typeof connection.oauthTokens === 'object' ? connection.oauthTokens : null;
  const hasOAuthAccessToken = Boolean(
    String(oauthTokens?.access_token || oauthTokens?.accessToken || '').trim(),
  );
  const hasCredentials = authMethod === 'token' ? Boolean(token) : hasOAuthAccessToken;

  if (!url) {
    return { status: 'missing_url', ready: false, authMethod };
  }
  if (!hasCredentials) {
    return {
      status: authMethod === 'token' ? 'missing_token' : 'missing_oauth',
      ready: false,
      authMethod,
    };
  }
  return { status: 'ready', ready: true, authMethod };
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

router.get('/overview', (req, res) => {
  const logLimit = parseLimit(req.query?.logLimit, 50);
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

  const dashboardCountRows = db.prepare(`
    SELECT client_id, COUNT(*) AS total
    FROM dashboards
    GROUP BY client_id
  `).all();
  const dashboardCounts = new Map(
    dashboardCountRows.map((row) => [row.client_id, Number(row.total || 0)]),
  );

  const sessionCountRows = db.prepare(`
    SELECT
      COALESCE(NULLIF(s.scope_client_id, ''), u.client_id) AS client_id,
      COUNT(*) AS total
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE datetime(s.expires_at) > datetime('now')
    GROUP BY COALESCE(NULLIF(s.scope_client_id, ''), u.client_id)
  `).all();
  const sessionCounts = new Map(
    sessionCountRows.map((row) => [row.client_id, Number(row.total || 0)]),
  );

  const haConfigRows = db.prepare('SELECT * FROM ha_config').all();
  const haConfigByClient = new Map(haConfigRows.map((row) => [row.client_id, row]));

  const recentVersionRows = db.prepare(`
    SELECT
      dv.version_id,
      dv.client_id,
      dv.dashboard_id,
      dv.created_by,
      dv.created_at,
      dv.source_updated_at,
      COALESCE(u.username, '') AS created_by_username
    FROM dashboard_versions dv
    LEFT JOIN users u ON u.id = dv.created_by
    ORDER BY dv.created_at DESC
    LIMIT ?
  `).all(logLimit);

  const clientOverview = clients.map((client) => {
    const parsedConfig = parseHaConfigRow(haConfigByClient.get(client.id));
    const primaryConnectionId = String(
      parsedConfig?.primaryConnectionId
      || parsedConfig?.connections?.[0]?.id
      || 'primary',
    ).trim() || 'primary';
    const connections = Array.isArray(parsedConfig?.connections) ? parsedConfig.connections : [];
    const connectionOverview = connections.map((connection) => {
      const connectionId = String(connection?.id || 'primary').trim() || 'primary';
      const statusMeta = getConnectionConfigStatus(connection);
      return {
        id: connectionId,
        name: String(connection?.name || connectionId || 'Connection').trim() || connectionId,
        isPrimary: connectionId === primaryConnectionId,
        authMethod: statusMeta.authMethod,
        status: statusMeta.status,
        ready: statusMeta.ready,
        urlHost: parseUrlHost(connection?.url),
        fallbackUrlHost: parseUrlHost(connection?.fallbackUrl),
        hasUrl: Boolean(String(connection?.url || '').trim()),
        hasFallbackUrl: Boolean(String(connection?.fallbackUrl || '').trim()),
        updatedAt: parsedConfig?.updatedAt || client.updated_at || null,
      };
    });
    const readyConnectionCount = connectionOverview.filter((connection) => connection.ready).length;
    const issueConnectionCount = Math.max(0, connectionOverview.length - readyConnectionCount);
    const dashboardCount = Number(dashboardCounts.get(client.id) || 0);
    const activeSessionCount = Number(sessionCounts.get(client.id) || 0);

    return {
      id: client.id,
      name: client.name,
      createdAt: client.created_at,
      updatedAt: client.updated_at,
      userCount: Number(client.user_count || 0),
      adminCount: Number(client.admin_count || 0),
      dashboardCount,
      activeSessionCount,
      primaryConnectionId,
      connectionCount: connectionOverview.length,
      readyConnectionCount,
      issueConnectionCount,
      connections: connectionOverview,
    };
  });

  const totals = clientOverview.reduce((acc, client) => ({
    clients: acc.clients + 1,
    users: acc.users + Number(client.userCount || 0),
    admins: acc.admins + Number(client.adminCount || 0),
    dashboards: acc.dashboards + Number(client.dashboardCount || 0),
    activeSessions: acc.activeSessions + Number(client.activeSessionCount || 0),
    connections: acc.connections + Number(client.connectionCount || 0),
    readyConnections: acc.readyConnections + Number(client.readyConnectionCount || 0),
    issueConnections: acc.issueConnections + Number(client.issueConnectionCount || 0),
  }), {
    clients: 0,
    users: 0,
    admins: 0,
    dashboards: 0,
    activeSessions: 0,
    connections: 0,
    readyConnections: 0,
    issueConnections: 0,
  });

  const recentLogs = recentVersionRows.map((row) => ({
    id: row.version_id,
    type: 'dashboard_version',
    clientId: row.client_id,
    dashboardId: row.dashboard_id,
    createdAt: row.created_at,
    sourceUpdatedAt: row.source_updated_at || null,
    createdBy: row.created_by || '',
    createdByUsername: row.created_by_username || '',
  }));

  const instances = clientOverview.flatMap((client) => (
    (Array.isArray(client.connections) ? client.connections : []).map((connection) => ({
      clientId: client.id,
      clientName: client.name,
      clientUpdatedAt: client.updatedAt,
      connectionId: connection.id,
      connectionName: connection.name,
      isPrimary: Boolean(connection.isPrimary),
      authMethod: connection.authMethod,
      status: connection.status,
      ready: Boolean(connection.ready),
      urlHost: connection.urlHost || '',
      fallbackUrlHost: connection.fallbackUrlHost || '',
      hasUrl: Boolean(connection.hasUrl),
      hasFallbackUrl: Boolean(connection.hasFallbackUrl),
      updatedAt: connection.updatedAt || client.updatedAt || null,
    }))
  ));
  const issues = instances.filter((instance) => instance.status !== 'ready');

  return res.json({
    generatedAt: new Date().toISOString(),
    totals: {
      ...totals,
      logs: recentLogs.length,
    },
    clients: clientOverview,
    instances,
    issues,
    recentLogs,
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
  const parsedConfig = parseHaConfigRow(row);

  return res.json({
    config: parsedConfig,
  });
});

router.put('/:clientId/ha-config', (req, res) => {
  const clientId = normalizeClientId(req.params.clientId);
  if (!clientId) return res.status(400).json({ error: 'Valid clientId is required' });

  const client = db.prepare('SELECT id FROM clients WHERE id = ?').get(clientId);
  if (!client) return res.status(404).json({ error: 'Client not found' });

  const existing = db.prepare('SELECT * FROM ha_config WHERE client_id = ?').get(clientId);
  const existingConfig = parseHaConfigRow(existing);
  const merged = mergeHaConfigPayload(existingConfig, req.body || {});

  const now = new Date().toISOString();
  const oauthTokensJson = merged.oauthTokens ? JSON.stringify(merged.oauthTokens) : null;
  const connectionsJson = serializeHaConnections(merged);

  db.prepare(`
    INSERT INTO ha_config (client_id, url, fallback_url, auth_method, token, oauth_tokens, connections_json, updated_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(client_id) DO UPDATE SET
      url = excluded.url,
      fallback_url = excluded.fallback_url,
      auth_method = excluded.auth_method,
      token = excluded.token,
      oauth_tokens = excluded.oauth_tokens,
      connections_json = excluded.connections_json,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at
  `).run(
    clientId,
    merged.url,
    merged.fallbackUrl,
    merged.authMethod,
    merged.token,
    oauthTokensJson,
    connectionsJson,
    req.auth.user.id,
    existing?.created_at || now,
    now,
  );

  const savedConfig = { ...merged, updatedAt: now };

  return res.json({
    config: savedConfig,
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
