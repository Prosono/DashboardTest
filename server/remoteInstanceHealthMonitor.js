import db from './db.js';
import { parseHaConfigRow } from './haConfig.js';
import {
  getNotificationConfigKey,
  normalizeNotificationConfig,
  parseStoredNotificationConfig,
} from './notificationConfig.js';
import { PLATFORM_ADMIN_CLIENT_ID, SUPER_ADMIN_CLIENT_ID, isPlatformAdminClientId } from './platformAdmin.js';
import {
  isTwilioConfigUsable,
  loadTwilioConfig,
  sendTwilioSms,
} from './twilioSms.js';

const MONITOR_STATE_KEY = `remote_instance_health_state::${SUPER_ADMIN_CLIENT_ID}`;
const MONITOR_TICK_MS = 60 * 1000;
const DEFAULT_FETCH_HEADERS = {
  Accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
  'User-Agent': 'DashboardTestRemoteMonitor/1.0',
};
const IPV4_RE = /^(?:\d{1,3}\.){3}\d{1,3}$/;

let schedulerStarted = false;
let schedulerTimer = null;
let activeRunPromise = null;

const nowIso = () => new Date().toISOString();

const safeUrlHost = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const parsed = new globalThis.URL(raw);
    return String(parsed.hostname || parsed.host || '').trim().toLowerCase();
  } catch {
    return '';
  }
};

const isPrivateIpv4 = (host) => {
  if (!IPV4_RE.test(host)) return false;
  const octets = host.split('.').map((part) => Number.parseInt(part, 10));
  if (octets.some((part) => !Number.isFinite(part) || part < 0 || part > 255)) return false;
  const [a, b] = octets;
  return a === 10
    || a === 127
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168);
};

const isLikelyLocalHost = (host) => {
  const normalized = String(host || '').trim().toLowerCase();
  if (!normalized) return true;
  if (normalized === 'localhost' || normalized.endsWith('.local') || normalized.endsWith('.lan')) return true;
  if (normalized === '::1' || normalized.startsWith('fe80:') || normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
  if (isPrivateIpv4(normalized)) return true;
  if (!normalized.includes('.') && !normalized.includes(':') && !IPV4_RE.test(normalized)) return true;
  return false;
};

const isRemoteReachabilityUrl = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return false;
  try {
    const parsed = new globalThis.URL(raw);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    return !isLikelyLocalHost(parsed.hostname || parsed.host || '');
  } catch {
    return false;
  }
};

const summarizeFailure = (failure) => ({
  clientId: String(failure?.clientId || '').trim(),
  clientName: String(failure?.clientName || '').trim(),
  connectionId: String(failure?.connectionId || '').trim(),
  connectionName: String(failure?.connectionName || '').trim(),
  host: String(failure?.host || '').trim(),
  error: String(failure?.error || '').trim(),
});

const normalizeMonitorState = (value) => {
  const input = value && typeof value === 'object' ? value : {};
  return {
    lastRunAt: String(input.lastRunAt || '').trim() || null,
    lastOkAt: String(input.lastOkAt || '').trim() || null,
    lastFailureAt: String(input.lastFailureAt || '').trim() || null,
    lastAlertAt: String(input.lastAlertAt || '').trim() || null,
    lastAlertDigest: String(input.lastAlertDigest || '').trim(),
    monitoredInstanceCount: Math.max(0, Number.parseInt(String(input.monitoredInstanceCount || 0), 10) || 0),
    healthyInstanceCount: Math.max(0, Number.parseInt(String(input.healthyInstanceCount || 0), 10) || 0),
    failedInstanceCount: Math.max(0, Number.parseInt(String(input.failedInstanceCount || 0), 10) || 0),
    failures: Array.isArray(input.failures) ? input.failures.map(summarizeFailure).slice(0, 12) : [],
    lastAlertReason: String(input.lastAlertReason || '').trim(),
  };
};

const parseStoredMonitorState = (rawValue) => {
  if (!rawValue) return normalizeMonitorState({});
  try {
    const parsed = JSON.parse(String(rawValue));
    return normalizeMonitorState(parsed);
  } catch {
    return normalizeMonitorState({});
  }
};

const loadMonitorState = () => {
  const row = db.prepare('SELECT value FROM system_settings WHERE key = ?').get(MONITOR_STATE_KEY);
  return parseStoredMonitorState(row?.value || '');
};

const persistMonitorState = (state) => {
  const normalized = normalizeMonitorState(state);
  const updatedAt = nowIso();
  db.prepare(`
    INSERT INTO system_settings (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
  `).run(MONITOR_STATE_KEY, JSON.stringify(normalized), updatedAt);
  return normalized;
};

const loadRemoteInstanceHealthConfig = () => {
  const key = getNotificationConfigKey(SUPER_ADMIN_CLIENT_ID);
  const row = db.prepare('SELECT value FROM system_settings WHERE key = ?').get(key);
  const parsed = parseStoredNotificationConfig(row?.value || '');
  const normalized = normalizeNotificationConfig(parsed);
  return normalized.remoteInstanceHealth || normalizeNotificationConfig({}).remoteInstanceHealth;
};

