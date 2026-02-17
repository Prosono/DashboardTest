import crypto from 'crypto';
import db from './db.js';

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

const base64url = (buf) => buf.toString('base64url');

export const createSession = (userId) => {
  const token = base64url(crypto.randomBytes(48));
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  db.prepare('INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
    .run(token, userId, expiresAt, new Date().toISOString());
  return { token, expiresAt };
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
    SELECT s.token, s.user_id, s.expires_at, u.username, u.role, u.assigned_dashboard_id
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token = ?
  `).get(token);

  if (!session) return res.status(401).json({ error: 'Invalid session' });
  if (Date.parse(session.expires_at) <= Date.now()) {
    deleteSession(token);
    return res.status(401).json({ error: 'Session expired' });
  }

  req.auth = {
    token,
    user: {
      id: session.user_id,
      username: session.username,
      role: session.role,
      assignedDashboardId: session.assigned_dashboard_id || 'default',
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
  username: userRow.username,
  role: userRow.role,
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
