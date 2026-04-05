import { normalizeClientId } from './db.js';
import { toE164Phone } from './twilioSms.js';

export const DEFAULT_NOTIFICATION_CONFIG = {
  enabled: true,
  appActionAuditEnabled: true,
  warningSensorEntityId: 'sensor.system_warning_details',
  criticalSensorEntityId: 'sensor.system_critical_details',
  inAppDurationMs: 7000,
  inAppPersistent: false,
  browserOnlyWhenBackground: true,
  warning: {
    inApp: true,
    browser: true,
    native: true,
    sms: false,
    smsTargets: {
      groups: ['admin'],
      userIds: [],
    },
    cooldownSeconds: 60,
  },
  critical: {
    inApp: true,
    browser: true,
    native: true,
    sms: false,
    smsTargets: {
      groups: ['admin'],
      userIds: [],
    },
    cooldownSeconds: 0,
  },
  remoteInstanceHealth: {
    enabled: false,
    intervalMinutes: 60,
    timeoutSeconds: 12,
    cooldownMinutes: 60,
    smsCountryCode: '+47',
    smsNumbers: [],
  },
  rules: [],
};

const MAX_RULES = 60;
const MAX_TARGET_USERS = 100;
const MAX_DIRECT_SMS_NUMBERS = 20;
const CONDITION_TYPES = new Set(['greater_than', 'less_than', 'equals', 'is_active']);
const LEVEL_TYPES = new Set(['info', 'warning', 'critical', 'success', 'error']);
const ROLE_TARGETS = new Set(['admin', 'user', 'inspector']);

const toBool = (value, fallback) => {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'ja', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'nei', 'off'].includes(normalized)) return false;
  return fallback;
};

const clampInt = (value, fallback, min, max) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
};

const normalizeEntityId = (value, fallback) => {
  const normalized = String(value || '').trim();
  return normalized || fallback;
};

const normalizePhoneCountryCode = (value, fallback = '+47') => {
  const raw = String(value || fallback || '+47').trim().replace(/[^\d+]/g, '');
  if (!raw) return '+47';
  return raw.startsWith('+') ? raw : `+${raw}`;
};

const normalizeDirectSmsNumbers = (value, countryCode) => {
  const source = Array.isArray(value)
    ? value
    : String(value || '').split(/[\n,;]+/g);
  const seen = new Set();
  const normalized = [];

  source.forEach((entry) => {
    if (normalized.length >= MAX_DIRECT_SMS_NUMBERS) return;
    const phone = toE164Phone(countryCode, String(entry || '').trim());
    if (!phone || seen.has(phone)) return;
    seen.add(phone);
    normalized.push(phone);
  });

  return normalized;
};

const normalizeSmsTargets = (value, fallback = { groups: ['admin'], userIds: [] }) => {
  const input = value && typeof value === 'object' ? value : {};
  const fallbackGroups = Array.isArray(fallback?.groups) ? fallback.groups : ['admin'];
  const fallbackUserIds = Array.isArray(fallback?.userIds) ? fallback.userIds : [];

  const groups = Array.from(new Set(
    (Array.isArray(input.groups) ? input.groups : fallbackGroups)
      .map((entry) => String(entry || '').trim().toLowerCase())
      .filter((entry) => ROLE_TARGETS.has(entry)),
  ));

  const userIds = Array.from(new Set(
    (Array.isArray(input.userIds) ? input.userIds : fallbackUserIds)
      .map((entry) => String(entry || '').trim())
      .filter(Boolean),
  )).slice(0, MAX_TARGET_USERS);

  if (groups.length === 0 && userIds.length === 0) {
    return { groups: ['admin'], userIds: [] };
  }
  return { groups, userIds };
};

const normalizeLevelConfig = (value, fallback) => {
  const input = value && typeof value === 'object' ? value : {};
  return {
    inApp: toBool(input.inApp, fallback.inApp),
    browser: toBool(input.browser, fallback.browser),
    native: toBool(input.native, fallback.native),
    sms: toBool(input.sms, fallback.sms),
    smsTargets: normalizeSmsTargets(input.smsTargets, fallback.smsTargets),
    cooldownSeconds: clampInt(input.cooldownSeconds, fallback.cooldownSeconds, 0, 86400),
  };
};

