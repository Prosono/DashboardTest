const STORAGE_CACHE_KEY = 'tunet_shared_dashboard_cache';
const STORAGE_SCHEMA_VERSION = 1;

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

const unwrapData = (payload) => payload?.data || null;

const buildPayload = (data) => ({
  version: STORAGE_SCHEMA_VERSION,
  updatedAt: new Date().toISOString(),
  data,
});

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
    return [{
      id: 'default',
      name: 'default',
      updatedAt: defaultPayload?.updatedAt || null,
    }];
  }
  if (!res.ok) throw new Error(`Failed to list shared dashboards: ${res.status}`);

  const payload = await res.json();
  const rawProfiles = Array.isArray(payload?.profiles) ? payload.profiles : [];
  if (rawProfiles.length === 0) {
    const defaultPayload = await fetchDefaultDashboardEnvelope();
    return [{
      id: 'default',
      name: 'default',
      updatedAt: defaultPayload?.updatedAt || null,
    }];
  }

  return rawProfiles.map((entry) => ({
    id: toProfileId(entry.id || entry.name || 'default'),
    name: entry.name || entry.id || 'default',
    updatedAt: entry.updatedAt || null,
  }));
};

export const fetchSharedDashboardProfile = async (profileId) => {
  const id = toProfileId(profileId);
  if (id === 'default') return fetchSharedDashboard();

  const res = await fetch(`${getProfilesUrl()}/${encodeURIComponent(id)}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  if (res.status === 404) return null;
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

  if (!res.ok) throw new Error(`Failed to save shared dashboard profile: ${res.status}`);
  return payload;
};

export { toProfileId };
