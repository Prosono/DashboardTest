import { normalizeHaConfig } from '../utils/haConnections';
import { normalizeNotificationConfig } from '../utils/notificationConfig';

const TOKEN_KEY = 'tunet_app_auth_token';
const CLIENT_KEY = 'tunet_client_id';
const API_BASE = (() => {
  const fromEnv = import.meta.env?.VITE_API_BASE;
  if (typeof fromEnv === 'string' && fromEnv.trim()) return fromEnv.trim().replace(/\/$/, '');
  return './api';
})();

const resolveApiPath = (path) => {
  const input = String(path || '').trim();
  if (!input) return API_BASE;
  if (/^https?:\/\//i.test(input)) return input;
  if (input.startsWith('/api/')) return `${API_BASE}${input.slice(4)}`;
  if (input.startsWith('api/')) return `${API_BASE}/${input.slice(4)}`;
  if (input.startsWith('/')) return `${API_BASE}${input}`;
  return `${API_BASE}/${input}`;
};

export const getAuthToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
};

export const setAuthToken = (token) => {
  try {
    if (!token) localStorage.removeItem(TOKEN_KEY);
    else localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // ignore
  }
};

export const clearAuthToken = () => setAuthToken('');

export const getClientId = () => {
  try {
    return localStorage.getItem(CLIENT_KEY) || '';
  } catch {
    return '';
  }
};

export const setClientId = (clientId) => {
  const normalized = String(clientId || '').trim();
  try {
    if (!normalized) localStorage.removeItem(CLIENT_KEY);
    else localStorage.setItem(CLIENT_KEY, normalized);
  } catch {
    // ignore
  }
};

const normalizeClientScope = (clientId = getClientId()) => String(clientId || '').trim().toLowerCase();

const buildScopedKey = (baseKey, clientId = getClientId()) => {
  const scope = normalizeClientScope(clientId);
  return scope ? `${baseKey}::${scope}` : baseKey;
};

export const readStoredHaConfig = (clientId = getClientId()) => {
  try {
    const legacy = {
      url: localStorage.getItem(buildScopedKey('ha_url', clientId)) || '',
      fallbackUrl: localStorage.getItem(buildScopedKey('ha_fallback_url', clientId)) || '',
      token: localStorage.getItem(buildScopedKey('ha_token', clientId)) || '',
      authMethod: localStorage.getItem(buildScopedKey('ha_auth_method', clientId)) || 'oauth',
    };
    const connectionsRaw = localStorage.getItem(buildScopedKey('ha_connections', clientId));
    const primaryConnectionId = localStorage.getItem(buildScopedKey('ha_primary_connection_id', clientId)) || '';
    if (connectionsRaw) {
      try {
        const parsedConnections = JSON.parse(connectionsRaw);
        return normalizeHaConfig({
          ...legacy,
          connections: Array.isArray(parsedConnections) ? parsedConnections : [],
          primaryConnectionId,
        });
      } catch {
        // fall through to legacy storage
      }
    }
    return normalizeHaConfig(legacy);
  } catch {
    return normalizeHaConfig({ url: '', fallbackUrl: '', token: '', authMethod: 'oauth' });
  }
};

export const writeStoredHaConfig = (config = {}, clientId = getClientId()) => {
  try {
    const normalized = normalizeHaConfig(config || {});
    localStorage.setItem(buildScopedKey('ha_url', clientId), String(normalized.url || ''));
    localStorage.setItem(buildScopedKey('ha_fallback_url', clientId), String(normalized.fallbackUrl || ''));
    localStorage.setItem(buildScopedKey('ha_token', clientId), String(normalized.token || ''));
    localStorage.setItem(buildScopedKey('ha_auth_method', clientId), String(normalized.authMethod || 'oauth'));
    localStorage.setItem(buildScopedKey('ha_primary_connection_id', clientId), String(normalized.primaryConnectionId || 'primary'));
    localStorage.setItem(buildScopedKey('ha_connections', clientId), JSON.stringify(normalized.connections || []));
  } catch {
    // best effort
  }
};

export const clearStoredHaConfig = (clientId = getClientId()) => {
  try {
    localStorage.removeItem(buildScopedKey('ha_url', clientId));
    localStorage.removeItem(buildScopedKey('ha_fallback_url', clientId));
    localStorage.removeItem(buildScopedKey('ha_token', clientId));
    localStorage.removeItem(buildScopedKey('ha_auth_method', clientId));
    localStorage.removeItem(buildScopedKey('ha_primary_connection_id', clientId));
    localStorage.removeItem(buildScopedKey('ha_connections', clientId));
    // Legacy keys from older builds.
    localStorage.removeItem('ha_url');
    localStorage.removeItem('ha_fallback_url');
    localStorage.removeItem('ha_token');
    localStorage.removeItem('ha_auth_method');
    localStorage.removeItem('ha_primary_connection_id');
    localStorage.removeItem('ha_connections');
  } catch {
    // best effort
  }
};

