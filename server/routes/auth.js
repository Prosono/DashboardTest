import { Router } from 'express';
import db from '../db.js';
import { adminRequired, authRequired, createSession, deleteSession, getTokenFromRequest, safeUser } from '../auth.js';
import { verifyPassword } from '../password.js';

const router = Router();

router.post('/login', (req, res) => {
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid username or password' });
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
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.auth.user.id);
  if (!user) return res.status(401).json({ error: 'User no longer exists' });
  return res.json({ user: safeUser(user) });
});

const saveProfile = (req, res) => {
  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(req.auth.user.id);
  if (!existing) return res.status(401).json({ error: 'User no longer exists' });

  const username = req.body?.username !== undefined ? String(req.body.username || '').trim() : existing.username;
  const fullName = req.body?.fullName !== undefined ? String(req.body.fullName || '').trim() : (existing.full_name || '');
  const email = req.body?.email !== undefined ? String(req.body.email || '').trim() : (existing.email || '');
  const phone = req.body?.phone !== undefined ? String(req.body.phone || '').trim() : (existing.phone || '');
  const avatarUrl = req.body?.avatarUrl !== undefined ? String(req.body.avatarUrl || '').trim() : (existing.avatar_url || '');
  if (!username) return res.status(400).json({ error: 'Username cannot be empty' });

  const duplicate = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(username, req.auth.user.id);
  if (duplicate) return res.status(409).json({ error: 'Username already exists' });

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE users
    SET username = ?, full_name = ?, email = ?, phone = ?, avatar_url = ?, updated_at = ?
    WHERE id = ?
  `).run(username, fullName, email, phone, avatarUrl, now, req.auth.user.id);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.auth.user.id);
  return res.json({ user: safeUser(user) });
};

router.put('/profile', authRequired, saveProfile);
router.post('/profile', authRequired, saveProfile);

router.get('/ha-config', authRequired, (req, res) => {
  const row = db.prepare('SELECT * FROM ha_config WHERE id = 1').get();
  const oauthTokens = row?.oauth_tokens
    ? (() => {
      try {
        return JSON.parse(row.oauth_tokens);
      } catch {
        return null;
      }
    })()
    : null;

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.auth.user.id);
  const hasUserTokenConfig = Boolean(user?.ha_url && user?.ha_token);
  if (req.auth.user.role !== 'admin' && hasUserTokenConfig) {
    return res.json({
      config: {
        url: user.ha_url || '',
        fallbackUrl: '',
        authMethod: 'token',
        token: user.ha_token || '',
        oauthTokens: null,
        updatedAt: user.updated_at || null,
      },
    });
  }

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

router.put('/ha-config', authRequired, adminRequired, (req, res) => {
  const existing = db.prepare('SELECT * FROM ha_config WHERE id = 1').get();
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
        try {
          return JSON.parse(existing.oauth_tokens);
        } catch {
          return null;
        }
      })()
      : null;
  }

  const now = new Date().toISOString();

  const oauthTokensJson = oauthTokens ? JSON.stringify(oauthTokens) : null;

  db.prepare(`
    UPDATE ha_config
    SET url = ?, fallback_url = ?, auth_method = ?, token = ?, oauth_tokens = ?, updated_by = ?, updated_at = ?
    WHERE id = 1
  `).run(url, fallbackUrl, authMethod, token, oauthTokensJson, req.auth.user.id, now);

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

export default router;
