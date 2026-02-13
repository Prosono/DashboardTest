const STORAGE_CACHE_KEY = 'tunet_shared_dashboard_cache';
const STORAGE_SCHEMA_VERSION = 1;
const STORAGE_PROFILES_CACHE_KEY = 'tunet_shared_dashboard_profiles_cache';

const getStorageUrl = () => import.meta.env.VITE_DASHBOARD_STORAGE_URL || '/api/dashboard-config';

const toProfileId = (value) => String(value || 'default').trim().replace(/\s+/g, '_').toLowerCase();

const safeParse = (value, fallback = null) => {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const getProfilesUrl = () => `${getStorageUrl().replace(/\/$/, '')}/profiles`;
const getProfileCacheKey = (id) => `tunet_shared_dashboard_profile_${id}`;

const unwrapData = (payload) => payload?.data || null;

const buildPayload = (data) => ({
  version: STORAGE_SCHEMA_VERSION,
  updatedAt: new Date().toISOString(),
  data,
});

const readProfilesCache = () => {
  try {
    const raw = localStorage.getItem(STORAGE_PROFILES_CACHE_KEY);
    const parsed = raw ? safeParse(raw, []) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeProfilesCache = (profiles) => {
  try {
    localStorage.setItem(STORAGE_PROFILES_CACHE_KEY, JSON.stringify(profiles));
  } catch {
    // best effort cache write
  }
};

const upsertCachedProfile = (entry) => {
  const current = readProfilesCache();
  const next = [entry, ...current.filter((p) => p.id !== entry.id)];
  writeProfilesCache(next);
};

const readCachedProfileData = (id) => {
  try {
    const raw = localStorage.getItem(getProfileCacheKey(id));
    if (!raw) return null;
    return safeParse(raw, null);
  } catch {
    return null;
  }
};

const writeCachedProfileData = (id, payload) => {
  try {
    localStorage.setItem(getProfileCacheKey(id), JSON.stringify(payload));
  } catch {
    // best effort cache write
  }
};

const fetchDefaultDashboardEnvelope = async () => {
  const res = await fetch(getStorageUrl(), {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to load shared dashboard: ${res.status}`);
  return res.json();
};

export const readCachedDashboard = () => {
  try {
    const cached = localStorage.getItem(STORAGE_CACHE_KEY);
    if (!cached) return null;
    return safeParse(cached, null);
  } catch {
    return null;
  }
};

export const writeCachedDashboard = (payload) => {
  try {
    localStorage.setItem(STORAGE_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // best-effort cache write
  }
};

export const fetchSharedDashboard = async () => {
  const payload = await fetchDefaultDashboardEnvelope();
  if (!payload) return null;
  return unwrapData(payload);
};

export const saveSharedDashboard = async (data) => {
  const payload = buildPayload(data);

  const res = await fetch(getStorageUrl(), {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) throw new Error(`Failed to save shared dashboard: ${res.status}`);
  return payload;
};

export const listSharedDashboards = async () => {
  const res = await fetch(getProfilesUrl(), {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  if (res.status === 404) {
    const defaultPayload = await fetchDefaultDashboardEnvelope();
    const defaults = [{
      id: 'default',
      name: 'default',
      updatedAt: defaultPayload?.updatedAt || null,
    }];
    const cachedProfiles = readProfilesCache();
    return [...defaults, ...cachedProfiles.filter((p) => p.id !== 'default')];
  }
  if (!res.ok) throw new Error(`Failed to list shared dashboards: ${res.status}`);

  const payload = await res.json();
  const rawProfiles = Array.isArray(payload?.profiles) ? payload.profiles : [];
  if (rawProfiles.length === 0) {
    const defaultPayload = await fetchDefaultDashboardEnvelope();
    const defaults = [{
      id: 'default',
      name: 'default',
      updatedAt: defaultPayload?.updatedAt || null,
    }];
    const cachedProfiles = readProfilesCache();
    return [...defaults, ...cachedProfiles.filter((p) => p.id !== 'default')];
  }

  const normalized = rawProfiles.map((entry) => ({
    id: toProfileId(entry.id || entry.name || 'default'),
    name: entry.name || entry.id || 'default',
    updatedAt: entry.updatedAt || null,
  }));

  writeProfilesCache(normalized);
  return normalized;
};

export const fetchSharedDashboardProfile = async (profileId) => {
  const id = toProfileId(profileId);
  if (id === 'default') return fetchSharedDashboard();

  const res = await fetch(`${getProfilesUrl()}/${encodeURIComponent(id)}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  if (res.status === 404) {
    const cached = readCachedProfileData(id);
    return cached?.data || null;
  }
  if (!res.ok) throw new Error(`Failed to load shared dashboard profile: ${res.status}`);

  const payload = await res.json();
  return unwrapData(payload);
};

export const saveSharedDashboardProfile = async (profileId, data) => {
  const id = toProfileId(profileId);
  if (id === 'default') return saveSharedDashboard(data);

  const payload = buildPayload(data);
  const res = await fetch(`${getProfilesUrl()}/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ ...payload, id }),
  });

  if (!res.ok && res.status !== 404) throw new Error(`Failed to save shared dashboard profile: ${res.status}`);

  // Always keep a local profile cache so refresh/load can still work even if
  // backend does not implement profile listing endpoints.
  writeCachedProfileData(id, payload);
  upsertCachedProfile({ id, name: profileId || id, updatedAt: payload.updatedAt });

  return payload;
};

export { toProfileId };
