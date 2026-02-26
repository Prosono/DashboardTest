import { normalizeClientId } from './db.js';

export const MAX_APP_ACTION_HISTORY = 500;

const nowIso = () => new Date().toISOString();

const toSafeString = (value, max = 256) => String(value ?? '').trim().slice(0, max);

const toSafeNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toSafePrimitive = (value, max = 160) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  return toSafeString(value, max);
};

const REDACTED_KEYS = ['token', 'password', 'secret', 'pin', 'code', 'auth', 'apikey', 'api_key'];

const shouldRedactKey = (key) => {
  const normalized = String(key || '').trim().toLowerCase();
  if (!normalized) return false;
  return REDACTED_KEYS.some((candidate) => normalized.includes(candidate));
};

const sanitizeValue = (value, depth = 0) => {
  if (depth >= 2) return toSafePrimitive(value, 120);
  if (Array.isArray(value)) {
    return value.slice(0, 16).map((entry) => sanitizeValue(entry, depth + 1));
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value).slice(0, 24);
    const output = {};
    entries.forEach(([key, entryValue]) => {
      if (shouldRedactKey(key)) {
        output[key] = '[redacted]';
        return;
      }
      output[key] = sanitizeValue(entryValue, depth + 1);
    });
    return output;
  }
  return toSafePrimitive(value);
};

const normalizeActor = (value) => {
  const input = value && typeof value === 'object' ? value : {};
  return {
    id: toSafeString(input.id, 128),
    username: toSafeString(input.username, 128),
    role: toSafeString(input.role, 64),
  };
};

export const normalizeAppActionEntry = (entry) => {
  const input = entry && typeof entry === 'object' ? entry : {};
  return {
    id: toSafeString(input.id, 128),
    createdAt: toSafeString(input.createdAt || nowIso(), 64) || nowIso(),
    actor: normalizeActor(input.actor),
    domain: toSafeString(input.domain, 80),
    service: toSafeString(input.service, 80),
    entityId: toSafeString(input.entityId, 200),
    entityName: toSafeString(input.entityName, 240),
    connectionId: toSafeString(input.connectionId, 128),
    source: toSafeString(input.source || 'app_token', 64) || 'app_token',
    summary: toSafeString(input.summary, 320),
    value: toSafeNumber(input.value),
    serviceData: sanitizeValue(input.serviceData),
    target: sanitizeValue(input.target),
  };
};

export const normalizeAppActionHistory = (value) => {
  const source = Array.isArray(value) ? value : [];
  const unique = new Set();
  const normalized = [];

  for (const item of source) {
    const next = normalizeAppActionEntry(item);
    if (!next.id || unique.has(next.id)) continue;
    unique.add(next.id);
    normalized.push(next);
    if (normalized.length >= MAX_APP_ACTION_HISTORY) break;
  }

  return normalized;
};

export const parseStoredAppActionHistory = (rawValue) => {
  if (!rawValue) return [];
  try {
    const parsed = JSON.parse(String(rawValue));
    return normalizeAppActionHistory(parsed);
  } catch {
    return [];
  }
};

export const serializeAppActionHistory = (entries) => JSON.stringify(normalizeAppActionHistory(entries));

export const getAppActionHistoryKey = (clientId) => {
  const normalized = normalizeClientId(clientId);
  return `app_action_history::${normalized || 'default'}`;
};

const timestampMs = (value) => {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

const getEntrySignature = (entry) => {
  const actorId = toSafeString(entry?.actor?.id, 128);
  const actorUsername = toSafeString(entry?.actor?.username, 128);
  const domain = toSafeString(entry?.domain, 80).toLowerCase();
  const service = toSafeString(entry?.service, 80).toLowerCase();
  const entityId = toSafeString(entry?.entityId, 200).toLowerCase();
  const summary = toSafeString(entry?.summary, 320).toLowerCase();
  return `${actorId}|${actorUsername}|${domain}|${service}|${entityId}|${summary}`;
};

export const shouldDedupeAppActionEntry = (entry, candidate, dedupeWindowMs = 1200) => {
  if (!entry || !candidate) return false;
  const entrySignature = getEntrySignature(entry);
  const candidateSignature = getEntrySignature(candidate);
  if (!entrySignature || !candidateSignature || entrySignature !== candidateSignature) return false;
  const delta = Math.abs(timestampMs(entry.createdAt) - timestampMs(candidate.createdAt));
  return delta <= Math.max(0, Number(dedupeWindowMs) || 0);
};
