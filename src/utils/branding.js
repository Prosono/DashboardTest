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

  if (themeKey === 'light') {
    const light = String(source.logoUrlLight || '').trim();
    if (light) return light;
  } else if (themeKey) {
    const dark = String(source.logoUrlDark || '').trim();
    if (dark) return dark;
  }

  return String(source.logoUrl || '').trim();
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

export const saveStoredLogoOverrides = ({ logoUrl = '', logoUrlLight = '', logoUrlDark = '' } = {}) => {
  if (typeof window === 'undefined') return;
  const payload = {
    logoUrl: String(logoUrl || '').trim(),
    logoUrlLight: String(logoUrlLight || '').trim(),
    logoUrlDark: String(logoUrlDark || '').trim(),
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
  return next;
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