export const apiRequest = async (path, options = {}) => {
  const token = getAuthToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(resolveApiPath(path), {
    ...options,
    headers,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.error || `API error ${res.status}`);
    err.status = res.status;
    throw err;
  }

  return res.json();
};

export const loginWithPassword = async (clientId, username, password) => {
  const payload = await apiRequest('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ clientId, username, password }),
  });
  if (payload?.token) {
    setAuthToken(payload.token);
    setClientId(payload?.user?.clientId || clientId);
  }
  return payload;
};

export const logoutUser = async () => {
  try {
    await apiRequest('/api/auth/logout', { method: 'POST' });
  } finally {
    clearAuthToken();
  }
};

export const fetchCurrentUser = async () => {
  const payload = await apiRequest('/api/auth/me', { method: 'GET' });
  return payload?.user || null;
};

export const reportSessionActivity = async (activity) => {
  const payload = await apiRequest('/api/auth/session/activity', {
    method: 'POST',
    body: JSON.stringify(activity || {}),
  });
  return Boolean(payload?.success);
};

export const updateProfile = async (profile) => {
  try {
    const payload = await apiRequest('/api/auth/profile', {
      method: 'PUT',
      body: JSON.stringify(profile || {}),
    });
    return payload?.user || null;
  } catch (error) {
    if (error?.status !== 404 && error?.status !== 405) throw error;
    try {
      const payload = await apiRequest('/api/auth/profile', {
        method: 'POST',
        body: JSON.stringify(profile || {}),
      });
      return payload?.user || null;
    } catch (fallbackError) {
      if (fallbackError?.status !== 404 && fallbackError?.status !== 405) throw fallbackError;
      const me = await fetchCurrentUser();
      if (!me?.id) throw fallbackError;
      const payload = await apiRequest(`/api/users/${encodeURIComponent(me.id)}`, {
        method: 'PUT',
        body: JSON.stringify(profile || {}),
      });
      return payload?.user || null;
    }
  }
};

export const listUsers = async () => {
  const payload = await apiRequest('/api/users', { method: 'GET' });
  return Array.isArray(payload?.users) ? payload.users : [];
};

export const createUser = async (user) => {
  const payload = await apiRequest('/api/users', {
    method: 'POST',
    body: JSON.stringify(user),
  });
  return payload?.user || null;
};

