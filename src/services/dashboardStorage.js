const STORAGE_CACHE_KEY = 'tunet_shared_dashboard_cache';
const STORAGE_PROFILES_CACHE_KEY = 'tunet_shared_dashboard_profiles_cache';

const API_BASE = import.meta.env.VITE_DASHBOARD_STORAGE_API_BASE || '/api';
const SHARED_USER_ID = import.meta.env.VITE_DASHBOARD_STORAGE_USER_ID || 'shared';

const toProfileId = (value) => String(value || 'default').trim().replace(/\s+/g, '_').toLowerCase();
const getProfileCacheKey = (id) => `tunet_shared_dashboard_profile_${id}`;

const safeParse = (value, fallback = null) => {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const request = async (path, options = {}) => {
  const headers = {
    'Content-Type': 'application/json',
    'x-ha-user-id': SHARED_USER_ID,
    ...(options.headers || {}),
  };

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `API error ${res.status}`);
  }

  return res.json();
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
    // best effort cache write
  }
};

const upsertCachedProfileMeta = (entry) => {
  const current = readProfilesCache();
  const id = toProfileId(entry?.id || entry?.name || 'default');
  const normalized = {
    id,
    name: entry?.name || id,
    updatedAt: entry?.updatedAt || null,
    serverId: entry?.serverId || null,
  };
  const next = [normalized, ...current.filter((p) => p.id !== id)];
  writeProfilesCache(next);
};

const upsertCachedProfileData = (id, data) => {
  try {
    localStorage.setItem(getProfileCacheKey(id), JSON.stringify({ data, updatedAt: new Date().toISOString() }));
  } catch {
    // best effort cache write
  }
};

const readCachedProfileData = (id) => {
  try {
    const raw = localStorage.getItem(getProfileCacheKey(id));
    if (!raw) return null;
    return safeParse(raw, null)?.data || null;
  } catch {
    return null;
  }
};

const normalizeProfileList = (profiles) => {
  const byId = new Map();
  (Array.isArray(profiles) ? profiles : []).forEach((entry) => {
    const id = toProfileId(entry?.name || entry?.id || 'default');
    if (byId.has(id)) return;
    byId.set(id, {
      id,
      name: entry?.name || id,
      updatedAt: entry?.updated_at || entry?.updatedAt || null,
      serverId: entry?.id || entry?.serverId || null,
    });
  });
  if (!byId.has('default')) {
    byId.set('default', { id: 'default', name: 'default', updatedAt: null, serverId: null });
  }
  const normalized = Array.from(byId.values());
  writeProfilesCache(normalized);
  return normalized;
};

const fetchProfilesRemote = async () => {
  const profiles = await request(`/profiles?ha_user_id=${encodeURIComponent(SHARED_USER_ID)}`, {
    method: 'GET',
  });
  return normalizeProfileList(profiles);
};

const resolveProfileMeta = async (profileId) => {
  const id = toProfileId(profileId);
  const cached = readProfilesCache().find((p) => p.id === id);
  if (cached?.serverId || id === 'default') return cached || null;

  const remote = await fetchProfilesRemote();
  return remote.find((p) => p.id === id) || null;
};

const fetchProfileDataByServerId = async (serverId, fallbackId) => {
  if (!serverId) return readCachedProfileData(fallbackId);
  const profile = await request(`/profiles/${encodeURIComponent(serverId)}`, { method: 'GET' });
  return profile?.data || null;
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
    // best effort cache write
  }
};

export const listSharedDashboards = async () => {
  try {
    return await fetchProfilesRemote();
  } catch {
    const cached = readProfilesCache();
    return cached.length > 0 ? cached : [{ id: 'default', name: 'default', updatedAt: null, serverId: null }];
  }
};

export const fetchSharedDashboardProfile = async (profileId) => {
  const id = toProfileId(profileId);
  try {
    const meta = await resolveProfileMeta(id);
    const data = await fetchProfileDataByServerId(meta?.serverId, id);
    if (data) {
      upsertCachedProfileData(id, data);
      return data;
    }
  } catch {
    // fallback below
  }
  return readCachedProfileData(id);
};

export const fetchSharedDashboard = async () => {
  const data = await fetchSharedDashboardProfile('default');
  return data || null;
};

const createProfile = async (id, name, data) => {
  const created = await request('/profiles', {
    method: 'POST',
    body: JSON.stringify({
      ha_user_id: SHARED_USER_ID,
      name,
      device_label: null,
      data,
    }),
  });

  const meta = {
    id,
    name,
    updatedAt: created?.updated_at || created?.updatedAt || new Date().toISOString(),
    serverId: created?.id || null,
  };
  upsertCachedProfileMeta(meta);
  return meta;
};

const updateProfile = async (meta, data) => {
  const updated = await request(`/profiles/${encodeURIComponent(meta.serverId)}`, {
    method: 'PUT',
    body: JSON.stringify({
      ha_user_id: SHARED_USER_ID,
      name: meta.name,
      device_label: null,
      data,
    }),
  });

  const nextMeta = {
    ...meta,
    updatedAt: updated?.updated_at || updated?.updatedAt || new Date().toISOString(),
  };
  upsertCachedProfileMeta(nextMeta);
  return nextMeta;
};

export const saveSharedDashboardProfile = async (profileId, data) => {
  const id = toProfileId(profileId);
  const name = String(profileId || 'default').trim() || 'default';

  try {
    const meta = await resolveProfileMeta(id);
    if (meta?.serverId) {
      await updateProfile(meta, data);
    } else {
      await createProfile(id, name, data);
    }
  } catch {
    // Keep local cache as fallback when backend unavailable.
  }

  upsertCachedProfileData(id, data);
  if (id === 'default') writeCachedDashboard(data);
  upsertCachedProfileMeta({ id, name, updatedAt: new Date().toISOString() });
  return { data };
};

export const saveSharedDashboard = async (data) => {
  return saveSharedDashboardProfile('default', data);
};

export const __resetDashboardStorageRuntime = () => {
  // no runtime flags in the profile-api implementation
};

export { toProfileId };
