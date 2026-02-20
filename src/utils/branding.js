const ABSOLUTE_URL_PATTERN = /^[a-zA-Z][a-zA-Z\d+\-.]*:/;
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

export const getStoredHeaderLogoUrl = (theme = '') => {
  if (typeof window === 'undefined') return '';

  try {
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
