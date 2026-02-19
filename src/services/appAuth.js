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
  return payload?.config || null;
};

export const saveClientHaConfig = async (clientId, config) => {
  const payload = await apiRequest(`/api/clients/${encodeURIComponent(clientId)}/ha-config`, {
    method: 'PUT',
    body: JSON.stringify(config || {}),
  });
  return payload?.config || null;
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

export const fetchSharedHaConfig = async () => {
  const payload = await apiRequest('/api/auth/ha-config', { method: 'GET' });
  return payload?.config || null;
};

export const saveSharedHaConfig = async (config) => {
  const payload = await apiRequest('/api/auth/ha-config', {
    method: 'PUT',
    body: JSON.stringify(config || {}),
  });
  return payload?.config || null;
};