export const updateUser = async (id, user) => {
  const payload = await apiRequest(`/api/users/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(user || {}),
  });
  return payload?.user || null;
};

export const deleteUser = async (id) => {
  const payload = await apiRequest(`/api/users/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  return Boolean(payload?.success);
};

export const listClients = async () => {
  const payload = await apiRequest('/api/clients', { method: 'GET' });
  return Array.isArray(payload?.clients) ? payload.clients : [];
};

export const fetchPlatformOverview = async (logLimit = 50) => {
  const safeLimit = Math.max(1, Math.min(200, Number.parseInt(String(logLimit ?? ''), 10) || 50));
  const payload = await apiRequest(`/api/clients/overview?logLimit=${safeLimit}`, { method: 'GET' });
  return payload && typeof payload === 'object' ? payload : null;
};

export const createClient = async (clientId, name = '') => {
  const payload = await apiRequest('/api/clients', {
    method: 'POST',
    body: JSON.stringify({ clientId, name }),
  });
  return payload?.client || null;
};

export const createClientAdmin = async (clientId, username, password) => {
  const payload = await apiRequest(`/api/clients/${encodeURIComponent(clientId)}/admin`, {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  return payload?.user || null;
};

export const updateClient = async (clientId, name) => {
  const payload = await apiRequest(`/api/clients/${encodeURIComponent(clientId)}`, {
    method: 'PUT',
    body: JSON.stringify({ name }),
  });
  return payload?.client || null;
};

export const deleteClient = async (clientId, confirmation) => {
  const payload = await apiRequest(`/api/clients/${encodeURIComponent(clientId)}`, {
    method: 'DELETE',
    body: JSON.stringify({ confirmation }),
  });
  return Boolean(payload?.success);
};

export const fetchClientHaConfig = async (clientId) => {
  const payload = await apiRequest(`/api/clients/${encodeURIComponent(clientId)}/ha-config`, { method: 'GET' });
  return payload?.config ? normalizeHaConfig(payload.config) : null;
};

export const saveClientHaConfig = async (clientId, config) => {
  const payload = await apiRequest(`/api/clients/${encodeURIComponent(clientId)}/ha-config`, {
    method: 'PUT',
    body: JSON.stringify(config || {}),
  });
  return payload?.config ? normalizeHaConfig(payload.config) : null;
};

export const listClientDashboards = async (clientId) => {
  const payload = await apiRequest(`/api/clients/${encodeURIComponent(clientId)}/dashboards`, { method: 'GET' });
  return Array.isArray(payload?.dashboards) ? payload.dashboards : [];
};

export const fetchClientDashboard = async (clientId, dashboardId) => {
  const payload = await apiRequest(`/api/clients/${encodeURIComponent(clientId)}/dashboards/${encodeURIComponent(dashboardId)}`, {
    method: 'GET',
  });
  return payload?.data || null;
};

export const saveClientDashboard = async (clientId, dashboardId, name, data) => {
  const payload = await apiRequest(`/api/clients/${encodeURIComponent(clientId)}/dashboards/${encodeURIComponent(dashboardId)}`, {
    method: 'PUT',
    body: JSON.stringify({ name, data }),
  });
  return payload?.dashboard || null;
};

export const listClientDashboardVersions = async (clientId, dashboardId, limit = 30) => {
  const safeLimit = Math.max(1, Math.min(200, Number.parseInt(String(limit ?? ''), 10) || 30));
  const payload = await apiRequest(`/api/clients/${encodeURIComponent(clientId)}/dashboards/${encodeURIComponent(dashboardId)}/versions?limit=${safeLimit}`, {
    method: 'GET',
  });
  return Array.isArray(payload?.versions) ? payload.versions : [];
};

export const restoreClientDashboardVersion = async (clientId, dashboardId, versionId) => {
  const payload = await apiRequest(`/api/clients/${encodeURIComponent(clientId)}/dashboards/${encodeURIComponent(dashboardId)}/versions/${encodeURIComponent(versionId)}/restore`, {
    method: 'POST',
  });
  return payload || null;
};

export const fetchSharedHaConfig = async () => {
  const payload = await apiRequest('/api/auth/ha-config', { method: 'GET' });
  return payload?.config ? normalizeHaConfig(payload.config) : null;
};

export const saveSharedHaConfig = async (config) => {
  const payload = await apiRequest('/api/auth/ha-config', {
    method: 'PUT',
    body: JSON.stringify(config || {}),
  });
  return payload?.config ? normalizeHaConfig(payload.config) : null;
};

export const fetchGlobalBranding = async () => {
  const payload = await apiRequest('/api/branding', { method: 'GET' });
  return payload?.branding || null;
};

export const saveGlobalBranding = async (branding) => {
  const payload = await apiRequest('/api/branding', {
    method: 'PUT',
    body: JSON.stringify(branding || {}),
  });
  return payload?.branding || null;
};

export const fetchNotificationConfig = async () => {
  const payload = await apiRequest('/api/auth/notification-config', { method: 'GET' });
  return normalizeNotificationConfig(payload?.config || {});
};

export const saveNotificationConfig = async (config) => {
  const payload = await apiRequest('/api/auth/notification-config', {
    method: 'PUT',
    body: JSON.stringify(config || {}),
  });
  return normalizeNotificationConfig(payload?.config || {});
};

export const fetchNotificationHistory = async () => {
  const payload = await apiRequest('/api/auth/notification-history', { method: 'GET' });
  return Array.isArray(payload?.history) ? payload.history : [];
};

export const appendNotificationHistoryEntry = async (entry, options = {}) => {
  const payload = await apiRequest('/api/auth/notification-history', {
    method: 'POST',
    body: JSON.stringify({
      entry: entry || {},
      dedupeWindowMs: options?.dedupeWindowMs,
    }),
  });
  return Array.isArray(payload?.history) ? payload.history : [];
};

export const clearNotificationHistory = async () => {
  const payload = await apiRequest('/api/auth/notification-history', { method: 'DELETE' });
  return Array.isArray(payload?.history) ? payload.history : [];
};

export const deleteNotificationHistoryEntry = async (id) => {
  const entryId = String(id || '').trim();
  if (!entryId) return [];
  const payload = await apiRequest(`/api/auth/notification-history/${encodeURIComponent(entryId)}`, {
    method: 'DELETE',
  });
  return Array.isArray(payload?.history) ? payload.history : [];
};

export const fetchAppActionHistory = async (limit = 200) => {
  const safeLimit = Math.max(1, Math.min(500, Number.parseInt(String(limit ?? ''), 10) || 200));
  const payload = await apiRequest(`/api/auth/app-action-history?limit=${safeLimit}`, { method: 'GET' });
  return Array.isArray(payload?.history) ? payload.history : [];
};

export const appendAppActionHistoryEntry = async (entry, options = {}) => {
  const payload = await apiRequest('/api/auth/app-action-history', {
    method: 'POST',
    body: JSON.stringify({
      ...(entry && typeof entry === 'object' ? entry : {}),
      dedupeWindowMs: options?.dedupeWindowMs,
    }),
  });
  return {
    logged: Boolean(payload?.logged),
    deduped: Boolean(payload?.deduped),
    history: Array.isArray(payload?.history) ? payload.history : [],
  };
};

export const clearAppActionHistory = async () => {
  const payload = await apiRequest('/api/auth/app-action-history', { method: 'DELETE' });
  return Array.isArray(payload?.history) ? payload.history : [];
};

export const deleteAppActionHistoryEntry = async (id) => {
  const entryId = String(id || '').trim();
  if (!entryId) return [];
  const payload = await apiRequest(`/api/auth/app-action-history/${encodeURIComponent(entryId)}`, {
    method: 'DELETE',
  });
  return Array.isArray(payload?.history) ? payload.history : [];
};
