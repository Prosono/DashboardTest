import { Router } from 'express';
import { randomUUID } from 'crypto';
import db, { normalizeClientId, provisionClientDefaults } from '../db.js';
import { adminRequired, authRequired, createScopedSession, createSession, deleteSession, getTokenFromRequest, safeUser } from '../auth.js';
import { hashPassword, verifyPassword } from '../password.js';
import { mergeHaConfigPayload, parseHaConfigRow, serializeHaConnections } from '../haConfig.js';
import {
  getNotificationConfigKey,
  normalizeNotificationConfig,
  parseStoredNotificationConfig,
} from '../notificationConfig.js';
import {
  getNotificationHistoryKey,
  MAX_NOTIFICATION_HISTORY,
  normalizeNotificationHistory,
  normalizeNotificationHistoryEntry,
  parseStoredNotificationHistory,
  serializeNotificationHistory,
  shouldDedupeHistoryEntry,
} from '../notificationHistory.js';

const SUPER_ADMIN_CLIENT_ID = normalizeClientId(process.env.SUPER_ADMIN_CLIENT_ID || 'AdministratorClient') || 'administratorclient';
const PLATFORM_ADMIN_CLIENT_ID = normalizeClientId(process.env.PLATFORM_ADMIN_CLIENT_ID || SUPER_ADMIN_CLIENT_ID) || SUPER_ADMIN_CLIENT_ID;
const SUPER_ADMIN_USERNAME = String(process.env.SUPER_ADMIN_USERNAME || process.env.DEFAULT_ADMIN_USERNAME || '').trim();
const SUPER_ADMIN_PASSWORD = String(process.env.SUPER_ADMIN_PASSWORD || process.env.DEFAULT_ADMIN_PASSWORD || '');
const SUPER_ADMIN_USER_ID = 'platform-super-admin';
const SUPER_ADMIN_DB_USERNAME = '__platform_super_admin__';

const loadSuperAdminConfig = () => {
  const dbUsername = db.prepare("SELECT value FROM system_settings WHERE key = 'super_admin_username'").get()?.value || '';
  const dbPasswordHash = db.prepare("SELECT value FROM system_settings WHERE key = 'super_admin_password_hash'").get()?.value || '';

  const username = String(dbUsername || SUPER_ADMIN_USERNAME || '').trim();
  return {
    username,
    dbPasswordHash: String(dbPasswordHash || '').trim(),
    envPassword: String(SUPER_ADMIN_PASSWORD || ''),
  };
};

const router = Router();

router.post('/login', (req, res) => {
  const clientIdRaw = String(req.body?.clientId || '').trim();
  const clientId = normalizeClientId(clientIdRaw);
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');

  if (!clientId || !username || !password) {
    return res.status(400).json({ error: 'Client ID, username and password are required' });
  }

  const superAdmin = loadSuperAdminConfig();
  const isSuperAdminCredentials = Boolean(superAdmin.username)
    && username === superAdmin.username
    && (
      (superAdmin.dbPasswordHash && verifyPassword(password, superAdmin.dbPasswordHash))
      || (!superAdmin.dbPasswordHash && superAdmin.envPassword && password === superAdmin.envPassword)
    );
  const isSuperAdminLogin = isSuperAdminCredentials && clientId === SUPER_ADMIN_CLIENT_ID;

  if (isSuperAdminCredentials && !isSuperAdminLogin) {
    return res.status(401).json({ error: 'Invalid client ID, username or password' });
  }

  if (isSuperAdminLogin) {
    provisionClientDefaults(PLATFORM_ADMIN_CLIENT_ID, PLATFORM_ADMIN_CLIENT_ID);
    const now = new Date().toISOString();
    const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(SUPER_ADMIN_USER_ID);
    if (!existing) {
      const platformDefaultDashboard = db.prepare('SELECT id FROM dashboards WHERE client_id = ? AND id = ?').get(PLATFORM_ADMIN_CLIENT_ID, 'default');
      if (!platformDefaultDashboard) {
        return res.status(500).json({ error: 'Platform admin client is not provisioned correctly' });
      }
      db.prepare(`
        INSERT INTO users (
          id, client_id, username, password_hash, role, assigned_dashboard_id,
          ha_url, ha_token, full_name, email, phone, avatar_url,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'admin', 'default', '', '', '', '', '', '', ?, ?)
      `).run(SUPER_ADMIN_USER_ID, PLATFORM_ADMIN_CLIENT_ID, SUPER_ADMIN_DB_USERNAME, hashPassword(randomUUID()), now, now);
    }

    const session = createScopedSession(SUPER_ADMIN_USER_ID, {
      scopeClientId: SUPER_ADMIN_CLIENT_ID,
      isSuperAdmin: true,
      sessionUsername: superAdmin.username,
    });
    return res.json({
      token: session.token,
      expiresAt: session.expiresAt,
      user: {
        id: SUPER_ADMIN_USER_ID,
        clientId: SUPER_ADMIN_CLIENT_ID,
        username: superAdmin.username,
        role: 'admin',
        assignedDashboardId: 'default',
        haUrl: '',
        haToken: '',
        fullName: '',
        email: '',
        phone: '',
        avatarUrl: '',
        createdAt: now,
        updatedAt: now,
        isPlatformAdmin: true,
      },
    });
  }

  const targetClient = db.prepare('SELECT id FROM clients WHERE id = ?').get(clientId);
  if (!targetClient) {
    return res.status(401).json({ error: 'Invalid client ID, username or password' });
  }

  const user = db.prepare('SELECT * FROM users WHERE client_id = ? AND username = ?').get(clientId, username);
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid client ID, username or password' });
  }

  const session = createSession(user.id);
  return res.json({ token: session.token, expiresAt: session.expiresAt, user: safeUser(user) });
});

