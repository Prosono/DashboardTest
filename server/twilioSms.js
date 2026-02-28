import db, { normalizeClientId } from './db.js';

export const TWILIO_SMS_CONFIG_KEY = 'twilio_sms_config';
export const SMS_DISPATCH_DEDUPE_KEY_PREFIX = 'notification_sms_last_sent::';

const toTrimmedString = (value, max = 512) => String(value || '').trim().slice(0, max);

export const stripRichTextToPlainText = (value) => String(value || '')
  .replace(/<br\s*\/?>/gi, '\n')
  .replace(/<\/(p|div)>/gi, '\n')
  .replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/&quot;/gi, '"')
  .replace(/&#39;/gi, "'");

const normalizeCountryCode = (value) => {
  const raw = toTrimmedString(value || '+47', 12);
  const digitsOnly = raw.replace(/[^\d+]/g, '');
  if (!digitsOnly) return '+47';
  const prefixed = digitsOnly.startsWith('+') ? digitsOnly : `+${digitsOnly}`;
  return prefixed.replace(/[^\d+]/g, '');
};

const normalizeLocalPhone = (value) => toTrimmedString(value, 64).replace(/[^\d+]/g, '');

export const toE164Phone = (countryCode, phone) => {
  const local = normalizeLocalPhone(phone);
  if (!local) return '';
  if (local.startsWith('+')) return local;
  const cc = normalizeCountryCode(countryCode);
  const strippedLocal = local.replace(/^0+/, '');
  return `${cc}${strippedLocal}`;
};

export const parseStoredTwilioConfig = (rawValue) => {
  if (!rawValue) return {};
  try {
    const parsed = JSON.parse(String(rawValue));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

export const normalizeTwilioConfig = (value, fallback = {}) => {
  const input = value && typeof value === 'object' ? value : {};
  return {
    accountSid: toTrimmedString(input.accountSid ?? fallback.accountSid, 128),
    authToken: toTrimmedString(input.authToken ?? fallback.authToken, 256),
    fromNumber: toTrimmedString(input.fromNumber ?? fallback.fromNumber, 32),
    updatedAt: toTrimmedString(input.updatedAt ?? fallback.updatedAt, 64) || null,
  };
};

export const isTwilioConfigUsable = (config) => {
  const normalized = normalizeTwilioConfig(config || {});
  return Boolean(normalized.accountSid && normalized.authToken && normalized.fromNumber);
};

export const toPublicTwilioConfig = (config) => {
  const normalized = normalizeTwilioConfig(config || {});
  return {
    accountSid: normalized.accountSid,
    fromNumber: normalized.fromNumber,
    hasAuthToken: Boolean(normalized.authToken),
    updatedAt: normalized.updatedAt || null,
  };
};

export const loadTwilioConfig = () => {
  const row = db.prepare('SELECT value, updated_at FROM system_settings WHERE key = ?').get(TWILIO_SMS_CONFIG_KEY);
  const parsed = parseStoredTwilioConfig(row?.value || '');
  const normalized = normalizeTwilioConfig(parsed, { updatedAt: row?.updated_at || null });
  return {
    row,
    config: normalized,
  };
};

export const persistTwilioConfig = (config) => {
  const now = new Date().toISOString();
  const normalized = normalizeTwilioConfig(config || {});
  const payload = JSON.stringify({
    accountSid: normalized.accountSid,
    authToken: normalized.authToken,
    fromNumber: normalized.fromNumber,
    updatedAt: now,
  });

  db.prepare(`
    INSERT INTO system_settings (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
  `).run(TWILIO_SMS_CONFIG_KEY, payload, now);

  return {
    config: {
      ...normalized,
      updatedAt: now,
    },
    updatedAt: now,
  };
};

export const getSmsDispatchDedupeStorageKey = (clientId, dedupeKey) => {
  const scope = normalizeClientId(clientId) || 'default';
  const safeDedupeKey = String(dedupeKey || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120) || 'default';
  return `${SMS_DISPATCH_DEDUPE_KEY_PREFIX}${scope}::${safeDedupeKey}`;
};

export const sendTwilioSms = async ({ accountSid, authToken, fromNumber, to, body }) => {
  const sid = toTrimmedString(accountSid, 128);
  const token = toTrimmedString(authToken, 256);
  const from = toTrimmedString(fromNumber, 32);
  const recipient = toTrimmedString(to, 32);
  const message = toTrimmedString(body, 1400);

  if (!sid || !token || !from || !recipient || !message) {
    throw new Error('Missing Twilio SMS parameters');
  }

  const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`;
  const auth = Buffer.from(`${sid}:${token}`).toString('base64');
  const form = new URLSearchParams({
    To: recipient,
    From: from,
    Body: message,
  });

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
    },
    body: form.toString(),
  });

  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const msg = String(payload?.message || text || `Twilio request failed (${response.status})`).trim();
    throw new Error(msg || `Twilio request failed (${response.status})`);
  }

  return payload && typeof payload === 'object' ? payload : {};
};
