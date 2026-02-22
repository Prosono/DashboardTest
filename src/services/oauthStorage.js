// OAuth2 token persistence for Home Assistant
// Used as saveTokens / loadTokens callbacks for HAWS getAuth()

import { fetchSharedHaConfig, getClientId, saveSharedHaConfig } from './appAuth';
import { DEFAULT_PRIMARY_CONNECTION_ID, normalizeConnectionId, normalizeHaConfig } from '../utils/haConnections';

const OAUTH_TOKENS_KEY = 'ha_oauth_tokens';
const normalizeClientScope = (clientId = getClientId()) => String(clientId || '').trim().toLowerCase();
const getScopedOauthKey = (clientId = getClientId(), connectionId = DEFAULT_PRIMARY_CONNECTION_ID) => {
  const scope = normalizeClientScope(clientId);
  const normalizedConnectionId = normalizeConnectionId(connectionId, DEFAULT_PRIMARY_CONNECTION_ID);
  if (scope) return `${OAUTH_TOKENS_KEY}::${scope}::${normalizedConnectionId}`;
  return `${OAUTH_TOKENS_KEY}::${normalizedConnectionId}`;
};

const getSessionStorage = () => {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
};

const getLocalStorage = () => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

const pushTokensToServer = (tokenInfo) => {
  saveSharedHaConfig({ authMethod: 'oauth', oauthTokens: tokenInfo || null })
    .catch(() => {
      // best effort sync only
    });
};

export function saveTokensForConnection(connectionId, tokenInfo, options = {}) {
  const { syncServer = false } = options;
  try {
    const sessionStore = getSessionStorage();
    const localStore = getLocalStorage();
    const key = getScopedOauthKey(getClientId(), connectionId);
    const payload = JSON.stringify(tokenInfo);
    localStore?.setItem(key, payload);
    sessionStore?.removeItem(key);
    // Remove legacy/shared token key to avoid cross-client leakage.
    localStore?.removeItem(OAUTH_TOKENS_KEY);
    sessionStore?.removeItem(OAUTH_TOKENS_KEY);
  } catch (error) {
    console.error('Failed to save OAuth tokens to localStorage:', error);
  }

  if (syncServer) pushTokensToServer(tokenInfo);
}

export function saveTokens(tokenInfo) {
  saveTokensForConnection(DEFAULT_PRIMARY_CONNECTION_ID, tokenInfo, { syncServer: true });
}

export async function loadTokensForConnection(connectionId = DEFAULT_PRIMARY_CONNECTION_ID) {
  // 1) prøv local/session først (som i dag)
  try {
    const sessionStore = getSessionStorage();
    const localStore = getLocalStorage();
    const key = getScopedOauthKey(getClientId(), connectionId);
    const localRaw = localStore?.getItem(key);
    if (localRaw) return JSON.parse(localRaw);

    const sessionRaw = sessionStore?.getItem(key);
    if (sessionRaw) {
      const parsed = JSON.parse(sessionRaw);
      localStore?.setItem(key, sessionRaw);
      sessionStore?.removeItem(key);
      return parsed;
    }
  } catch {}

  // 2) hvis tomt lokalt: hent fra server (shared)
  try {
    const sharedRaw = await fetchSharedHaConfig();
    const shared = normalizeHaConfig(sharedRaw || {});
    const normalizedConnectionId = normalizeConnectionId(connectionId, DEFAULT_PRIMARY_CONNECTION_ID);
    const matchingConnection = shared.connections.find((connection) => connection.id === normalizedConnectionId);
    const tokens = matchingConnection?.oauthTokens ?? null;
    if (tokens) {
      // cache lokalt så HAWS blir fornøyd
      const payload = JSON.stringify(tokens);
      const key = getScopedOauthKey(getClientId(), normalizedConnectionId);
      getLocalStorage()?.setItem(key, payload);
      return tokens;
    }
  } catch {}

  return undefined;
}

export function loadTokens() {
  return loadTokensForConnection(DEFAULT_PRIMARY_CONNECTION_ID);
}

export function clearOAuthTokens(options = {}) {
  const { syncServer = true } = options;
  const connectionId = options?.connectionId || DEFAULT_PRIMARY_CONNECTION_ID;

  try {
    const key = getScopedOauthKey(getClientId(), connectionId);
    getSessionStorage()?.removeItem(key);
    getLocalStorage()?.removeItem(key);
    // Remove legacy/shared token key to avoid cross-client leakage.
    if (normalizeConnectionId(connectionId, DEFAULT_PRIMARY_CONNECTION_ID) === DEFAULT_PRIMARY_CONNECTION_ID) {
      getSessionStorage()?.removeItem(OAUTH_TOKENS_KEY);
      getLocalStorage()?.removeItem(OAUTH_TOKENS_KEY);
    }
  } catch (error) {
    console.error('Failed to clear OAuth tokens from localStorage:', error);
  }

  if (syncServer) pushTokensToServer(null);
}

export function hasOAuthTokens(connectionId = DEFAULT_PRIMARY_CONNECTION_ID) {
  try {
    const key = getScopedOauthKey(getClientId(), connectionId);
    return !!(getSessionStorage()?.getItem(key) || getLocalStorage()?.getItem(key));
  } catch {
    return false;
  }
}

export function clearAllOAuthTokens(options = {}) {
  const { syncServer = false } = options;
  const scope = normalizeClientScope(getClientId());
  const scopedPrefix = scope ? `${OAUTH_TOKENS_KEY}::${scope}::` : `${OAUTH_TOKENS_KEY}::`;

  const removeMatching = (store) => {
    if (!store) return;
    const keysToRemove = [];
    for (let index = 0; index < store.length; index += 1) {
      const key = store.key(index);
      if (typeof key === 'string' && key.startsWith(scopedPrefix)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => store.removeItem(key));
  };

  try {
    removeMatching(getSessionStorage());
    removeMatching(getLocalStorage());
    getSessionStorage()?.removeItem(OAUTH_TOKENS_KEY);
    getLocalStorage()?.removeItem(OAUTH_TOKENS_KEY);
  } catch (error) {
    console.error('Failed to clear all OAuth tokens from storage:', error);
  }

  if (syncServer) pushTokensToServer(null);
}
