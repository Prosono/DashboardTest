import crypto from 'crypto';

const DEFAULT_INVITATION_TTL_HOURS = 72;

export const normalizeInvitationEmail = (value) => String(value || '').trim().toLowerCase();

export const isValidInvitationEmail = (value) => {
  const email = normalizeInvitationEmail(value);
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

export const validateInvitationUsername = (value) => {
  const username = String(value || '').trim();
  if (username.length < 3 || username.length > 64) {
    return { ok: false, error: 'Username must be between 3 and 64 characters' };
  }
  if (!/^[\p{L}\p{N}._-]+$/u.test(username)) {
    return { ok: false, error: 'Username can only contain letters, numbers, period, underscore and hyphen' };
  }
  return { ok: true, value: username };
};

export const validateInvitationPassword = (value) => {
  const password = String(value || '');
  if (password.length < 10 || password.length > 256) {
    return { ok: false, error: 'Password must be between 10 and 256 characters' };
  }
  if (!/\p{L}/u.test(password) || !/\p{N}/u.test(password)) {
    return { ok: false, error: 'Password must contain at least one letter and one number' };
  }
  return { ok: true, value: password };
};

export const createInvitationToken = () => crypto.randomBytes(32).toString('base64url');

export const hashInvitationToken = (token) => crypto
  .createHash('sha256')
  .update(String(token || ''), 'utf8')
  .digest('hex');

export const getInvitationTtlHours = () => {
  const configured = Number.parseInt(
    String(globalThis.process?.env?.USER_INVITATION_TTL_HOURS || ''),
    10,
  );
  if (!Number.isFinite(configured) || configured < 1) return DEFAULT_INVITATION_TTL_HOURS;
  return Math.min(configured, 24 * 30);
};

export const getInvitationExpiry = (now = Date.now()) => (
  new Date(now + getInvitationTtlHours() * 60 * 60 * 1000).toISOString()
);

export const isInvitationExpired = (expiresAt, now = Date.now()) => {
  const expiresMs = Date.parse(String(expiresAt || ''));
  return !Number.isFinite(expiresMs) || expiresMs <= now;
};
