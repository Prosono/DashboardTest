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
  rules: [],
};

const MAX_RULES = 60;
const MAX_RULE_CONDITIONS = 8;
const CONDITION_TYPES = new Set(['greater_than', 'less_than', 'equals', 'is_active']);
const CONDITION_OPERATORS = new Set(['and', 'or']);
const LEVEL_TYPES = new Set(['info', 'warning', 'critical', 'success', 'error']);

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

const normalizeRuleChannels = (value) => {
  const input = value && typeof value === 'object' ? value : {};
  return {
    inApp: toBool(input.inApp, true),
    browser: toBool(input.browser, true),
    native: toBool(input.native, true),
  };
};

const normalizeRuleCondition = (value, fallback = null) => {
  const input = value && typeof value === 'object' ? value : {};
  const conditionTypeRaw = String(input.conditionType || '').trim().toLowerCase();
  const conditionType = CONDITION_TYPES.has(conditionTypeRaw)
    ? conditionTypeRaw
    : String(fallback?.conditionType || 'is_active');
  return {
    entityId: String(input.entityId ?? fallback?.entityId ?? '').trim(),
    conditionType,
    compareValue: String(input.compareValue ?? fallback?.compareValue ?? '').trim(),
  };
};

const normalizeRule = (value, index) => {
  const input = value && typeof value === 'object' ? value : {};
  const id = String(input.id || '').trim() || `rule_${index + 1}`;
  const conditionTypeRaw = String(input.conditionType || '').trim().toLowerCase();
  const conditionType = CONDITION_TYPES.has(conditionTypeRaw) ? conditionTypeRaw : 'is_active';
  const conditionOperatorRaw = String(input.conditionOperator || '').trim().toLowerCase();
  const conditionOperator = CONDITION_OPERATORS.has(conditionOperatorRaw) ? conditionOperatorRaw : 'and';
  const levelRaw = String(input.level || '').trim().toLowerCase();
  const level = LEVEL_TYPES.has(levelRaw) ? levelRaw : 'warning';
  const sourceConditions = Array.isArray(input.conditions) ? input.conditions : [];
  const conditions = [];
  for (let i = 0; i < sourceConditions.length && conditions.length < MAX_RULE_CONDITIONS; i += 1) {
    conditions.push(normalizeRuleCondition(sourceConditions[i], {
      entityId: input.entityId,
      conditionType,
      compareValue: input.compareValue,
    }));
  }
  if (conditions.length === 0) {
    conditions.push(normalizeRuleCondition(input, {
      entityId: input.entityId,
      conditionType,
      compareValue: input.compareValue,
    }));
  }
  const primaryCondition = conditions[0] || { conditionType: 'is_active', compareValue: '' };
  return {
    id,
    enabled: toBool(input.enabled, true),
    entityId: String(input.entityId || '').trim(),
    conditionType: primaryCondition.conditionType,
    compareValue: primaryCondition.compareValue,
    conditionOperator,
    conditions,
    title: String(input.title || '').trim(),
    message: String(input.message || '').trim(),
    level,
    channels: normalizeRuleChannels(input.channels),
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
    rules: normalizeRules(input.rules),
    updatedAt: input.updatedAt || null,
  };
};
