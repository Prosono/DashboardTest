// OAuth2 token persistence for Home Assistant
// Used as saveTokens / loadTokens callbacks for HAWS getAuth()

import { fetchSharedHaConfig, saveSharedHaConfig } from './appAuth';

const OAUTH_TOKENS_KEY = 'ha_oauth_tokens';

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
    const payload = JSON.stringify(tokenInfo);
    localStore?.setItem(OAUTH_TOKENS_KEY, payload);
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
    const localRaw = localStore?.getItem(OAUTH_TOKENS_KEY);
    if (localRaw) return JSON.parse(localRaw);

    const sessionRaw = sessionStore?.getItem(OAUTH_TOKENS_KEY);
    if (sessionRaw) {
      const parsed = JSON.parse(sessionRaw);
      localStore?.setItem(OAUTH_TOKENS_KEY, sessionRaw);
      sessionStore?.removeItem(OAUTH_TOKENS_KEY);
      return parsed;
    }
  } catch {}

  // 2) hvis tomt lokalt: hent fra server (shared)
  try {
    const shared = await fetchSharedHaConfig();
    if (shared?.oauthTokens) {
      // cache lokalt så HAWS blir fornøyd
      const payload = JSON.stringify(shared.oauthTokens);
      getLocalStorage()?.setItem(OAUTH_TOKENS_KEY, payload);
      return shared.oauthTokens;
    }
  } catch {}

  return undefined;
}

export function clearOAuthTokens(options = {}) {
  const { syncServer = true } = options;

  try {
    getSessionStorage()?.removeItem(OAUTH_TOKENS_KEY);
    getLocalStorage()?.removeItem(OAUTH_TOKENS_KEY);
  } catch (error) {
    console.error('Failed to clear OAuth tokens from localStorage:', error);
  }

  if (syncServer) pushTokensToServer(null);
}

export function hasOAuthTokens() {
  try {
    return !!(getSessionStorage()?.getItem(OAUTH_TOKENS_KEY) || getLocalStorage()?.getItem(OAUTH_TOKENS_KEY));
  } catch {
    return false;
  }
}