const listRemoteInstances = () => {
  const clients = db.prepare(`
    SELECT id, name, updated_at
    FROM clients
    ORDER BY id ASC
  `).all();
  const haConfigRows = db.prepare('SELECT * FROM ha_config').all();
  const haConfigByClient = new Map(haConfigRows.map((row) => [row.client_id, row]));
  const result = [];

  clients.forEach((client) => {
    if (isPlatformAdminClientId(client.id)) return;
    const parsedConfig = parseHaConfigRow(haConfigByClient.get(client.id));
    const connections = Array.isArray(parsedConfig?.connections) ? parsedConfig.connections : [];
    connections.forEach((connection, index) => {
      const urls = Array.from(new Set(
        [connection?.url, connection?.fallbackUrl]
          .map((entry) => String(entry || '').trim())
          .filter(isRemoteReachabilityUrl),
      ));
      if (urls.length === 0) return;
      const primaryUrl = urls[0] || '';
      result.push({
        clientId: client.id,
        clientName: String(client.name || client.id || '').trim() || client.id,
        connectionId: String(connection?.id || (index === 0 ? 'primary' : `connection-${index + 1}`)).trim() || 'primary',
        connectionName: String(connection?.name || connection?.id || `Connection ${index + 1}`).trim() || `Connection ${index + 1}`,
        host: safeUrlHost(primaryUrl),
        urls,
        updatedAt: parsedConfig?.updatedAt || client.updated_at || null,
      });
    });
  });

  return result;
};

const probeReachability = async (url, timeoutMs) => {
  const controller = new globalThis.AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await globalThis.fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: DEFAULT_FETCH_HEADERS,
    });
    return {
      ok: response.status < 500,
      status: response.status,
      url,
      finalUrl: response.url || url,
      error: response.status >= 500 ? `HTTP ${response.status}` : '',
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      url,
      finalUrl: url,
      error: error?.name === 'AbortError'
        ? `Timeout after ${Math.round(timeoutMs / 1000)}s`
        : String(error?.message || 'Connection failed'),
    };
  } finally {
    globalThis.clearTimeout(timeout);
  }
};

const checkRemoteInstance = async (instance, timeoutMs) => {
  const urls = Array.isArray(instance?.urls) ? instance.urls : [];
  let lastFailure = { error: 'No remote URL configured', url: '' };
  for (const url of urls) {
    const result = await probeReachability(url, timeoutMs);
    if (result.ok) {
      return {
        ok: true,
        instance,
        host: safeUrlHost(result.finalUrl || result.url || urls[0] || ''),
        checkedUrl: result.finalUrl || result.url || urls[0] || '',
        status: result.status,
      };
    }
    lastFailure = result;
  }

  return {
    ok: false,
    instance,
    host: safeUrlHost(lastFailure.finalUrl || lastFailure.url || urls[0] || ''),
    checkedUrl: lastFailure.finalUrl || lastFailure.url || urls[0] || '',
    status: lastFailure.status || 0,
    error: String(lastFailure.error || 'Connection failed'),
  };
};

const buildFailureDigest = (failures) => (
  failures
    .map((failure) => `${failure.clientId}:${failure.connectionId}`)
    .sort((a, b) => a.localeCompare(b))
    .join('|')
);

const buildFailureSmsBody = (failures) => {
  const list = Array.isArray(failures) ? failures : [];
  if (list.length === 0) return 'Smarti monitor: alle remote instanser svarte OK.';
  const heading = list.length === 1
    ? 'Smarti alarm: 1 remote instans svarer ikke.'
    : `Smarti alarm: ${list.length} remote instanser svarer ikke.`;
  const details = list.slice(0, 6).map((failure) => {
    const label = `${failure.clientName} / ${failure.connectionName}`.trim();
    const host = failure.host ? ` (${failure.host})` : '';
    return `${label}${host}`;
  });
  const suffix = list.length > 6 ? `+${list.length - 6} til` : '';
  return [heading, ...details, suffix].filter(Boolean).join('\n').slice(0, 1400);
};

const sendFailureSms = async (numbers, message) => {
  const recipients = Array.isArray(numbers)
    ? Array.from(new Set(numbers.map((entry) => String(entry || '').trim()).filter(Boolean)))
    : [];
  if (recipients.length === 0) {
    return {
      attempted: 0,
      sent: 0,
      failed: 0,
      reason: 'no_recipients',
    };
  }

  const { config } = loadTwilioConfig();
  if (!isTwilioConfigUsable(config)) {
    return {
      attempted: recipients.length,
      sent: 0,
      failed: 0,
      reason: 'twilio_not_configured',
    };
  }

  const results = await Promise.all(recipients.map(async (phone) => {
    try {
      await sendTwilioSms({
        accountSid: config.accountSid,
        authToken: config.authToken,
        fromNumber: config.fromNumber,
        to: phone,
        body: message,
      });
      return { ok: true, phone };
    } catch (error) {
      return {
        ok: false,
        phone,
        error: String(error?.message || 'SMS send failed'),
      };
    }
  }));

  return {
    attempted: recipients.length,
    sent: results.filter((entry) => entry.ok).length,
    failed: results.filter((entry) => !entry.ok).length,
    reason: results.some((entry) => !entry.ok) ? 'partial_failure' : '',
    errors: results.filter((entry) => !entry.ok).slice(0, 10),
  };
};

