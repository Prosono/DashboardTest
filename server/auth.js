import crypto from 'crypto';
import db from './db.js';

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const SESSION_TOUCH_INTERVAL_MS = 30_000;

const base64url = (buf) => buf.toString('base64url');
const nowIso = () => new Date().toISOString();
const toSafeString = (value, max = 512) => String(value || '').trim().slice(0, max);

export const getClientIp = (req) => {
  const forwardedFor = toSafeString(req?.get?.('x-forwarded-for') || req?.headers?.['x-forwarded-for'], 512);
  const firstForwarded = forwardedFor
    .split(',')
    .map((part) => part.trim())
    .find(Boolean);
  const candidate = firstForwarded || toSafeString(req?.ip || req?.socket?.remoteAddress || '', 256);
  return candidate.replace(/^::ffff:/i, '');
};

export const getUserAgent = (req) => toSafeString(req?.get?.('user-agent') || req?.headers?.['user-agent'], 512);

const normalizeActivityData = (value) => {
  if (!value) return '';
  if (typeof value === 'string') return toSafeString(value, 2000);
  try {
    return toSafeString(JSON.stringify(value), 2000);
  } catch {
    return '';
  }
};

const buildSessionMetadata = (options = {}) => {
  const createdAt = toSafeString(options.createdAt || nowIso(), 64) || nowIso();
  const activityAt = toSafeString(options.lastActivityAt || createdAt, 64) || createdAt;
  const seenAt = toSafeString(options.lastSeenAt || createdAt, 64) || createdAt;
  return {
    createdAt,
    lastSeenAt: seenAt,
    lastActivityAt: activityAt,
    lastActivityPath: toSafeString(options.activityPath || options.lastActivityPath, 256),
    lastActivityLabel: toSafeString(options.activityLabel || options.lastActivityLabel || 'login', 256),
    lastActivityData: normalizeActivityData(options.activityData || options.lastActivityData),
    ipAddress: toSafeString(options.ipAddress, 128),
    userAgent: toSafeString(options.userAgent, 512),
  };
};

export const createSession = (userId, options = {}) => {
  const token = base64url(crypto.randomBytes(48));
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  const metadata = buildSessionMetadata(options);
  db.prepare(`
    INSERT INTO sessions (
      token, user_id, expires_at, created_at,
      scope_client_id, is_super_admin, session_username,
      last_seen_at, last_activity_at, last_activity_path, last_activity_label, last_activity_data,
      ip_address, user_agent
    ) VALUES (?, ?, ?, ?, NULL, 0, NULL, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    token,
    userId,
    expiresAt,
    metadata.createdAt,
    metadata.lastSeenAt,
    metadata.lastActivityAt,
    metadata.lastActivityPath,
    metadata.lastActivityLabel,
    metadata.lastActivityData,
    metadata.ipAddress,
    metadata.userAgent,
  );
  return { token, expiresAt };
};

export const createScopedSession = (userId, options = {}) => {
  const token = base64url(crypto.randomBytes(48));
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  const metadata = buildSessionMetadata(options);
  const scopeClientId = options?.scopeClientId ? String(options.scopeClientId).trim() : null;
  const isSuperAdmin = options?.isSuperAdmin ? 1 : 0;
  const sessionUsername = options?.sessionUsername ? String(options.sessionUsername).trim() : null;
  db.prepare(`
    INSERT INTO sessions (
      token, user_id, expires_at, created_at, scope_client_id, is_super_admin, session_username,
      last_seen_at, last_activity_at, last_activity_path, last_activity_label, last_activity_data,
      ip_address, user_agent
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    token,
    userId,
    expiresAt,
    metadata.createdAt,
    scopeClientId || null,
    isSuperAdmin,
    sessionUsername || null,
    metadata.lastSeenAt,
    metadata.lastActivityAt,
    metadata.lastActivityPath,
    metadata.lastActivityLabel,
    metadata.lastActivityData,
    metadata.ipAddress,
    metadata.userAgent,
  );
  return { token, expiresAt };
};

export const touchSession = (token, options = {}) => {
  const safeToken = toSafeString(token, 256);
  if (!safeToken) return false;
  const lastSeenAt = toSafeString(options.lastSeenAt || nowIso(), 64);
  const lastActivityAt = toSafeString(options.lastActivityAt, 64);
  const activityPath = toSafeString(options.activityPath, 256);
  const activityLabel = toSafeString(options.activityLabel, 256);
  const activityData = normalizeActivityData(options.activityData);
  const ipAddress = toSafeString(options.ipAddress, 128);
  const userAgent = toSafeString(options.userAgent, 512);

  const result = db.prepare(`
    UPDATE sessions
    SET
      last_seen_at = COALESCE(NULLIF(?, ''), last_seen_at),
      last_activity_at = COALESCE(NULLIF(?, ''), last_activity_at),
      last_activity_path = COALESCE(NULLIF(?, ''), last_activity_path),
      last_activity_label = COALESCE(NULLIF(?, ''), last_activity_label),
      last_activity_data = COALESCE(NULLIF(?, ''), last_activity_data),
      ip_address = COALESCE(NULLIF(?, ''), ip_address),
      user_agent = COALESCE(NULLIF(?, ''), user_agent)
    WHERE token = ?
  `).run(
    lastSeenAt,
    lastActivityAt,
    activityPath,
    activityLabel,
    activityData,
    ipAddress,
    userAgent,
    safeToken,
  );
  return result.changes > 0;
};

export const deleteSession = (token) => {
  if (!token) return;
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
};

export const getTokenFromRequest = (req) => {
  const auth = req.get('authorization') || '';
  const [scheme, value] = auth.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !value) return null;
  return value.trim();
};

