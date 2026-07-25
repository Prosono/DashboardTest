import { Router } from 'express';
import { randomUUID } from 'crypto';
import db from '../db.js';
import { adminRequired, authRequired, safeUser } from '../auth.js';
import { hashPassword } from '../password.js';
import { sendUserInvitationEmail } from '../email.js';
import {
  createInvitationToken,
  getInvitationExpiry,
  hashInvitationToken,
  isValidInvitationEmail,
  normalizeInvitationEmail,
} from '../userInvitations.js';

const router = Router();

router.use(authRequired, adminRequired);

const parseRole = (value, fallback = 'user') => {
  if (value === undefined || value === null) return fallback;
  const next = String(value).trim();
  if (next === 'admin' || next === 'inspector') return next;
  return 'user';
};

const parseHaFields = (body = {}, fallback = {}) => {
  const haUrl = body?.haUrl !== undefined ? String(body.haUrl || '').trim() : String(fallback.ha_url || '');
  const haToken = body?.haToken !== undefined ? String(body.haToken || '').trim() : String(fallback.ha_token || '');
  const hasOnlyOne = (haUrl && !haToken) || (!haUrl && haToken);
  if (hasOnlyOne) return { error: 'HA URL and HA token must both be set or both be empty' };
  return { haUrl, haToken };
};

const resolveTargetClientId = (req) => {
  if (!req.auth?.user?.isPlatformAdmin) return req.auth.user.clientId;
  const requested = String(req.body?.clientId || '').trim();
  return requested || req.auth.user.clientId;
};

const invitationFieldsSql = `
  (
    SELECT i.expires_at
    FROM user_invitations i
    WHERE i.user_id = users.id AND i.used_at IS NULL AND i.revoked_at IS NULL
    ORDER BY i.created_at DESC
    LIMIT 1
  ) AS invitation_expires_at,
  (
    SELECT i.sent_at
    FROM user_invitations i
    WHERE i.user_id = users.id AND i.used_at IS NULL AND i.revoked_at IS NULL
    ORDER BY i.created_at DESC
    LIMIT 1
  ) AS invitation_sent_at
`;

const loadUserWithInvitation = (id, clientId = '') => (
  clientId
    ? db.prepare(`SELECT users.*, ${invitationFieldsSql} FROM users WHERE users.id = ? AND users.client_id = ?`).get(id, clientId)
    : db.prepare(`SELECT users.*, ${invitationFieldsSql} FROM users WHERE users.id = ?`).get(id)
);

const insertInvitation = ({ userId, email, createdBy }) => {
  const token = createInvitationToken();
  const invitationId = randomUUID();
  const now = new Date().toISOString();
  const expiresAt = getInvitationExpiry();
  db.prepare(`
    INSERT INTO user_invitations (
      id, user_id, token_hash, email, created_by, expires_at, sent_at, used_at, revoked_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?)
  `).run(
    invitationId,
    userId,
    hashInvitationToken(token),
    email,
    createdBy || null,
    expiresAt,
    now,
  );
  return { invitationId, token, expiresAt, createdAt: now };
};

const deliverInvitation = async ({ invitation, user, client }) => {
  const result = await sendUserInvitationEmail({
    to: user.email,
    fullName: user.full_name,
    clientId: user.client_id,
    clientName: client?.name || user.client_id,
    token: invitation.token,
    expiresAt: invitation.expiresAt,
  });
  const sentAt = new Date().toISOString();
  db.prepare('UPDATE user_invitations SET sent_at = ? WHERE id = ?')
    .run(sentAt, invitation.invitationId);
  return { ...result, sentAt };
};

router.get('/', (_req, res) => {
  const users = _req.auth.user.isPlatformAdmin
    ? db.prepare(`SELECT users.*, ${invitationFieldsSql} FROM users ORDER BY client_id ASC, full_name ASC, username ASC`).all()
    : db.prepare(`SELECT users.*, ${invitationFieldsSql} FROM users WHERE client_id = ? ORDER BY full_name ASC, username ASC`).all(_req.auth.user.clientId);
  res.json({ users: users.map(safeUser) });
});

