import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  clearOAuthTokens,
  hasOAuthTokens,
  loadTokensForConnection,
  saveTokensForConnection,
} from '../services/oauthStorage';
import { writeStoredHaConfig } from '../services/appAuth';
import {
  DEFAULT_PRIMARY_CONNECTION_ID,
  normalizeConnectionId,
  normalizeHaConfig,
  parseScopedEntityId,
  toScopedEntityId,
} from '../utils/haConnections';

const HomeAssistantContext = createContext(null);

const getMessageEntityIds = (message) => {
  if (!message || typeof message !== 'object') return [];

  const collect = [];
  const pushIds = (value) => {
    if (typeof value === 'string' && value.trim()) collect.push(value.trim());
    if (Array.isArray(value)) value.forEach((entry) => pushIds(entry));
  };

  pushIds(message.entity_id);
  pushIds(message.entity_ids);
  pushIds(message.filter_entity_id);
  pushIds(message.statistic_id);
  pushIds(message.statistic_ids);

  if (message.type === 'call_service') {
    pushIds(message?.target?.entity_id);
    pushIds(message?.service_data?.entity_id);
  }

  if (message.type === 'todo/item/list') {
    pushIds(message.entity_id);
  }

  return collect;
};

const normalizeEntityRefForConnection = (value, connectionId, primaryConnectionId) => {
  if (typeof value === 'string') {
    const parsed = parseScopedEntityId(value, primaryConnectionId);
    if (parsed.connectionId !== connectionId) return null;
    return parsed.entityId;
  }
  if (Array.isArray(value)) {
    const next = value
      .map((entry) => normalizeEntityRefForConnection(entry, connectionId, primaryConnectionId))
      .filter(Boolean);
    return next.length ? next : null;
  }
  return value;
};

const buildMessageForConnection = (message, connectionId, primaryConnectionId) => {
  if (!message || typeof message !== 'object') return message;

  const cloned = {
    ...message,
    target: message.target ? { ...message.target } : message.target,
    service_data: message.service_data ? { ...message.service_data } : message.service_data,
  };

  const applyField = (obj, key) => {
    if (!obj || !Object.prototype.hasOwnProperty.call(obj, key)) return true;
    const normalized = normalizeEntityRefForConnection(obj[key], connectionId, primaryConnectionId);
    if (normalized === null) return false;
    obj[key] = normalized;
    return true;
  };

  if (!applyField(cloned, 'entity_id')) return null;
  if (!applyField(cloned, 'entity_ids')) return null;
  if (!applyField(cloned, 'filter_entity_id')) return null;
  if (!applyField(cloned, 'statistic_id')) return null;
  if (!applyField(cloned, 'statistic_ids')) return null;
  if (!applyField(cloned.target, 'entity_id')) return null;
  if (!applyField(cloned.service_data, 'entity_id')) return null;

  return cloned;
};

const mergeEntitiesByConnection = (entityMaps, primaryConnectionId, connectionMetaById = {}) => {
  const merged = {};

  Object.entries(entityMaps || {}).forEach(([connectionIdRaw, entityMap]) => {
    const connectionId = normalizeConnectionId(connectionIdRaw || primaryConnectionId, primaryConnectionId);
    if (!entityMap || typeof entityMap !== 'object') return;
    const connectionMeta = connectionMetaById[connectionId] || {};
    const connectionLabel = String(connectionMeta?.name || connectionMeta?.id || connectionId).trim();

    Object.entries(entityMap).forEach(([rawEntityId, entity]) => {
      if (!rawEntityId || !entity) return;

      const entityAttributes = {
        ...(entity?.attributes || {}),
        __ha_connection_id: connectionId,
        __ha_connection_name: connectionLabel,
      };

      if (connectionId === primaryConnectionId) {
        merged[rawEntityId] = {
          ...entity,
          entity_id: rawEntityId,
          attributes: entityAttributes,
        };
        return;
      }

      const scopedId = toScopedEntityId(rawEntityId, connectionId, primaryConnectionId);
      const currentFriendly = String(entityAttributes.friendly_name || rawEntityId).trim();
      entityAttributes.friendly_name = `${currentFriendly} [${connectionLabel}]`;
      merged[scopedId] = {
        ...entity,
        entity_id: scopedId,
        attributes: entityAttributes,
      };
    });
  });

  return merged;
};