export const authRequired = (req, res, next) => {
  const token = getTokenFromRequest(req);
  if (!token) return res.status(401).json({ error: 'Missing bearer token' });

  const session = db.prepare(`
    SELECT
      s.token,
      s.user_id,
      s.expires_at,
      s.scope_client_id,
      s.is_super_admin,
      s.session_username,
      s.last_seen_at,
      s.ip_address,
      s.user_agent,
      u.client_id AS user_client_id,
      u.username,
      u.role,
      u.assigned_dashboard_id
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token = ?
  `).get(token);

  if (!session) return res.status(401).json({ error: 'Invalid session' });
  if (Date.parse(session.expires_at) <= Date.now()) {
    deleteSession(token);
    return res.status(401).json({ error: 'Session expired' });
  }

  const clientIp = getClientIp(req);
  const userAgent = getUserAgent(req);
  const lastSeenMs = Date.parse(String(session.last_seen_at || ''));
  const shouldTouch = (
    !Number.isFinite(lastSeenMs)
    || (Date.now() - lastSeenMs) >= SESSION_TOUCH_INTERVAL_MS
    || (clientIp && clientIp !== String(session.ip_address || ''))
    || (userAgent && userAgent !== String(session.user_agent || ''))
  );
  if (shouldTouch) {
    touchSession(token, {
      lastSeenAt: nowIso(),
      ipAddress: clientIp,
      userAgent,
    });
  }

  req.auth = {
    token,
    user: {
      id: session.user_id,
      clientId: session.scope_client_id || session.user_client_id,
      username: session.session_username || session.username,
      role: Number(session.is_super_admin || 0) === 1 ? 'admin' : session.role,
      assignedDashboardId: session.assigned_dashboard_id || 'default',
      isPlatformAdmin: Number(session.is_super_admin || 0) === 1,
    },
  };

  return next();
};

export const adminRequired = (req, res, next) => {
  if (!req.auth?.user) return res.status(401).json({ error: 'Unauthenticated' });
  if (req.auth.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  return next();
};

export const safeUser = (userRow) => ({
  id: userRow.id,
  clientId: userRow.client_id,
  username: userRow.username,
  role: userRow.role,
  isPlatformAdmin: false,
  assignedDashboardId: userRow.assigned_dashboard_id || 'default',
  haUrl: userRow.ha_url || '',
  haToken: userRow.ha_token || '',
  fullName: userRow.full_name || '',
  email: userRow.email || '',
  phone: userRow.phone || '',
  avatarUrl: userRow.avatar_url || '',
  createdAt: userRow.created_at,
  updatedAt: userRow.updated_at,
});