router.post('/', async (req, res) => {
  const clientId = resolveTargetClientId(req);
  const role = parseRole(req.body?.role, 'user');
  const assignedDashboardId = String(req.body?.assignedDashboardId || 'default').trim() || 'default';
  const parsedHa = parseHaFields(req.body);
  const fullName = String(req.body?.fullName || '').trim();
  const email = normalizeInvitationEmail(req.body?.email);
  const phoneCountryCode = String(req.body?.phoneCountryCode || '+47').trim() || '+47';
  const phone = String(req.body?.phone || '').trim();
  const avatarUrl = String(req.body?.avatarUrl || '').trim();

  if (!fullName) return res.status(400).json({ error: 'Name is required' });
  if (!isValidInvitationEmail(email)) return res.status(400).json({ error: 'A valid email address is required' });
  const client = db.prepare('SELECT id, name FROM clients WHERE id = ?').get(clientId);
  if (!client) return res.status(400).json({ error: 'Invalid client ID' });
  if (parsedHa.error) return res.status(400).json({ error: parsedHa.error });

  const existingEmail = db.prepare('SELECT id FROM users WHERE client_id = ? AND lower(email) = ?').get(clientId, email);
  if (existingEmail) return res.status(409).json({ error: 'A user with this email address already exists for the client' });

  const dash = db.prepare('SELECT id FROM dashboards WHERE client_id = ? AND id = ?').get(clientId, assignedDashboardId);
  if (!dash) return res.status(400).json({ error: 'Assigned dashboard does not exist' });

  const now = new Date().toISOString();
  const id = randomUUID();
  const username = `pending-${id.replace(/-/g, '').slice(0, 20)}`;
  let invitation = null;

  try {
    db.transaction(() => {
      db.prepare(`
        INSERT INTO users (
          id, client_id, username, password_hash, role, assigned_dashboard_id,
          ha_url, ha_token, full_name, email, account_status, activated_at,
          phone_country_code, phone, avatar_url, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'invited', NULL, ?, ?, ?, ?, ?)
      `).run(
        id,
        clientId,
        username,
        hashPassword(randomUUID()),
        role,
        assignedDashboardId,
        parsedHa.haUrl,
        parsedHa.haToken,
        fullName,
        email,
        phoneCountryCode,
        phone,
        avatarUrl,
        now,
        now,
      );
      invitation = insertInvitation({
        userId: id,
        email,
        createdBy: req.auth.user.id,
      });
    })();
    const userRow = db.prepare('SELECT * FROM users WHERE id = ? AND client_id = ?').get(id, clientId);
    const delivery = await deliverInvitation({ invitation, user: userRow, client });
    const user = loadUserWithInvitation(id, clientId);
    return res.status(201).json({
      user: safeUser(user),
      invitation: {
        sent: true,
        sentAt: delivery.sentAt,
        expiresAt: invitation.expiresAt,
      },
    });
  } catch (error) {
    db.prepare('DELETE FROM users WHERE id = ? AND account_status = ?').run(id, 'invited');
    return res.status(503).json({
      error: `The user was not created because the invitation email could not be sent: ${error?.message || 'email delivery failed'}`,
      code: 'INVITATION_EMAIL_FAILED',
    });
  }
});

router.post('/:id/resend-invitation', async (req, res) => {
  const id = String(req.params.id || '').trim();
  const existing = req.auth.user.isPlatformAdmin
    ? db.prepare('SELECT * FROM users WHERE id = ?').get(id)
    : db.prepare('SELECT * FROM users WHERE id = ? AND client_id = ?').get(id, req.auth.user.clientId);
  if (!existing) return res.status(404).json({ error: 'User not found' });
  if (existing.account_status !== 'invited') {
    return res.status(400).json({ error: 'Only users waiting for activation can receive a new invitation' });
  }
  if (!isValidInvitationEmail(existing.email)) {
    return res.status(400).json({ error: 'The user does not have a valid email address' });
  }
  const client = db.prepare('SELECT id, name FROM clients WHERE id = ?').get(existing.client_id);
  const invitation = insertInvitation({
    userId: existing.id,
    email: existing.email,
    createdBy: req.auth.user.id,
  });
  try {
    const delivery = await deliverInvitation({ invitation, user: existing, client });
    db.prepare(`
      UPDATE user_invitations
      SET revoked_at = ?
      WHERE user_id = ? AND id != ? AND used_at IS NULL AND revoked_at IS NULL
    `).run(delivery.sentAt, existing.id, invitation.invitationId);
    const user = loadUserWithInvitation(existing.id, existing.client_id);
    return res.json({
      user: safeUser(user),
      invitation: {
        sent: true,
        sentAt: delivery.sentAt,
        expiresAt: invitation.expiresAt,
      },
    });
  } catch (error) {
    db.prepare('DELETE FROM user_invitations WHERE id = ?').run(invitation.invitationId);
    return res.status(503).json({
      error: `The invitation email could not be sent: ${error?.message || 'email delivery failed'}`,
      code: 'INVITATION_EMAIL_FAILED',
    });
  }
});

