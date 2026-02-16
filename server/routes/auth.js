import { Router } from 'express';
import db from '../db.js';
import { authRequired, createSession, deleteSession, getTokenFromRequest, safeUser } from '../auth.js';
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

export default router;
