import { apiRequest } from './appAuth';

const STORAGE_CACHE_KEY = 'tunet_shared_dashboard_cache';
const STORAGE_PROFILES_CACHE_KEY = 'tunet_shared_dashboard_profiles_cache';

export const toProfileId = (value) => String(value || 'default').trim().replace(/\s+/g, '_').toLowerCase();

const safeParse = (value, fallback = null) => {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

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
    // best effort
  }
};

const normalizeList = (dashboards) => {
  const list = (Array.isArray(dashboards) ? dashboards : []).map((entry) => ({
    id: toProfileId(entry.id || entry.name || 'default'),
    name: entry.name || entry.id || 'default',
    updatedAt: entry.updatedAt || entry.updated_at || null,
  }));
  if (list.length === 0) list.push({ id: 'default', name: 'default', updatedAt: null });
  writeProfilesCache(list);
  return list;
};

export const readCachedDashboard = () => {
  try {
    const raw = localStorage.getItem(STORAGE_CACHE_KEY);
    if (!raw) return null;
    return safeParse(raw, null);
  } catch {
    return null;
  }
};

export const writeCachedDashboard = (payload) => {
  try {
    localStorage.setItem(STORAGE_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // best effort
  }
};

export const listSharedDashboards = async () => {
  try {
    const payload = await apiRequest('/api/dashboards', { method: 'GET' });
    return normalizeList(payload?.dashboards || []);
  } catch {
    const cached = readProfilesCache();
    return cached.length ? cached : [{ id: 'default', name: 'default', updatedAt: null }];
  }
};

/**
 * Hent én dashboard-profil
 * GET /api/dashboards/:id
 */
export const fetchSharedDashboardProfile = async (profileId) => {
  const id = toProfileId(profileId);
  try {
    const payload = await apiRequest(`/api/dashboards/${encodeURIComponent(id)}`, { method: 'GET' });
    const data = payload?.data || null;
    if (data && id === 'default') writeCachedDashboard(data);
    return data;
  } catch {
    return id === 'default' ? readCachedDashboard() : null;
  }
};

export const fetchSharedDashboard = async () => fetchSharedDashboardProfile('default');

export const saveSharedDashboardProfile = async (profileId, data) => {
  const id = toProfileId(profileId);
  const name = String(profileId || 'default').trim() || 'default';

  try {
    await apiRequest(`/api/dashboards/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify({ name, data }),
    });
  } catch (error) {
    if (error?.status === 404) {
      await apiRequest('/api/dashboards', {
        method: 'POST',
        body: JSON.stringify({ id, name, data }),
      });
    } else {
      throw error;
    }
  }

  if (id === 'default') writeCachedDashboard(data);
  return { data };
};

export const saveSharedDashboard = async (data) => saveSharedDashboardProfile('default', data);

export const __resetDashboardStorageRuntime = () => {};

export const listSharedDashboards = fetchSharedDashboardProfiles;