const mergeServiceResponses = (responses = []) => {
  if (!responses.length) return null;
  if (responses.length === 1) return responses[0];

  const allObjects = responses.every((response) => response && typeof response === 'object' && !Array.isArray(response));
  if (!allObjects) return responses[responses.length - 1];

  return responses.reduce((acc, response) => ({ ...acc, ...response }), {});
};

export const useHomeAssistant = () => {
  const context = useContext(HomeAssistantContext);
  if (!context) {
    throw new Error('useHomeAssistant must be used within HomeAssistantProvider');
  }
  return context;
};

export const HomeAssistantProvider = ({ children, config }) => {
  const normalizedConfig = useMemo(() => normalizeHaConfig(config || {}), [config]);
  const normalizedConnections = normalizedConfig.connections;
  const primaryConnectionId = normalizeConnectionId(
    normalizedConfig.primaryConnectionId || normalizedConnections[0]?.id || DEFAULT_PRIMARY_CONNECTION_ID,
    DEFAULT_PRIMARY_CONNECTION_ID,
  );

  const [entities, setEntities] = useState({});
  const [connected, setConnected] = useState(false);
  const [haUnavailable, setHaUnavailable] = useState(false);
  const [haUnavailableVisible, setHaUnavailableVisible] = useState(false);
  const [oauthExpired, setOauthExpired] = useState(false);
  const [oauthBootstrapTick, setOauthBootstrapTick] = useState(0);
  const [libLoaded, setLibLoaded] = useState(false);
  const [conn, setConn] = useState(null);
  const [activeUrl, setActiveUrl] = useState(normalizedConfig.url || '');

  const authRef = useRef(null);
  const activeConnectionMapRef = useRef({});
  const entityMapsRef = useRef({});
  const connectionStatusRef = useRef({});
  const routeMessageRef = useRef(async () => {
    throw new Error('No Home Assistant connection available');
  });
  const routerListenersRef = useRef({
    ready: new Set(),
    disconnected: new Set(),
  });
  const configuredConnectionMapRef = useRef({});

  configuredConnectionMapRef.current = normalizedConnections.reduce((acc, connection) => {
    acc[connection.id] = connection;
    return acc;
  }, {});

  const emitRouterEvent = (type) => {
    const listeners = routerListenersRef.current[type];
    if (!listeners || !listeners.size) return;
    listeners.forEach((listener) => {
      try {
        listener();
      } catch {
        // ignore listener exceptions
      }
    });
  };

  const resolveConnectionIdForEntity = (entityId) => {
    const parsed = parseScopedEntityId(entityId, primaryConnectionId);
    if (activeConnectionMapRef.current[parsed.connectionId]) return parsed.connectionId;
    if (configuredConnectionMapRef.current[parsed.connectionId]) return parsed.connectionId;
    return primaryConnectionId;
  };

  const refreshConnectionState = () => {
    const statuses = connectionStatusRef.current;
    const anyConnected = Object.values(statuses).some((state) => Boolean(state?.connected));
    const primaryStatus = statuses[primaryConnectionId];
    const primaryConfigured = normalizedConnections.some((connection) => connection.id === primaryConnectionId && connection.url);
    const isConnected = primaryConfigured ? Boolean(primaryStatus?.connected) : anyConnected;

    setConnected(isConnected);
    setHaUnavailable(!isConnected);

    if (primaryStatus?.url) {
      setActiveUrl(primaryStatus.url);
      return;
    }

    const firstConnectedUrl = Object.values(statuses).find((state) => state?.connected && state?.url)?.url;
    setActiveUrl(firstConnectedUrl || normalizedConfig.url || '');
  };

  // Load Home Assistant WebSocket library.
  useEffect(() => {
    if (window.HAWS) {
      setLibLoaded(true);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/home-assistant-js-websocket@9.6.0/dist/haws.umd.js';
    script.async = true;
    script.onload = () => setLibLoaded(true);
    document.head.appendChild(script);
  }, []);

  // Bootstrap OAuth tokens for each configured OAuth connection.
  useEffect(() => {
    const isOAuthCallback = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('auth_callback');
    const oauthConnections = normalizedConnections.filter((connection) => connection.authMethod === 'oauth' && connection.url);

    if (!oauthConnections.length || isOAuthCallback) return undefined;

    let cancelled = false;
    Promise.allSettled(
      oauthConnections.map(async (connection) => {
        if (hasOAuthTokens(connection.id)) return;
        await loadTokensForConnection(connection.id).catch(() => undefined);
      }),
    ).finally(() => {
      if (!cancelled) setOauthBootstrapTick((value) => value + 1);
    });

    return () => {
      cancelled = true;
    };
  }, [normalizedConnections]);

  // Router object consumed by the rest of the app.
  const routerConnection = useMemo(() => ({
    __haRouter: true,
    sendMessagePromise: (message) => routeMessageRef.current(message),
    addEventListener: (type, listener) => {
      const bucket = routerListenersRef.current[type];
      if (bucket) bucket.add(listener);
    },
    removeEventListener: (type, listener) => {
      const bucket = routerListenersRef.current[type];
      if (bucket) bucket.delete(listener);
    },
  }), []);

  // Connect to all configured HA connections.
  useEffect(() => {
    const isOAuthCallback = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('auth_callback');

    const configuredConnections = normalizedConnections
      .map((connection, index) => ({ ...connection, __index: index }))
      .filter((connection) => {
        if (!connection.url) return false;
        if (connection.authMethod === 'token') return Boolean(connection.token);
        return hasOAuthTokens(connection.id) || isOAuthCallback;
      });

    activeConnectionMapRef.current = {};
    entityMapsRef.current = {};
    connectionStatusRef.current = {};
    setEntities({});
    setConn(null);
    setOauthExpired(false);

    if (!libLoaded || !configuredConnections.length || !window.HAWS) {
      setConnected(false);
      setHaUnavailable(configuredConnections.length > 0);
      return undefined;
    }

    const { createConnection, createLongLivedTokenAuth, subscribeEntities, getAuth } = window.HAWS;
    const cleanupFns = [];
    let cancelled = false;

    routeMessageRef.current = async (message) => {
      const ids = getMessageEntityIds(message);
      const connectionGroups = new Map();

      if (!ids.length) {
        const fallbackConnection = activeConnectionMapRef.current[primaryConnectionId] || Object.values(activeConnectionMapRef.current)[0] || null;
        if (!fallbackConnection) throw new Error('No Home Assistant connection available');
        return fallbackConnection.sendMessagePromise(message);
      }

      ids.forEach((entityId) => {
        const connectionId = resolveConnectionIdForEntity(entityId);
        if (!connectionGroups.has(connectionId)) connectionGroups.set(connectionId, []);
        connectionGroups.get(connectionId).push(entityId);
      });

      const responses = [];
      for (const [connectionId] of connectionGroups) {
        let targetConn = activeConnectionMapRef.current[connectionId] || null;
        if (!targetConn && connectionId === primaryConnectionId) {
          targetConn = Object.values(activeConnectionMapRef.current)[0] || null;
        }
        if (!targetConn) {
          throw new Error(`Connection unavailable: ${connectionId}`);
        }

        const scopedMessage = buildMessageForConnection(message, connectionId, primaryConnectionId);
        if (!scopedMessage) continue;

        const response = await targetConn.sendMessagePromise(scopedMessage);
        responses.push(response);
      }

      if (!responses.length) {
        throw new Error('No Home Assistant connection matched requested entities');
      }

      return mergeServiceResponses(responses);
    };

    const persistConfigWithActiveUrl = (connectionId, urlUsed) => {
      const sanitizedUrl = String(urlUsed || '').replace(/\/$/, '');
      const nextConnections = normalizedConnections.map((connection) => (
        connection.id === connectionId
          ? { ...connection, url: sanitizedUrl }
          : connection
      ));
      writeStoredHaConfig({
        ...normalizedConfig,
        connections: nextConnections,
        primaryConnectionId,
      });
    };

    const connectSingle = async (connectionConfig) => {
      const connectWithToken = async (url) => {
        const auth = createLongLivedTokenAuth(url, connectionConfig.token);
        const connInstance = await createConnection({ auth });
        return { connInstance, auth, url };
      };

      const connectWithOAuth = async (url) => {
        const auth = await getAuth({
          hassUrl: url,
          saveTokens: (tokenInfo) => saveTokensForConnection(connectionConfig.id, tokenInfo, {
            syncServer: connectionConfig.id === primaryConnectionId,
          }),
          loadTokens: () => Promise.resolve(loadTokensForConnection(connectionConfig.id)),
        });
        const connInstance = await createConnection({ auth });
        return { connInstance, auth, url };
      };

      try {
        let result;
        if (connectionConfig.authMethod === 'oauth') {
          result = await connectWithOAuth(connectionConfig.url);
        } else {
          result = await connectWithToken(connectionConfig.url);
        }

        if (cancelled) {
          result.connInstance.close();
          return;
        }

        const { connInstance, auth, url } = result;
        activeConnectionMapRef.current[connectionConfig.id] = connInstance;
        connectionStatusRef.current[connectionConfig.id] = { connected: true, url };
        persistConfigWithActiveUrl(connectionConfig.id, url);

        if (connectionConfig.id === primaryConnectionId) {
          authRef.current = auth;
          emitRouterEvent('ready');
        }

        setConn(routerConnection);
        refreshConnectionState();

        subscribeEntities(connInstance, (updatedEntities) => {
          if (cancelled) return;
          entityMapsRef.current[connectionConfig.id] = updatedEntities || {};
          setEntities(mergeEntitiesByConnection(entityMapsRef.current, primaryConnectionId, configuredConnectionMapRef.current));
        });

        const onReady = () => {
          if (cancelled) return;
          connectionStatusRef.current[connectionConfig.id] = {
            ...(connectionStatusRef.current[connectionConfig.id] || {}),
            connected: true,
            url,
          };
          setConn(routerConnection);
          if (connectionConfig.id === primaryConnectionId) emitRouterEvent('ready');
          refreshConnectionState();
        };

        const onDisconnected = () => {
          if (cancelled) return;
          connectionStatusRef.current[connectionConfig.id] = {
            ...(connectionStatusRef.current[connectionConfig.id] || {}),
            connected: false,
          };
          if (connectionConfig.id === primaryConnectionId) emitRouterEvent('disconnected');
          refreshConnectionState();
          const hasLiveConnections = Object.values(connectionStatusRef.current).some((state) => Boolean(state?.connected));
          if (!hasLiveConnections) setConn(null);
        };

        connInstance.addEventListener?.('ready', onReady);
        connInstance.addEventListener?.('disconnected', onDisconnected);
        cleanupFns.push(() => {
          connInstance.removeEventListener?.('ready', onReady);
          connInstance.removeEventListener?.('disconnected', onDisconnected);
          connInstance.close();
        });
      } catch (error) {
        if (cancelled) return;

        if (connectionConfig.authMethod === 'oauth' && error?.message?.includes?.('INVALID_AUTH')) {
          clearOAuthTokens({
            connectionId: connectionConfig.id,
            syncServer: connectionConfig.id === primaryConnectionId,
          });
          if (connectionConfig.id === primaryConnectionId) setOauthExpired(true);
        }

        if (connectionConfig.authMethod === 'token' && connectionConfig.fallbackUrl) {
          try {
            const fallbackResult = await connectWithToken(connectionConfig.fallbackUrl);
            if (cancelled) {
              fallbackResult.connInstance.close();
              return;
            }

            const { connInstance, auth, url } = fallbackResult;
            activeConnectionMapRef.current[connectionConfig.id] = connInstance;
            connectionStatusRef.current[connectionConfig.id] = { connected: true, url };
            persistConfigWithActiveUrl(connectionConfig.id, url);

            if (connectionConfig.id === primaryConnectionId) {
              authRef.current = auth;
              emitRouterEvent('ready');
            }

            setConn(routerConnection);
            refreshConnectionState();

            subscribeEntities(connInstance, (updatedEntities) => {
              if (cancelled) return;
              entityMapsRef.current[connectionConfig.id] = updatedEntities || {};
              setEntities(mergeEntitiesByConnection(entityMapsRef.current, primaryConnectionId, configuredConnectionMapRef.current));
            });

            const onReady = () => {
              if (cancelled) return;
              connectionStatusRef.current[connectionConfig.id] = {
                ...(connectionStatusRef.current[connectionConfig.id] || {}),
                connected: true,
                url,
              };
              setConn(routerConnection);
              if (connectionConfig.id === primaryConnectionId) emitRouterEvent('ready');
              refreshConnectionState();
            };

            const onDisconnected = () => {
              if (cancelled) return;
              connectionStatusRef.current[connectionConfig.id] = {
                ...(connectionStatusRef.current[connectionConfig.id] || {}),
                connected: false,
              };
              if (connectionConfig.id === primaryConnectionId) emitRouterEvent('disconnected');
              refreshConnectionState();
              const hasLiveConnections = Object.values(connectionStatusRef.current).some((state) => Boolean(state?.connected));
              if (!hasLiveConnections) setConn(null);
            };

            connInstance.addEventListener?.('ready', onReady);
            connInstance.addEventListener?.('disconnected', onDisconnected);
            cleanupFns.push(() => {
              connInstance.removeEventListener?.('ready', onReady);
              connInstance.removeEventListener?.('disconnected', onDisconnected);
              connInstance.close();
            });
            return;
          } catch {
            // fallback failed, handled below
          }
        }

        connectionStatusRef.current[connectionConfig.id] = {
          ...(connectionStatusRef.current[connectionConfig.id] || {}),
          connected: false,
          url: connectionConfig.url,
        };
        refreshConnectionState();
      }
    };

    Promise.allSettled(configuredConnections.map((connection) => connectSingle(connection)))
      .finally(() => {
        if (cancelled) return;
        refreshConnectionState();
        const hasLiveConnections = Object.values(connectionStatusRef.current).some((state) => Boolean(state?.connected));
        if (!hasLiveConnections) setConn(null);
        if (isOAuthCallback && window.location.search.includes('auth_callback')) {
          window.history.replaceState(null, '', window.location.pathname);
        }
      });

    return () => {
      cancelled = true;
      cleanupFns.forEach((cleanup) => {
        try {
          cleanup();
        } catch {
          // ignore cleanup issues
        }
      });
      activeConnectionMapRef.current = {};
      entityMapsRef.current = {};
      connectionStatusRef.current = {};
      setEntities({});
      setConnected(false);
      setHaUnavailable(false);
      setConn(null);
      authRef.current = null;
    };
  }, [
    libLoaded,
    oauthBootstrapTick,
    normalizedConnections,
    normalizedConfig,
    primaryConnectionId,
    routerConnection,
  ]);

  // Show unavailable banner after delay.
  useEffect(() => {
    if (!haUnavailable) {
      setHaUnavailableVisible(false);
      return;
    }
    const timer = setTimeout(() => setHaUnavailableVisible(true), 2500);
    return () => clearTimeout(timer);
  }, [haUnavailable]);

  const value = {
    entities,
    connected,
    haUnavailable,
    haUnavailableVisible,
    oauthExpired,
    libLoaded,
    conn,
    activeUrl,
    authRef,
    primaryConnectionId,
  };

  return (
    <HomeAssistantContext.Provider value={value}>
      {children}
    </HomeAssistantContext.Provider>
  );
};