const normalizeRemoteInstanceHealthConfig = (value, fallback = DEFAULT_NOTIFICATION_CONFIG.remoteInstanceHealth) => {
  const input = value && typeof value === 'object' ? value : {};
  const smsCountryCode = normalizePhoneCountryCode(input.smsCountryCode, fallback.smsCountryCode);
  return {
    enabled: toBool(input.enabled, fallback.enabled),
    intervalMinutes: clampInt(input.intervalMinutes, fallback.intervalMinutes, 5, 1440),
    timeoutSeconds: clampInt(input.timeoutSeconds, fallback.timeoutSeconds, 3, 60),
    cooldownMinutes: clampInt(input.cooldownMinutes, fallback.cooldownMinutes, 0, 10080),
    smsCountryCode,
    smsNumbers: normalizeDirectSmsNumbers(input.smsNumbers, smsCountryCode),
  };
};

const normalizeRuleChannels = (value) => {
  const input = value && typeof value === 'object' ? value : {};
  return {
    inApp: toBool(input.inApp, true),
    browser: toBool(input.browser, true),
    native: toBool(input.native, true),
    sms: toBool(input.sms, false),
  };
};

const normalizeRule = (value, index) => {
  const input = value && typeof value === 'object' ? value : {};
  const id = String(input.id || '').trim() || `rule_${index + 1}`;
  const conditionTypeRaw = String(input.conditionType || '').trim().toLowerCase();
  const conditionType = CONDITION_TYPES.has(conditionTypeRaw) ? conditionTypeRaw : 'is_active';
  const levelRaw = String(input.level || '').trim().toLowerCase();
  const level = LEVEL_TYPES.has(levelRaw) ? levelRaw : 'warning';
  return {
    id,
    enabled: toBool(input.enabled, true),
    entityId: String(input.entityId || '').trim(),
    conditionType,
    compareValue: String(input.compareValue ?? '').trim(),
    title: String(input.title || '').trim(),
    message: String(input.message || '').trim(),
    level,
    channels: normalizeRuleChannels(input.channels),
    smsTargets: normalizeSmsTargets(input.smsTargets, { groups: ['admin'], userIds: [] }),
    cooldownSeconds: clampInt(input.cooldownSeconds, 300, 0, 86400),
  };
};

const normalizeRules = (value) => {
  const source = Array.isArray(value) ? value : [];
  const unique = new Set();
  const normalized = [];
  for (let i = 0; i < source.length && normalized.length < MAX_RULES; i += 1) {
    const rule = normalizeRule(source[i], i);
    if (!rule.id || unique.has(rule.id)) continue;
    unique.add(rule.id);
    normalized.push(rule);
  }
  return normalized;
};

export const normalizeNotificationConfig = (value) => {
  const input = value && typeof value === 'object' ? value : {};
  return {
    enabled: toBool(input.enabled, DEFAULT_NOTIFICATION_CONFIG.enabled),
    // App action auditing is always enabled for traceability.
    appActionAuditEnabled: true,
    warningSensorEntityId: normalizeEntityId(input.warningSensorEntityId, DEFAULT_NOTIFICATION_CONFIG.warningSensorEntityId),
    criticalSensorEntityId: normalizeEntityId(input.criticalSensorEntityId, DEFAULT_NOTIFICATION_CONFIG.criticalSensorEntityId),
    inAppDurationMs: clampInt(input.inAppDurationMs, DEFAULT_NOTIFICATION_CONFIG.inAppDurationMs, 1000, 120000),
    inAppPersistent: toBool(input.inAppPersistent, DEFAULT_NOTIFICATION_CONFIG.inAppPersistent),
    browserOnlyWhenBackground: toBool(
      input.browserOnlyWhenBackground,
      DEFAULT_NOTIFICATION_CONFIG.browserOnlyWhenBackground,
    ),
    warning: normalizeLevelConfig(input.warning, DEFAULT_NOTIFICATION_CONFIG.warning),
    critical: normalizeLevelConfig(input.critical, DEFAULT_NOTIFICATION_CONFIG.critical),
    remoteInstanceHealth: normalizeRemoteInstanceHealthConfig(
      input.remoteInstanceHealth,
      DEFAULT_NOTIFICATION_CONFIG.remoteInstanceHealth,
    ),
    rules: normalizeRules(input.rules),
  };
};

export const parseStoredNotificationConfig = (rawValue) => {
  if (!rawValue) return {};
  try {
    const parsed = JSON.parse(String(rawValue));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

export const getNotificationConfigKey = (clientId) => {
  const normalized = normalizeClientId(clientId);
  return `notification_config::${normalized || 'default'}`;
};