const shouldRunForSchedule = (config, state, nowMs) => {
  if (!config?.enabled) return false;
  const intervalMs = Math.max(5, Number(config.intervalMinutes || 60)) * 60 * 1000;
  const lastRunMs = Date.parse(String(state?.lastRunAt || ''));
  if (!Number.isFinite(lastRunMs) || lastRunMs <= 0) return true;
  return (nowMs - lastRunMs) >= intervalMs;
};

export const runRemoteInstanceHealthCheck = async ({ ignoreSchedule = false, trigger = 'manual' } = {}) => {
  if (activeRunPromise) return activeRunPromise;

  activeRunPromise = (async () => {
    const config = loadRemoteInstanceHealthConfig();
    const previousState = loadMonitorState();
    const nowMs = Date.now();
    const now = new Date(nowMs).toISOString();

    if (!ignoreSchedule && !shouldRunForSchedule(config, previousState, nowMs)) {
      return {
        ok: true,
        skipped: true,
        reason: 'not_due',
        state: previousState,
      };
    }

    if (!config?.enabled) {
      return {
        ok: true,
        skipped: true,
        reason: 'disabled',
        state: previousState,
      };
    }

    const timeoutMs = Math.max(3, Number(config.timeoutSeconds || 12)) * 1000;
    const instances = listRemoteInstances();
    const checks = await Promise.all(instances.map((instance) => checkRemoteInstance(instance, timeoutMs)));
    const healthy = checks.filter((entry) => entry.ok);
    const failures = checks
      .filter((entry) => !entry.ok)
      .map((entry) => summarizeFailure({
        clientId: entry.instance?.clientId,
        clientName: entry.instance?.clientName,
        connectionId: entry.instance?.connectionId,
        connectionName: entry.instance?.connectionName,
        host: entry.host || entry.instance?.host,
        error: entry.error,
      }));

    let alert = {
      attempted: 0,
      sent: 0,
      failed: 0,
      triggered: false,
      reason: '',
    };

    const nextState = normalizeMonitorState({
      ...previousState,
      lastRunAt: now,
      monitoredInstanceCount: checks.length,
      healthyInstanceCount: healthy.length,
      failedInstanceCount: failures.length,
      failures,
      lastAlertReason: '',
    });

    if (failures.length === 0) {
      nextState.lastOkAt = now;
      nextState.lastAlertDigest = '';
      persistMonitorState(nextState);
      return {
        ok: true,
        skipped: false,
        trigger,
        checkedAt: now,
        monitoredInstanceCount: checks.length,
        healthyInstanceCount: healthy.length,
        failedInstanceCount: 0,
        failures: [],
        alert,
        state: nextState,
      };
    }

    nextState.lastFailureAt = now;
    const digest = buildFailureDigest(failures);
    const cooldownMs = Math.max(0, Number(config.cooldownMinutes || 0)) * 60 * 1000;
    const lastAlertMs = Date.parse(String(previousState?.lastAlertAt || ''));
    const digestChanged = digest !== String(previousState?.lastAlertDigest || '');
    const cooldownExpired = !Number.isFinite(lastAlertMs) || cooldownMs === 0 || (nowMs - lastAlertMs) >= cooldownMs;
    const shouldAlert = digestChanged || cooldownExpired;

    if (shouldAlert) {
      alert = await sendFailureSms(config.smsNumbers, buildFailureSmsBody(failures));
      alert.triggered = true;
      if (alert.sent > 0) {
        nextState.lastAlertAt = now;
        nextState.lastAlertDigest = digest;
      }
      nextState.lastAlertReason = alert.reason || '';
    }

    persistMonitorState(nextState);

    return {
      ok: true,
      skipped: false,
      trigger,
      checkedAt: now,
      monitoredInstanceCount: checks.length,
      healthyInstanceCount: healthy.length,
      failedInstanceCount: failures.length,
      failures,
      alert,
      state: nextState,
    };
  })();

  try {
    return await activeRunPromise;
  } finally {
    activeRunPromise = null;
  }
};

const schedulerTick = async () => {
  try {
    await runRemoteInstanceHealthCheck({ ignoreSchedule: false, trigger: 'schedule' });
  } catch (error) {
    globalThis.console?.error('[remote-monitor] health check failed', error);
  }
};

export const startRemoteInstanceHealthMonitor = () => {
  if (schedulerStarted) return;
  schedulerStarted = true;
  void schedulerTick();
  schedulerTimer = globalThis.setInterval(() => {
    void schedulerTick();
  }, MONITOR_TICK_MS);
  globalThis.console?.log(
    `[remote-monitor] scheduler started for ${SUPER_ADMIN_CLIENT_ID} (platform client: ${PLATFORM_ADMIN_CLIENT_ID})`,
  );
};

export const stopRemoteInstanceHealthMonitor = () => {
  if (schedulerTimer) {
    globalThis.clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
  schedulerStarted = false;
};
