import db from './db.js';

export const RAW_LOG_KEY = 'platform_raw_log_v1';
export const MAX_RAW_LOG_LINES = 2000;

const REDACTED_KEYS = [
  'authorization',
  'auth',
  'cookie',
  'password',
  'pin',
  'secret',
  'session',
  'token',
];

const nowIso = () => new Date().toISOString();
const toSafeString = (value, max = 1600) => String(value ?? '').trim().slice(0, max);

const shouldRedactKey = (key) => {
  const normalized = String(key || '').trim().toLowerCase();
  return Boolean(normalized) && REDACTED_KEYS.some((candidate) => normalized.includes(candidate));
};

const sanitizeValue = (value, depth = 0) => {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string') return toSafeString(value, depth > 1 ? 320 : 800);
  if (depth >= 2) return toSafeString(value, 320);
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((entry) => sanitizeValue(entry, depth + 1));
  }
  if (value && typeof value === 'object') {
    const output = {};
    Object.entries(value).slice(0, 40).forEach(([key, entryValue]) => {
      output[toSafeString(key, 80)] = shouldRedactKey(key)
        ? '[redacted]'
        : sanitizeValue(entryValue, depth + 1);
    });
    Object.keys(output).forEach((key) => {
      if (output[key] === undefined || output[key] === '') delete output[key];
    });
    return output;
  }
  return toSafeString(value, 320);
};

const normalizeRawLogLine = (value) => {
  const line = toSafeString(value, 1800).replace(/[\r\n]+/g, ' ');
  return line || '';
};

export const parseStoredRawLogLines = (rawValue) => {
  if (!rawValue) return [];
  try {
    const parsed = JSON.parse(String(rawValue));
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeRawLogLine)
      .filter(Boolean)
      .slice(-MAX_RAW_LOG_LINES);
  } catch {
    return String(rawValue)
      .split('\n')
      .map(normalizeRawLogLine)
      .filter(Boolean)
      .slice(-MAX_RAW_LOG_LINES);
  }
};

export const serializeRawLogLines = (lines) => JSON.stringify(
  (Array.isArray(lines) ? lines : [])
    .map(normalizeRawLogLine)
    .filter(Boolean)
    .slice(-MAX_RAW_LOG_LINES),
);

export const loadRawLogLines = (limit = MAX_RAW_LOG_LINES) => {
  const safeLimit = Math.max(1, Math.min(MAX_RAW_LOG_LINES, Number.parseInt(String(limit ?? ''), 10) || MAX_RAW_LOG_LINES));
  const row = db.prepare('SELECT value FROM system_settings WHERE key = ?').get(RAW_LOG_KEY);
  return parseStoredRawLogLines(row?.value || '').slice(-safeLimit);
};

export const appendRawLogEntry = ({ level = 'info', event = 'event', details = {} } = {}) => {
  const entry = {
    ts: nowIso(),
    level: toSafeString(level, 16).toLowerCase() || 'info',
    event: toSafeString(event, 120) || 'event',
    details: sanitizeValue(details) || {},
  };
  const line = normalizeRawLogLine(JSON.stringify(entry));
  if (!line) return '';

  const existing = loadRawLogLines(MAX_RAW_LOG_LINES);
  const next = [...existing, line].slice(-MAX_RAW_LOG_LINES);
  const now = nowIso();

  db.prepare(`
    INSERT INTO system_settings (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
  `).run(RAW_LOG_KEY, serializeRawLogLines(next), now);

  return line;
};

export const getRawLogText = () => {
  const lines = loadRawLogLines(MAX_RAW_LOG_LINES);
  return `${lines.join('\n')}${lines.length ? '\n' : ''}`;
};