router.post('/logout', authRequired, (req, res) => {
  const token = getTokenFromRequest(req);
  deleteSession(token);
  res.json({ success: true });
});

router.get('/me', authRequired, (req, res) => {
  const user = req.auth.user.isPlatformAdmin
    ? db.prepare('SELECT * FROM users WHERE id = ?').get(req.auth.user.id)
    : db.prepare('SELECT * FROM users WHERE id = ? AND client_id = ?').get(req.auth.user.id, req.auth.user.clientId);
  if (!user) return res.status(401).json({ error: 'User no longer exists' });
  const safe = safeUser(user);
  if (req.auth.user.isPlatformAdmin) {
    safe.clientId = req.auth.user.clientId;
    safe.username = req.auth.user.username;
    safe.isPlatformAdmin = true;
  }
  return res.json({ user: safe });
});

const saveProfile = (req, res) => {
  const existing = db.prepare('SELECT * FROM users WHERE id = ? AND client_id = ?').get(req.auth.user.id, req.auth.user.clientId);
  if (!existing) return res.status(401).json({ error: 'User no longer exists' });

  const username = req.body?.username !== undefined ? String(req.body.username || '').trim() : existing.username;
  const fullName = req.body?.fullName !== undefined ? String(req.body.fullName || '').trim() : (existing.full_name || '');
  const email = req.body?.email !== undefined ? String(req.body.email || '').trim() : (existing.email || '');
  const phone = req.body?.phone !== undefined ? String(req.body.phone || '').trim() : (existing.phone || '');
  const avatarUrl = req.body?.avatarUrl !== undefined ? String(req.body.avatarUrl || '').trim() : (existing.avatar_url || '');
  if (!username) return res.status(400).json({ error: 'Username cannot be empty' });

  const duplicate = db.prepare('SELECT id FROM users WHERE client_id = ? AND username = ? AND id != ?').get(req.auth.user.clientId, username, req.auth.user.id);
  if (duplicate) return res.status(409).json({ error: 'Username already exists' });

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE users
    SET username = ?, full_name = ?, email = ?, phone = ?, avatar_url = ?, updated_at = ?
    WHERE id = ? AND client_id = ?
  `).run(username, fullName, email, phone, avatarUrl, now, req.auth.user.id, req.auth.user.clientId);

  const user = db.prepare('SELECT * FROM users WHERE id = ? AND client_id = ?').get(req.auth.user.id, req.auth.user.clientId);
  return res.json({ user: safeUser(user) });
};

router.put('/profile', authRequired, saveProfile);
router.post('/profile', authRequired, saveProfile);

router.get('/ha-config', authRequired, (req, res) => {
  const row = db.prepare('SELECT * FROM ha_config WHERE client_id = ?').get(req.auth.user.clientId);
  const parsedConfig = parseHaConfigRow(row);

  const user = db.prepare('SELECT * FROM users WHERE id = ? AND client_id = ?').get(req.auth.user.id, req.auth.user.clientId);
  const hasUserTokenConfig = Boolean(user?.ha_url && user?.ha_token);
  if (req.auth.user.role !== 'admin' && hasUserTokenConfig) {
    const userConnection = {
      id: 'user-connection',
      name: 'User',
      url: user.ha_url || '',
      fallbackUrl: '',
      authMethod: 'token',
      token: user.ha_token || '',
      oauthTokens: null,
    };
    return res.json({
      config: {
        url: userConnection.url,
        fallbackUrl: userConnection.fallbackUrl,
        authMethod: userConnection.authMethod,
        token: userConnection.token,
        oauthTokens: userConnection.oauthTokens,
        connections: [userConnection],
        primaryConnectionId: userConnection.id,
        updatedAt: user.updated_at || null,
      },
    });
  }

  return res.json({
    config: {
      ...parsedConfig,
    },
  });
});

router.put('/ha-config', authRequired, adminRequired, (req, res) => {
  if (!req.auth?.user?.isPlatformAdmin) {
    return res.status(403).json({ error: 'Only platform admin can change connections' });
  }
  const existing = db.prepare('SELECT * FROM ha_config WHERE client_id = ?').get(req.auth.user.clientId);
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
    req.auth.user.clientId,
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

router.get('/notification-config', authRequired, (req, res) => {
  const key = getNotificationConfigKey(req.auth?.user?.clientId);
  const row = db.prepare('SELECT value, updated_at FROM system_settings WHERE key = ?').get(key);
  const parsed = parseStoredNotificationConfig(row?.value || '');
  const normalized = normalizeNotificationConfig(parsed);

  return res.json({
    config: {
      ...normalized,
      updatedAt: row?.updated_at || parsed?.updatedAt || null,
    },
  });
});

router.put('/notification-config', authRequired, adminRequired, (req, res) => {
  const key = getNotificationConfigKey(req.auth?.user?.clientId);
  const now = new Date().toISOString();
  const normalized = normalizeNotificationConfig(req.body || {});
  const payload = JSON.stringify({ ...normalized, updatedAt: now });

  db.prepare(`
    INSERT INTO system_settings (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
  `).run(key, payload, now);

  return res.json({
    config: {
      ...normalized,
      updatedAt: now,
    },
  });
});

const loadNotificationHistoryForClient = (clientId) => {
  const key = getNotificationHistoryKey(clientId);
  const row = db.prepare('SELECT value, updated_at FROM system_settings WHERE key = ?').get(key);
  return {
    key,
    row,
    history: parseStoredNotificationHistory(row?.value || ''),
  };
};

const persistNotificationHistoryForClient = (clientId, history) => {
  const key = getNotificationHistoryKey(clientId);
  const now = new Date().toISOString();
  const normalized = normalizeNotificationHistory(history).slice(0, MAX_NOTIFICATION_HISTORY);
  const payload = serializeNotificationHistory(normalized);

  db.prepare(`
    INSERT INTO system_settings (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
  `).run(key, payload, now);

  return { history: normalized, updatedAt: now };
};

router.get('/notification-history', authRequired, (req, res) => {
  const { row, history } = loadNotificationHistoryForClient(req.auth?.user?.clientId);
  return res.json({
    history,
    updatedAt: row?.updated_at || null,
  });
});

router.post('/notification-history', authRequired, (req, res) => {
  const candidate = normalizeNotificationHistoryEntry(req.body?.entry || req.body || {});
  if (!candidate.id) {
    return res.status(400).json({ error: 'Notification entry id is required' });
  }

  const dedupeWindowMs = Math.max(0, Math.min(120000, Number.parseInt(String(req.body?.dedupeWindowMs ?? ''), 10) || 15000));
  const { history: currentHistory } = loadNotificationHistoryForClient(req.auth?.user?.clientId);
  const deduped = currentHistory.some((entry) => shouldDedupeHistoryEntry(entry, candidate, dedupeWindowMs));
  const nextHistory = deduped
    ? currentHistory
    : [candidate, ...currentHistory].slice(0, MAX_NOTIFICATION_HISTORY);

  const saved = persistNotificationHistoryForClient(req.auth?.user?.clientId, nextHistory);
  return res.json({
    history: saved.history,
    updatedAt: saved.updatedAt,
    deduped,
  });
});

router.delete('/notification-history', authRequired, (req, res) => {
  const saved = persistNotificationHistoryForClient(req.auth?.user?.clientId, []);
  return res.json({
    history: saved.history,
    updatedAt: saved.updatedAt,
  });
});

router.delete('/notification-history/:entryId', authRequired, (req, res) => {
  const entryId = String(req.params?.entryId || '').trim();
  if (!entryId) {
    return res.status(400).json({ error: 'Notification entry id is required' });
  }

  const { history: currentHistory } = loadNotificationHistoryForClient(req.auth?.user?.clientId);
  const nextHistory = currentHistory.filter((entry) => String(entry?.id || '').trim() !== entryId);
  const saved = persistNotificationHistoryForClient(req.auth?.user?.clientId, nextHistory);
  return res.json({
    history: saved.history,
    updatedAt: saved.updatedAt,
  });
});

export default router;
