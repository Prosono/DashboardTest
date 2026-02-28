const parseBoundedPositiveInt = (value, fallback, min, max) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
};

const WINDOW_MS = parseBoundedPositiveInt(
  process.env.AUTH_LOGIN_WINDOW_MS,
  10 * 60 * 1000,
  10_000,
  24 * 60 * 60 * 1000,
);
const BLOCK_MS = parseBoundedPositiveInt(
  process.env.AUTH_LOGIN_BLOCK_MS,
  15 * 60 * 1000,
  10_000,
  24 * 60 * 60 * 1000,
);
const MAX_ATTEMPTS_PER_USER = parseBoundedPositiveInt(
  process.env.AUTH_LOGIN_MAX_ATTEMPTS,
  8,
  1,
  100,
);
const MAX_ATTEMPTS_PER_IP = parseBoundedPositiveInt(
  process.env.AUTH_LOGIN_IP_MAX_ATTEMPTS,
  30,
  1,
  500,
);
const MAX_TRACKED_KEYS = parseBoundedPositiveInt(
  process.env.AUTH_LOGIN_RATE_LIMIT_MAX_KEYS,
  20_000,
  1_000,
  200_000,
);
const CLEANUP_INTERVAL_MS = 60_000;

const attemptsByKey = new Map();
let lastCleanupAt = 0;

const normalizeSegment = (value, max = 128) => String(value || '')
  .trim()
  .toLowerCase()
  .slice(0, max);

const getRateLimitIp = (req) => {
  const value = String(req?.ip || req?.socket?.remoteAddress || '').trim();
  const normalized = value.replace(/^::ffff:/i, '');
  return normalized || 'unknown';
};

const toKeyBundle = (req, clientId, username) => {
  const ip = getRateLimitIp(req);
  const client = normalizeSegment(clientId, 64) || 'default';
  const user = normalizeSegment(username, 128) || 'unknown';
  return {
    ipKey: `ip:${ip}`,
    userKey: `user:${ip}:${client}:${user}`,
  };
};

const trimOldestEntries = () => {
  if (attemptsByKey.size <= MAX_TRACKED_KEYS) return;

  const overflow = attemptsByKey.size - MAX_TRACKED_KEYS;
  const sorted = Array.from(attemptsByKey.entries())
    .sort((a, b) => (a[1]?.lastFailureAt || 0) - (b[1]?.lastFailureAt || 0));

  for (let i = 0; i < overflow; i += 1) {
    const key = sorted[i]?.[0];
    if (key) attemptsByKey.delete(key);
  }
};

const cleanup = (nowMs) => {
  if ((nowMs - lastCleanupAt) < CLEANUP_INTERVAL_MS && attemptsByKey.size <= MAX_TRACKED_KEYS) return;
  lastCleanupAt = nowMs;

  const staleAfterMs = Math.max(WINDOW_MS, BLOCK_MS) * 2;
  for (const [key, entry] of attemptsByKey.entries()) {
    const blockedUntil = Number(entry?.blockedUntil || 0);
    const lastFailureAt = Number(entry?.lastFailureAt || 0);
    const isBlocked = blockedUntil > nowMs;
    const isStale = (nowMs - lastFailureAt) > staleAfterMs;
    if (!isBlocked && isStale) {
      attemptsByKey.delete(key);
    }
  }

  trimOldestEntries();
};

const readBlockedUntil = (key, nowMs) => {
  const entry = attemptsByKey.get(key);
  if (!entry) return 0;
  const blockedUntil = Number(entry.blockedUntil || 0);
  return blockedUntil > nowMs ? blockedUntil : 0;
};

const buildStatus = (blockedUntil, nowMs) => {
  if (blockedUntil <= nowMs) {
    return {
      blocked: false,
      retryAfterMs: 0,
      retryAfterSeconds: 0,
    };
  }
  const retryAfterMs = blockedUntil - nowMs;
  return {
    blocked: true,
    retryAfterMs,
    retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
  };
};

const registerFailure = (key, maxAttempts, nowMs) => {
  const current = attemptsByKey.get(key);
  let next;

  if (!current || (nowMs - Number(current.firstFailureAt || 0)) > WINDOW_MS) {
    next = {
      firstFailureAt: nowMs,
      lastFailureAt: nowMs,
      failures: 1,
      blockedUntil: 0,
    };
  } else {
    next = {
      firstFailureAt: Number(current.firstFailureAt || nowMs),
      lastFailureAt: nowMs,
      failures: Number(current.failures || 0) + 1,
      blockedUntil: Number(current.blockedUntil || 0),
    };
  }

  if (next.failures >= maxAttempts) {
    next.blockedUntil = nowMs + BLOCK_MS;
    next.firstFailureAt = nowMs;
    next.failures = 0;
  }

  attemptsByKey.set(key, next);
  return Number(next.blockedUntil || 0);
};

export const getLoginThrottleStatus = (req, clientId, username) => {
  const nowMs = Date.now();
  cleanup(nowMs);

  const keys = toKeyBundle(req, clientId, username);
  const blockedUntil = Math.max(
    readBlockedUntil(keys.ipKey, nowMs),
    readBlockedUntil(keys.userKey, nowMs),
  );
  return buildStatus(blockedUntil, nowMs);
};

export const recordFailedLoginAttempt = (req, clientId, username) => {
  const nowMs = Date.now();
  cleanup(nowMs);

  const keys = toKeyBundle(req, clientId, username);
  const userBlockedUntil = registerFailure(keys.userKey, MAX_ATTEMPTS_PER_USER, nowMs);
  const ipBlockedUntil = registerFailure(keys.ipKey, MAX_ATTEMPTS_PER_IP, nowMs);
  return buildStatus(Math.max(userBlockedUntil, ipBlockedUntil), nowMs);
};

export const clearLoginAttempts = (req, clientId, username) => {
  const keys = toKeyBundle(req, clientId, username);
  attemptsByKey.delete(keys.userKey);
  attemptsByKey.delete(keys.ipKey);
};

