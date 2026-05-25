import { randomUUID } from 'crypto';
import db, { normalizeClientId } from './db.js';

export const LOGIN_AUDIT_HISTORY_KEY = 'login_audit_history_v1';
export const MAX_LOGIN_AUDIT_HISTORY = 500;

const nowIso = () => new Date().toISOString();
const toSafeString = (value, max = 256) => String(value ?? '').trim().slice(0, max);
const toSafeBoolean = (value) => (typeof value === 'boolean' ? value : undefined);

const loginStatusForEvent = (event, status) => {
  const requestedStatus = toSafeString(status, 32).toLowerCase();
  if (['success', 'failed', 'blocked'].includes(requestedStatus)) return requestedStatus;
  const normalizedEvent = toSafeString(event, 64).toLowerCase();
  if (normalizedEvent === 'success') return 'success';
  if (normalizedEvent === 'rate_limited') return 'blocked';
  return 'failed';
};

const detectDeviceType = (userAgentValue) => {
  const ua = String(userAgentValue || '').toLowerCase();
  if (!ua) return 'unknown';
  if (/(ipad|tablet|playbook|kindle)/.test(ua)) return 'tablet';
  if (/(mobi|iphone|ipod|android)/.test(ua)) return 'mobile';
  return 'desktop';
};

const shortUserAgent = (userAgentValue) => {
  const raw = String(userAgentValue || '').trim();
  if (!raw) return '';
  if (/iphone/i.test(raw)) return 'iPhone';
  if (/ipad/i.test(raw)) return 'iPad';
  if (/android/i.test(raw)) return 'Android';
  if (/windows/i.test(raw)) return 'Windows';
  if (/mac os|macintosh/i.test(raw)) return 'macOS';
  if (/linux/i.test(raw)) return 'Linux';
  return raw.slice(0, 80);
};

const timestampMs = (value) => {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

export const normalizeLoginAuditEntry = (entry) => {
  const input = entry && typeof entry === 'object' ? entry : {};
  const requestId = toSafeString(input.requestId || input.id, 96);
  const id = toSafeString(input.id || requestId || randomUUID(), 128) || randomUUID();
  const createdAt = toSafeString(input.createdAt || nowIso(), 64) || nowIso();
  const event = toSafeString(input.event, 80) || 'login';
  const userAgent = toSafeString(input.userAgent, 260);
  const normalizedClientId = normalizeClientId(input.clientId);

  return {
    id,
    requestId: requestId || id,
    createdAt,
    event,
    status: loginStatusForEvent(event, input.status),
    clientId: normalizedClientId || toSafeString(input.clientId, 120),
    username: toSafeString(input.username, 120),
    reason: toSafeString(input.reason || event, 120),
    ipAddress: toSafeString(input.ipAddress || input.ip, 120),
    userAgent,
    deviceType: detectDeviceType(userAgent),
    deviceLabel: shortUserAgent(userAgent),
    clientExists: toSafeBoolean(input.clientExists),
    userExists: toSafeBoolean(input.userExists),
    role: toSafeString(input.role, 80),
    isSuperAdmin: toSafeBoolean(input.isSuperAdmin),
  };
};

export const normalizeLoginAuditHistory = (value) => {
  const source = Array.isArray(value) ? value : [];
  const unique = new Set();
  const normalized = [];

  source
    .map((item) => normalizeLoginAuditEntry(item))
    .sort((a, b) => timestampMs(b.createdAt) - timestampMs(a.createdAt))
    .forEach((item) => {
      const key = item.requestId || item.id;
      if (!key || unique.has(key)) return;
      unique.add(key);
      normalized.push(item);
    });

  return normalized.slice(0, MAX_LOGIN_AUDIT_HISTORY);
};

export const parseStoredLoginAuditHistory = (rawValue) => {
  if (!rawValue) return [];
  try {
    return normalizeLoginAuditHistory(JSON.parse(String(rawValue)));
  } catch {
    return [];
  }
};

export const serializeLoginAuditHistory = (entries) => JSON.stringify(normalizeLoginAuditHistory(entries));

export const loadLoginAuditHistory = (limit = 200) => {
  const safeLimit = Math.max(1, Math.min(MAX_LOGIN_AUDIT_HISTORY, Number.parseInt(String(limit ?? ''), 10) || 200));
  const row = db.prepare('SELECT value FROM system_settings WHERE key = ?').get(LOGIN_AUDIT_HISTORY_KEY);
  return parseStoredLoginAuditHistory(row?.value || '').slice(0, safeLimit);
};

export const appendLoginAuditEntry = (entry) => {
  const normalized = normalizeLoginAuditEntry(entry);
  const existing = loadLoginAuditHistory(MAX_LOGIN_AUDIT_HISTORY);
  const next = [
    normalized,
    ...existing.filter((item) => (
      item.id !== normalized.id
      && item.requestId !== normalized.requestId
    )),
  ].slice(0, MAX_LOGIN_AUDIT_HISTORY);
  const now = nowIso();

  db.prepare(`
    INSERT INTO system_settings (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
  `).run(LOGIN_AUDIT_HISTORY_KEY, serializeLoginAuditHistory(next), now);

  return normalized;
};
