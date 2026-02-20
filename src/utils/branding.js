const ABSOLUTE_URL_PATTERN = /^[a-zA-Z][a-zA-Z\d+\-.]*:/;
const LOGO_OVERRIDES_KEY = 'tunet_header_logo_overrides';
const normalizeThemeKey = (theme) => String(theme || '').trim().toLowerCase();

export const resolveLogoUrl = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';

  if (ABSOLUTE_URL_PATTERN.test(raw)) return raw;
  if (raw.startsWith('//')) {
    const protocol = typeof window !== 'undefined' ? window.location.protocol : 'https:';
    return `${protocol}${raw}`;
  }
  if (raw.startsWith('/')) return raw;
  if (/^www\./i.test(raw)) return `https://${raw}`;

  // Treat bare host/path inputs as HTTPS by default.
  if (/^[\w.-]+\.[a-z]{2,}([/:?#].*)?$/i.test(raw)) return `https://${raw}`;
  return raw;
};

export const getLogoForTheme = (settings = {}, theme = '') => {
  const source = settings && typeof settings === 'object' ? settings : {};
  const themeKey = normalizeThemeKey(theme);
  const fallback = String(source.logoUrl || '').trim();
  const light = String(source.logoUrlLight || '').trim();
  const dark = String(source.logoUrlDark || '').trim();

  if (themeKey === 'light') {
    if (light) return light;
    if (fallback) return fallback;
    if (dark) return dark;
    return '';
  }
  if (themeKey) {
    if (dark) return dark;
    if (fallback) return fallback;
    if (light) return light;
    return '';
  }
  return fallback || light || dark;
};

const parseJSON = (value) => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const toSafeObject = (value) => (value && typeof value === 'object' ? value : {});

const readStoredLogoOverrides = () => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LOGO_OVERRIDES_KEY);
    if (!raw) return null;
    const parsed = parseJSON(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
};

export const saveStoredLogoOverrides = ({ logoUrl = '', logoUrlLight = '', logoUrlDark = '', updatedAt = Date.now() } = {}) => {
  if (typeof window === 'undefined') return;
  const payload = {
    logoUrl: String(logoUrl || '').trim(),
    logoUrlLight: String(logoUrlLight || '').trim(),
    logoUrlDark: String(logoUrlDark || '').trim(),
    updatedAt: Number.isFinite(Number(updatedAt)) ? Number(updatedAt) : Date.now(),
  };
  try {
    localStorage.setItem(LOGO_OVERRIDES_KEY, JSON.stringify(payload));
  } catch {
    // best effort persistence only
  }
};

export const applyStoredLogoOverrides = (headerSettings = {}) => {
  const settings = toSafeObject(headerSettings);
  const overrides = readStoredLogoOverrides();
  if (!overrides || typeof overrides !== 'object') return settings;

  const next = { ...settings };
  if (Object.prototype.hasOwnProperty.call(overrides, 'logoUrl')) {
    next.logoUrl = String(overrides.logoUrl || '').trim();
  }
  if (Object.prototype.hasOwnProperty.call(overrides, 'logoUrlLight')) {
    next.logoUrlLight = String(overrides.logoUrlLight || '').trim();
  }
  if (Object.prototype.hasOwnProperty.call(overrides, 'logoUrlDark')) {
    next.logoUrlDark = String(overrides.logoUrlDark || '').trim();
  }
  if (Object.prototype.hasOwnProperty.call(overrides, 'updatedAt')) {
    const version = Number(overrides.updatedAt);
    if (Number.isFinite(version) && version > 0) next.logoUpdatedAt = version;
  }
  return next;
};

const withQueryParam = (url, key, value) => {
  const raw = String(url || '').trim();
  if (!raw || !String(value || '').trim()) return raw;
  const [base, hash = ''] = raw.split('#');
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}${encodeURIComponent(key)}=${encodeURIComponent(String(value))}${hash ? `#${hash}` : ''}`;
};

export const appendLogoVersion = (url, version) => {
  const stamp = Number(version);
  if (!Number.isFinite(stamp) || stamp <= 0) return String(url || '').trim();
  return withQueryParam(url, 'logo_v', Math.trunc(stamp));
};

const getVersionFromSettings = (settings) => {
  const candidate = Number(settings?.logoUpdatedAt);
  return Number.isFinite(candidate) && candidate > 0 ? Math.trunc(candidate) : 0;
};

export const getStoredHeaderLogoVersion = () => {
  if (typeof window === 'undefined') return 0;
  try {
    const overrides = readStoredLogoOverrides();
    const fromOverrides = getVersionFromSettings(overrides);
    if (fromOverrides > 0) return fromOverrides;

    const cachedRaw = localStorage.getItem('tunet_shared_dashboard_cache');
    const cached = cachedRaw ? parseJSON(cachedRaw) : null;
    const fromCache = getVersionFromSettings(cached?.headerSettings);
    if (fromCache > 0) return fromCache;

    const legacyRaw = localStorage.getItem('tunet_header_settings');
    const legacy = legacyRaw ? parseJSON(legacyRaw) : null;
    const fromLegacy = getVersionFromSettings(legacy);
    if (fromLegacy > 0) return fromLegacy;
  } catch {
    // best effort lookup only
  }
  return 0;
};

export const getStoredHeaderLogoUrl = (theme = '') => {
  if (typeof window === 'undefined') return '';

  try {
    const fromOverrides = getLogoForTheme(readStoredLogoOverrides(), theme);
    if (fromOverrides) return fromOverrides;

    const cachedRaw = localStorage.getItem('tunet_shared_dashboard_cache');
    const cached = cachedRaw ? parseJSON(cachedRaw) : null;
    const fromCache = getLogoForTheme(cached?.headerSettings, theme);
    if (fromCache) return fromCache;

    const legacyRaw = localStorage.getItem('tunet_header_settings');
    const legacy = legacyRaw ? parseJSON(legacyRaw) : null;
    const fromLegacy = getLogoForTheme(legacy, theme);
    if (fromLegacy) return fromLegacy;
  } catch {
    // best effort lookup only
  }

  return '';
};
