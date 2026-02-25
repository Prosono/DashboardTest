import { normalizeClientId } from './db.js';

export const MAX_NOTIFICATION_HISTORY = 200;

const nowIso = () => new Date().toISOString();

const normalizeHistoryMeta = (value) => {
  if (!value || typeof value !== 'object') return null;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return null;
  }
};

export const normalizeNotificationHistoryEntry = (entry) => ({
  id: String(entry?.id || '').trim(),
  title: String(entry?.title || 'Notification'),
  message: String(entry?.message || ''),
  level: String(entry?.level || 'info'),
  createdAt: String(entry?.createdAt || nowIso()),
  meta: normalizeHistoryMeta(entry?.meta),
});

export const normalizeNotificationHistory = (value) => {
  const source = Array.isArray(value) ? value : [];
  const unique = new Set();
  const normalized = [];

  for (const entry of source) {
    const next = normalizeNotificationHistoryEntry(entry);
    if (!next.id || unique.has(next.id)) continue;
    unique.add(next.id);
    normalized.push(next);
    if (normalized.length >= MAX_NOTIFICATION_HISTORY) break;
  }

  return normalized;
};

export const parseStoredNotificationHistory = (rawValue) => {
  if (!rawValue) return [];
  try {
    const parsed = JSON.parse(String(rawValue));
    return normalizeNotificationHistory(parsed);
  } catch {
    return [];
  }
};

export const serializeNotificationHistory = (entries) => {
  const normalized = normalizeNotificationHistory(entries);
  return JSON.stringify(normalized);
};

export const getNotificationHistoryKey = (clientId) => {
  const normalized = normalizeClientId(clientId);
  return `notification_history::${normalized || 'default'}`;
};

const timestampMs = (value) => {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

export const shouldDedupeHistoryEntry = (entry, candidate, dedupeWindowMs = 15000) => {
  if (!entry || !candidate) return false;
  const signatureEntry = `${String(entry.level || '').trim().toLowerCase()}|${String(entry.title || '').trim()}|${String(entry.message || '').trim()}`;
  const signatureCandidate = `${String(candidate.level || '').trim().toLowerCase()}|${String(candidate.title || '').trim()}|${String(candidate.message || '').trim()}`;
  if (signatureEntry !== signatureCandidate) return false;
  const delta = Math.abs(timestampMs(entry.createdAt) - timestampMs(candidate.createdAt));
  return delta <= Math.max(0, Number(dedupeWindowMs) || 0);
};
