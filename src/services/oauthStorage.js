// OAuth2 token persistence for Home Assistant
// Used as saveTokens / loadTokens callbacks for HAWS getAuth()

import { fetchSharedHaConfig, getClientId, saveSharedHaConfig } from './appAuth';

const OAUTH_TOKENS_KEY = 'ha_oauth_tokens';
const normalizeClientScope = (clientId = getClientId()) => String(clientId || '').trim().toLowerCase();
const getScopedOauthKey = (clientId = getClientId()) => {
  const scope = normalizeClientScope(clientId);
  return scope ? `${OAUTH_TOKENS_KEY}::${scope}` : OAUTH_TOKENS_KEY;
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

export function saveTokens(tokenInfo) {
  try {
    const sessionStore = getSessionStorage();
    const localStore = getLocalStorage();
    const key = getScopedOauthKey();
    const payload = JSON.stringify(tokenInfo);
    localStore?.setItem(key, payload);
    sessionStore?.removeItem(key);
    // Remove legacy/shared token key to avoid cross-client leakage.
    localStore?.removeItem(OAUTH_TOKENS_KEY);
    sessionStore?.removeItem(OAUTH_TOKENS_KEY);
  } catch (error) {
    console.error('Failed to save OAuth tokens to localStorage:', error);
  }

  pushTokensToServer(tokenInfo);
}

export async function loadTokens() {
  // 1) prøv local/session først (som i dag)
  try {
    const sessionStore = getSessionStorage();
    const localStore = getLocalStorage();
    const key = getScopedOauthKey();
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
    const shared = await fetchSharedHaConfig();
    if (shared?.oauthTokens) {
      // cache lokalt så HAWS blir fornøyd
      const payload = JSON.stringify(shared.oauthTokens);
      const key = getScopedOauthKey();
      getLocalStorage()?.setItem(key, payload);
      return shared.oauthTokens;
    }
  } catch {}

  return undefined;
}

export function clearOAuthTokens(options = {}) {
  const { syncServer = true } = options;

  try {
    const key = getScopedOauthKey();
    getSessionStorage()?.removeItem(key);
    getLocalStorage()?.removeItem(key);
    // Remove legacy/shared token key to avoid cross-client leakage.
    getSessionStorage()?.removeItem(OAUTH_TOKENS_KEY);
    getLocalStorage()?.removeItem(OAUTH_TOKENS_KEY);
  } catch (error) {
    console.error('Failed to clear OAuth tokens from localStorage:', error);
  }

  if (syncServer) pushTokensToServer(null);
}

export function hasOAuthTokens() {
  try {
    const key = getScopedOauthKey();
    return !!(getSessionStorage()?.getItem(key) || getLocalStorage()?.getItem(key));
  } catch {
    return false;
  }
}
