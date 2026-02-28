import { Router } from 'express';
import { randomUUID } from 'crypto';
import db, { normalizeClientId, provisionClientDefaults } from '../db.js';
import {
  adminRequired,
  authRequired,
  createScopedSession,
  createSession,
  deleteSession,
  getClientIp,
  getTokenFromRequest,
  getUserAgent,
  safeUser,
  touchSession,
} from '../auth.js';
import { hashPassword, verifyPassword } from '../password.js';
import { mergeHaConfigPayload, parseHaConfigRow, serializeHaConnections } from '../haConfig.js';
import {
  getNotificationConfigKey,
  normalizeNotificationConfig,
  parseStoredNotificationConfig,
} from '../notificationConfig.js';
import {
  getSmsDispatchDedupeStorageKey,
  isTwilioConfigUsable,
  loadTwilioConfig,
  normalizeTwilioConfig,
  persistTwilioConfig,
  sendTwilioSms,
  stripRichTextToPlainText,
  toE164Phone,
  toPublicTwilioConfig,
} from '../twilioSms.js';
import {
  getNotificationHistoryKey,
  MAX_NOTIFICATION_HISTORY,
  normalizeNotificationHistory,
  normalizeNotificationHistoryEntry,
  parseStoredNotificationHistory,
  serializeNotificationHistory,
  shouldDedupeHistoryEntry,
} from '../notificationHistory.js';
import {
  getAppActionHistoryKey,
  MAX_APP_ACTION_HISTORY,
  normalizeAppActionEntry,
  normalizeAppActionHistory,
  parseStoredAppActionHistory,
  serializeAppActionHistory,
  shouldDedupeAppActionEntry,
} from '../appActionHistory.js';

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
const SMS_TARGET_GROUPS = new Set(['admin', 'user', 'inspector']);

const normalizeSmsTargetsPayload = (value) => {
  const input = value && typeof value === 'object' ? value : {};
  const groups = Array.from(new Set(
    (Array.isArray(input.groups) ? input.groups : [])
      .map((entry) => String(entry || '').trim().toLowerCase())
      .filter((entry) => SMS_TARGET_GROUPS.has(entry)),
  ));
  const userIds = Array.from(new Set(
    (Array.isArray(input.userIds) ? input.userIds : [])
      .map((entry) => String(entry || '').trim())
      .filter(Boolean),
  )).slice(0, 100);

  if (groups.length === 0 && userIds.length === 0) {
    return { groups: ['admin'], userIds: [] };
  }
  return { groups, userIds };
};

const resolveSmsRecipientsForClient = (clientId, smsTargets) => {
  const targets = normalizeSmsTargetsPayload(smsTargets);
  const users = db.prepare(`
    SELECT id, username, role, phone_country_code, phone
    FROM users
    WHERE client_id = ?
  `).all(clientId);

  const selectedIds = new Set(targets.userIds);
  const selectedGroups = new Set(targets.groups);
  const recipientsByPhone = new Map();

  users.forEach((user) => {
    const role = String(user?.role || '').trim().toLowerCase();
    const selectedByGroup = selectedGroups.has(role);
    const selectedById = selectedIds.has(String(user?.id || '').trim());
    if (!selectedByGroup && !selectedById) return;
    const e164 = toE164Phone(user?.phone_country_code || '+47', user?.phone || '');
    if (!e164) return;
    if (!recipientsByPhone.has(e164)) {
      recipientsByPhone.set(e164, {
        userId: String(user?.id || '').trim(),
        username: String(user?.username || '').trim(),
        role,
        phone: e164,
      });
    }
  });

  return Array.from(recipientsByPhone.values());
};

const readSmsDedupeTimestamp = (key) => {
  const row = db.prepare('SELECT value FROM system_settings WHERE key = ?').get(key);
  const asNumber = Number.parseInt(String(row?.value || ''), 10);
  return Number.isFinite(asNumber) && asNumber > 0 ? asNumber : 0;
};

