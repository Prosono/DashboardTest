const TOKEN_KEY = 'tunet_app_auth_token';

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

export const apiRequest = async (path, options = {}) => {
  const token = getAuthToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(path, {
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

export const loginWithPassword = async (username, password) => {
  const payload = await apiRequest('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  if (payload?.token) setAuthToken(payload.token);
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
  const payload = await apiRequest('/api/auth/profile', {
    method: 'PUT',
    body: JSON.stringify(profile || {}),
  });
  return payload?.user || null;
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
