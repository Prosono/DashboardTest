const ABSOLUTE_URL_PATTERN = /^[a-zA-Z][a-zA-Z\d+\-.]*:/;

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

const parseJSON = (value) => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

export const getStoredHeaderLogoUrl = () => {
  if (typeof window === 'undefined') return '';

  try {
    const cachedRaw = localStorage.getItem('tunet_shared_dashboard_cache');
    const cached = cachedRaw ? parseJSON(cachedRaw) : null;
    const fromCache = cached?.headerSettings?.logoUrl;
    if (typeof fromCache === 'string' && fromCache.trim()) return fromCache.trim();

    const legacyRaw = localStorage.getItem('tunet_header_settings');
    const legacy = legacyRaw ? parseJSON(legacyRaw) : null;
    const fromLegacy = legacy?.logoUrl;
    if (typeof fromLegacy === 'string' && fromLegacy.trim()) return fromLegacy.trim();
  } catch {
    // best effort lookup only
  }

  return '';
};