const writeSmsDedupeTimestamp = (key, timestampMs) => {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO system_settings (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
  `).run(key, String(Math.max(0, Math.trunc(timestampMs))), now);
};

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
      activityLabel: 'login',
      activityPath: '/auth/login',
      activityData: { role: 'super_admin' },
      ipAddress: getClientIp(req),
      userAgent: getUserAgent(req),
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
        phoneCountryCode: '+47',
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

  const session = createSession(user.id, {
    activityLabel: 'login',
    activityPath: '/auth/login',
    activityData: { role: user.role || 'user' },
    ipAddress: getClientIp(req),
    userAgent: getUserAgent(req),
  });
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

router.post('/session/activity', authRequired, (req, res) => {
  const pageId = String(req.body?.pageId || '').trim();
  const pageLabel = String(req.body?.pageLabel || '').trim();
  const action = String(req.body?.action || '').trim();
  const details = req.body?.details && typeof req.body.details === 'object' ? req.body.details : {};
  const activityLabel = [action, pageLabel || pageId].filter(Boolean).join(' • ').slice(0, 256);
  const activityPath = pageId ? `/page/${pageId}` : '';

  touchSession(req.auth?.token, {
    lastSeenAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString(),
    activityPath,
    activityLabel: activityLabel || 'activity',
    activityData: {
      pageId,
      pageLabel,
      action,
      details,
    },
    ipAddress: getClientIp(req),
    userAgent: getUserAgent(req),
  });

  return res.json({ success: true });
});

const saveProfile = (req, res) => {
  const existing = db.prepare('SELECT * FROM users WHERE id = ? AND client_id = ?').get(req.auth.user.id, req.auth.user.clientId);
  if (!existing) return res.status(401).json({ error: 'User no longer exists' });

  const username = req.body?.username !== undefined ? String(req.body.username || '').trim() : existing.username;
  const fullName = req.body?.fullName !== undefined ? String(req.body.fullName || '').trim() : (existing.full_name || '');
  const email = req.body?.email !== undefined ? String(req.body.email || '').trim() : (existing.email || '');
  const phoneCountryCode = req.body?.phoneCountryCode !== undefined
    ? String(req.body.phoneCountryCode || '').trim()
    : (existing.phone_country_code || '+47');
  const phone = req.body?.phone !== undefined ? String(req.body.phone || '').trim() : (existing.phone || '');
  const avatarUrl = req.body?.avatarUrl !== undefined ? String(req.body.avatarUrl || '').trim() : (existing.avatar_url || '');
  if (!username) return res.status(400).json({ error: 'Username cannot be empty' });

  const duplicate = db.prepare('SELECT id FROM users WHERE client_id = ? AND username = ? AND id != ?').get(req.auth.user.clientId, username, req.auth.user.id);
  if (duplicate) return res.status(409).json({ error: 'Username already exists' });

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE users
    SET username = ?, full_name = ?, email = ?, phone_country_code = ?, phone = ?, avatar_url = ?, updated_at = ?
    WHERE id = ? AND client_id = ?
  `).run(username, fullName, email, phoneCountryCode, phone, avatarUrl, now, req.auth.user.id, req.auth.user.clientId);

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

router.get('/twilio-sms-config', authRequired, adminRequired, (req, res) => {
  if (!req.auth?.user?.isPlatformAdmin) {
    return res.status(403).json({ error: 'Only platform admin can manage Twilio settings' });
  }
  const { config } = loadTwilioConfig();
  return res.json({ config: toPublicTwilioConfig(config) });
});

router.put('/twilio-sms-config', authRequired, adminRequired, (req, res) => {
  if (!req.auth?.user?.isPlatformAdmin) {
    return res.status(403).json({ error: 'Only platform admin can manage Twilio settings' });
  }
  const incoming = req.body && typeof req.body === 'object' ? req.body : {};
  const { config: current } = loadTwilioConfig();
  const next = normalizeTwilioConfig({
    accountSid: Object.prototype.hasOwnProperty.call(incoming, 'accountSid') ? incoming.accountSid : current.accountSid,
    authToken: Object.prototype.hasOwnProperty.call(incoming, 'authToken') ? incoming.authToken : current.authToken,
    fromNumber: Object.prototype.hasOwnProperty.call(incoming, 'fromNumber') ? incoming.fromNumber : current.fromNumber,
  }, current);
  const saved = persistTwilioConfig(next);
  return res.json({ config: toPublicTwilioConfig(saved.config) });
});

router.post('/twilio-sms-test', authRequired, adminRequired, async (req, res) => {
  if (!req.auth?.user?.isPlatformAdmin) {
    return res.status(403).json({ error: 'Only platform admin can send test SMS' });
  }
  const { config } = loadTwilioConfig();
  if (!isTwilioConfigUsable(config)) {
    return res.status(400).json({ error: 'Twilio SMS is not fully configured' });
  }

  const toInput = String(req.body?.to || '').trim();
  const countryCodeInput = String(req.body?.countryCode || '').trim();
  const message = stripRichTextToPlainText(String(req.body?.message || '')).trim();
  const to = toE164Phone(countryCodeInput || '+47', toInput);

  if (!to) return res.status(400).json({ error: 'Test phone number is required' });
  if (!message) return res.status(400).json({ error: 'Test message is required' });

  try {
    const result = await sendTwilioSms({
      accountSid: config.accountSid,
      authToken: config.authToken,
      fromNumber: config.fromNumber,
      to,
      body: message,
    });
    return res.json({
      success: true,
      sid: result?.sid || '',
      to,
    });
  } catch (error) {
    return res.status(502).json({ error: String(error?.message || 'Failed to send Twilio SMS') });
  }
});

router.post('/notification-sms', authRequired, adminRequired, async (req, res) => {
  const title = String(req.body?.title || 'Smart Sauna notification').trim();
  const messageRaw = stripRichTextToPlainText(String(req.body?.message || '')).trim();
  const dedupeKeyRaw = String(req.body?.dedupeKey || '').trim();
  const dedupeWindowMs = Math.max(0, Math.min(86400000, Number.parseInt(String(req.body?.dedupeWindowMs ?? ''), 10) || 0));
  const smsTargets = normalizeSmsTargetsPayload(req.body?.smsTargets || {});
  const clientId = req.auth?.user?.clientId;

  if (!clientId) {
    return res.status(400).json({ error: 'Client scope is required' });
  }
  if (!messageRaw) {
    return res.status(400).json({ error: 'SMS message is required' });
  }

  const { config } = loadTwilioConfig();
  if (!isTwilioConfigUsable(config)) {
    return res.json({
      success: false,
      sent: 0,
      failed: 0,
      deduped: false,
      reason: 'twilio_not_configured',
    });
  }

  const dedupeStorageKey = dedupeWindowMs > 0 && dedupeKeyRaw
    ? getSmsDispatchDedupeStorageKey(clientId, dedupeKeyRaw)
    : '';
  if (dedupeStorageKey) {
    const storageKey = dedupeStorageKey;
    const previousAt = readSmsDedupeTimestamp(storageKey);
    const nowMs = Date.now();
    if (previousAt > 0 && (nowMs - previousAt) < dedupeWindowMs) {
      return res.json({
        success: false,
        sent: 0,
        failed: 0,
        deduped: true,
      });
    }
  }

  const recipients = resolveSmsRecipientsForClient(clientId, smsTargets);
  if (recipients.length === 0) {
    return res.json({
      success: false,
      sent: 0,
      failed: 0,
      deduped: false,
      reason: 'no_recipients',
    });
  }

  let sent = 0;
  let failed = 0;
  const errors = [];
  const smsBody = `${title}\n${messageRaw}`.trim().slice(0, 1400);

  await Promise.all(recipients.map(async (recipient) => {
    try {
      await sendTwilioSms({
        accountSid: config.accountSid,
        authToken: config.authToken,
        fromNumber: config.fromNumber,
        to: recipient.phone,
        body: smsBody,
      });
      sent += 1;
    } catch (error) {
      failed += 1;
      errors.push({
        userId: recipient.userId,
        phone: recipient.phone,
        error: String(error?.message || 'SMS send failed'),
      });
    }
  }));

  if (dedupeStorageKey && sent > 0) {
    writeSmsDedupeTimestamp(dedupeStorageKey, Date.now());
  }

  return res.json({
    success: sent > 0 && failed === 0,
    sent,
    failed,
    deduped: false,
    errors: errors.slice(0, 20),
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

const loadAppActionHistoryForClient = (clientId) => {
  const key = getAppActionHistoryKey(clientId);
  const row = db.prepare('SELECT value, updated_at FROM system_settings WHERE key = ?').get(key);
  return {
    key,
    row,
    history: parseStoredAppActionHistory(row?.value || ''),
  };
};

const persistAppActionHistoryForClient = (clientId, history) => {
  const key = getAppActionHistoryKey(clientId);
  const now = new Date().toISOString();
  const normalized = normalizeAppActionHistory(history).slice(0, MAX_APP_ACTION_HISTORY);
  const payload = serializeAppActionHistory(normalized);

  db.prepare(`
    INSERT INTO system_settings (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
  `).run(key, payload, now);

  return { history: normalized, updatedAt: now };
};

const resolveEntityIdFromActionPayload = (body = {}) => {
  const direct = String(body?.entityId || '').trim();
  if (direct) return direct;

  const fromServiceData = body?.serviceData?.entity_id;
  if (Array.isArray(fromServiceData)) {
    const first = String(fromServiceData[0] || '').trim();
    if (first) return first;
  }
  const fromServiceDataSingle = String(fromServiceData || '').trim();
  if (fromServiceDataSingle) return fromServiceDataSingle;

  const fromTarget = body?.target?.entity_id;
  if (Array.isArray(fromTarget)) {
    const first = String(fromTarget[0] || '').trim();
    if (first) return first;
  }
  const fromTargetSingle = String(fromTarget || '').trim();
  if (fromTargetSingle) return fromTargetSingle;

  return '';
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

router.get('/app-action-history', authRequired, (req, res) => {
  const safeLimit = Math.max(1, Math.min(MAX_APP_ACTION_HISTORY, Number.parseInt(String(req.query?.limit ?? ''), 10) || 200));
  const { row, history } = loadAppActionHistoryForClient(req.auth?.user?.clientId);
  return res.json({
    history: history.slice(0, safeLimit),
    updatedAt: row?.updated_at || null,
  });
});

router.post('/app-action-history', authRequired, (req, res) => {
  const domain = String(req.body?.domain || '').trim().toLowerCase();
  const service = String(req.body?.service || '').trim().toLowerCase();
  if (!domain || !service) {
    return res.status(400).json({ error: 'Domain and service are required' });
  }

  const clientId = req.auth?.user?.clientId;

  const createdAt = new Date().toISOString();
  const entityId = resolveEntityIdFromActionPayload(req.body);
  const entityName = String(req.body?.entityName || '').trim();
  const connectionId = String(req.body?.connectionId || '').trim();

  const candidate = normalizeAppActionEntry({
    id: randomUUID(),
    createdAt,
    actor: {
      id: req.auth?.user?.id,
      username: req.auth?.user?.username,
      role: req.auth?.user?.role,
    },
    domain,
    service,
    entityId,
    entityName,
    connectionId,
    source: 'app_token',
    summary: entityName || entityId || `${domain}.${service}`,
    value: req.body?.value,
    serviceData: req.body?.serviceData,
    target: req.body?.target,
  });

  const dedupeWindowMs = Math.max(0, Math.min(120000, Number.parseInt(String(req.body?.dedupeWindowMs ?? ''), 10) || 1200));
  const { history: currentHistory } = loadAppActionHistoryForClient(clientId);
  const deduped = currentHistory.some((entry) => shouldDedupeAppActionEntry(entry, candidate, dedupeWindowMs));
  const nextHistory = deduped
    ? currentHistory
    : [candidate, ...currentHistory].slice(0, MAX_APP_ACTION_HISTORY);

  const saved = persistAppActionHistoryForClient(clientId, nextHistory);
  return res.json({
    logged: !deduped,
    deduped,
    history: saved.history,
    updatedAt: saved.updatedAt,
  });
});

router.delete('/app-action-history', authRequired, adminRequired, (req, res) => {
  const saved = persistAppActionHistoryForClient(req.auth?.user?.clientId, []);
  return res.json({
    history: saved.history,
    updatedAt: saved.updatedAt,
  });
});

router.delete('/app-action-history/:entryId', authRequired, adminRequired, (req, res) => {
  const entryId = String(req.params?.entryId || '').trim();
  if (!entryId) {
    return res.status(400).json({ error: 'Action entry id is required' });
  }

  const { history: currentHistory } = loadAppActionHistoryForClient(req.auth?.user?.clientId);
  const nextHistory = currentHistory.filter((entry) => String(entry?.id || '').trim() !== entryId);
  const saved = persistAppActionHistoryForClient(req.auth?.user?.clientId, nextHistory);
  return res.json({
    history: saved.history,
    updatedAt: saved.updatedAt,
  });
});

export default router;
