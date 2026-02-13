const STORAGE_CACHE_KEY = 'tunet_shared_dashboard_cache';
const STORAGE_SCHEMA_VERSION = 1;
const SAVE_DEBOUNCE_MS = 500;

const getStorageUrl = () => import.meta.env.VITE_DASHBOARD_STORAGE_URL || '/api/dashboard-config';

const safeParse = (value, fallback = null) => {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
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
  const res = await fetch(getStorageUrl(), {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to load shared dashboard: ${res.status}`);

  const payload = await res.json();
  return payload?.data || null;
};

export const saveSharedDashboard = async (data) => {
  const payload = {
    version: STORAGE_SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    data,
  };

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

export { SAVE_DEBOUNCE_MS };
