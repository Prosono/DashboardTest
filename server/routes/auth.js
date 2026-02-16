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

router.get('/ha-config', authRequired, (_req, res) => {
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
  const url = String(req.body?.url || '').trim();
  const fallbackUrl = String(req.body?.fallbackUrl || '').trim();
  const authMethod = String(req.body?.authMethod || 'oauth').trim() === 'token' ? 'token' : 'oauth';
  const token = String(req.body?.token || '').trim();
  const oauthTokens = req.body?.oauthTokens ?? null;
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
