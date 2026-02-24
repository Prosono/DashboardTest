export const DEFAULT_NOTIFICATION_CONFIG = {
  enabled: true,
  warningSensorEntityId: 'sensor.system_warning_details',
  criticalSensorEntityId: 'sensor.system_critical_details',
  inAppDurationMs: 7000,
  inAppPersistent: false,
  browserOnlyWhenBackground: true,
  warning: {
    inApp: true,
    browser: true,
    native: true,
    cooldownSeconds: 60,
  },
  critical: {
    inApp: true,
    browser: true,
    native: true,
    cooldownSeconds: 0,
  },
};

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

const normalizeLevelConfig = (value, fallback) => {
  const input = value && typeof value === 'object' ? value : {};
  return {
    inApp: toBool(input.inApp, fallback.inApp),
    browser: toBool(input.browser, fallback.browser),
    native: toBool(input.native, fallback.native),
    cooldownSeconds: clampInt(input.cooldownSeconds, fallback.cooldownSeconds, 0, 86400),
  };
};

export const normalizeNotificationConfig = (value) => {
  const input = value && typeof value === 'object' ? value : {};
  return {
    enabled: toBool(input.enabled, DEFAULT_NOTIFICATION_CONFIG.enabled),
    warningSensorEntityId: String(input.warningSensorEntityId || '').trim() || DEFAULT_NOTIFICATION_CONFIG.warningSensorEntityId,
    criticalSensorEntityId: String(input.criticalSensorEntityId || '').trim() || DEFAULT_NOTIFICATION_CONFIG.criticalSensorEntityId,
    inAppDurationMs: clampInt(input.inAppDurationMs, DEFAULT_NOTIFICATION_CONFIG.inAppDurationMs, 1000, 120000),
    inAppPersistent: toBool(input.inAppPersistent, DEFAULT_NOTIFICATION_CONFIG.inAppPersistent),
    browserOnlyWhenBackground: toBool(
      input.browserOnlyWhenBackground,
      DEFAULT_NOTIFICATION_CONFIG.browserOnlyWhenBackground,
    ),
    warning: normalizeLevelConfig(input.warning, DEFAULT_NOTIFICATION_CONFIG.warning),
    critical: normalizeLevelConfig(input.critical, DEFAULT_NOTIFICATION_CONFIG.critical),
    updatedAt: input.updatedAt || null,
  };
};