router.put('/:id', (req, res) => {
  const id = String(req.params.id || '').trim();
  const existing = req.auth.user.isPlatformAdmin
    ? db.prepare('SELECT * FROM users WHERE id = ?').get(id)
    : db.prepare('SELECT * FROM users WHERE id = ? AND client_id = ?').get(id, req.auth.user.clientId);
  if (!existing) return res.status(404).json({ error: 'User not found' });
  const clientId = existing.client_id;

  const username = req.body?.username !== undefined ? String(req.body.username).trim() : existing.username;
  const role = parseRole(req.body?.role, existing.role);
  const roleChanged = role !== existing.role;
  const assignedDashboardId = req.body?.assignedDashboardId !== undefined ? String(req.body.assignedDashboardId || '').trim() : existing.assigned_dashboard_id;
  const password = req.body?.password !== undefined ? String(req.body.password) : '';
  const parsedHa = parseHaFields(req.body, existing);
  const fullName = req.body?.fullName !== undefined ? String(req.body.fullName || '').trim() : (existing.full_name || '');
  const email = req.body?.email !== undefined ? String(req.body.email || '').trim() : (existing.email || '');
  const phoneCountryCode = req.body?.phoneCountryCode !== undefined
    ? String(req.body.phoneCountryCode || '').trim()
    : (existing.phone_country_code || '+47');
  const phone = req.body?.phone !== undefined ? String(req.body.phone || '').trim() : (existing.phone || '');
  const avatarUrl = req.body?.avatarUrl !== undefined ? String(req.body.avatarUrl || '').trim() : (existing.avatar_url || '');

  if (!username) return res.status(400).json({ error: 'Username cannot be empty' });
  if (email && !isValidInvitationEmail(email)) return res.status(400).json({ error: 'Email address is invalid' });
  if (existing.account_status === 'invited' && !fullName) return res.status(400).json({ error: 'Name is required for invited users' });
  if (parsedHa.error) return res.status(400).json({ error: parsedHa.error });
  const duplicate = db.prepare('SELECT id FROM users WHERE client_id = ? AND username = ? AND id != ?').get(clientId, username, id);
  if (duplicate) return res.status(409).json({ error: 'Username already exists' });
  if (email) {
    const duplicateEmail = db.prepare('SELECT id FROM users WHERE client_id = ? AND lower(email) = lower(?) AND id != ?')
      .get(clientId, email, id);
    if (duplicateEmail) return res.status(409).json({ error: 'A user with this email address already exists for the client' });
  }

  const dash = db.prepare('SELECT id FROM dashboards WHERE client_id = ? AND id = ?').get(clientId, assignedDashboardId);
  if (!dash) return res.status(400).json({ error: 'Assigned dashboard does not exist' });

  if (existing.role === 'admin' && role !== 'admin') {
    const adminCount = db.prepare("SELECT COUNT(*) AS total FROM users WHERE client_id = ? AND role = 'admin'").get(clientId)?.total || 0;
    if (adminCount <= 1) return res.status(400).json({ error: 'Cannot demote the last admin user' });
  }

  const now = new Date().toISOString();

  db.prepare(`
    UPDATE users
    SET username = ?, role = ?, assigned_dashboard_id = ?, ha_url = ?, ha_token = ?, full_name = ?, email = ?, phone_country_code = ?, phone = ?, avatar_url = ?, updated_at = ?
    WHERE id = ? AND client_id = ?
  `).run(
    username,
    role,
    assignedDashboardId,
    parsedHa.haUrl,
    parsedHa.haToken,
    fullName,
    email,
    phoneCountryCode,
    phone,
    avatarUrl,
    now,
    id,
    clientId,
  );

  if (password) {
    db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ? AND client_id = ?')
      .run(hashPassword(password), now, id, clientId);
  }

  // Role changes should apply immediately across devices/sessions.
  // Force re-auth so clients pick up the new authorization level.
  if (roleChanged) {
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ? AND client_id = ?').get(id, clientId);
  res.json({ user: safeUser(user) });
});

router.delete('/:id', (req, res) => {
  const id = String(req.params.id || '').trim();
  const existing = req.auth.user.isPlatformAdmin
    ? db.prepare('SELECT * FROM users WHERE id = ?').get(id)
    : db.prepare('SELECT * FROM users WHERE id = ? AND client_id = ?').get(id, req.auth.user.clientId);
  if (!existing) return res.status(404).json({ error: 'User not found' });
  const clientId = existing.client_id;
  if (id === req.auth.user.id) return res.status(400).json({ error: 'Cannot delete your own user' });

  if (existing.role === 'admin') {
    const adminCount = db.prepare("SELECT COUNT(*) AS total FROM users WHERE client_id = ? AND role = 'admin'").get(clientId)?.total || 0;
    if (adminCount <= 1) return res.status(400).json({ error: 'Cannot delete the last admin user' });
  }

  db.prepare('DELETE FROM users WHERE id = ? AND client_id = ?').run(id, clientId);
  return res.json({ success: true });
});

export default router;
