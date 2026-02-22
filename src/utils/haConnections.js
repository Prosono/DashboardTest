export const ENTITY_CONNECTION_DELIMITER = '@@';
export const DEFAULT_PRIMARY_CONNECTION_ID = 'primary';

const safeString = (value) => String(value ?? '').trim();

export const normalizeAuthMethod = (value) => (safeString(value).toLowerCase() === 'token' ? 'token' : 'oauth');

export const normalizeConnectionId = (value, fallback = DEFAULT_PRIMARY_CONNECTION_ID) => {
  const normalized = safeString(value)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || fallback;
};

export const normalizeConnection = (candidate = {}, index = 0) => {
  const fallbackId = index === 0 ? DEFAULT_PRIMARY_CONNECTION_ID : `connection-${index + 1}`;
  const id = normalizeConnectionId(candidate.id || candidate.connectionId, fallbackId);
  const authMethod = normalizeAuthMethod(candidate.authMethod);
  return {
    id,
    name: safeString(candidate.name),
    url: safeString(candidate.url),
    fallbackUrl: safeString(candidate.fallbackUrl),
    authMethod,
    token: authMethod === 'token' ? safeString(candidate.token) : '',
    oauthTokens: candidate.oauthTokens ?? null,
  };
};

const dedupeConnections = (connections = []) => {
  const seen = new Set();
  const result = [];
  connections.forEach((raw, index) => {
    const normalized = normalizeConnection(raw, index);
    let { id } = normalized;
    if (seen.has(id)) {
      let suffix = 2;
      while (seen.has(`${id}-${suffix}`)) suffix += 1;
      id = `${id}-${suffix}`;
    }
    seen.add(id);
    result.push({ ...normalized, id });
  });
  if (!result.length) result.push(normalizeConnection({}, 0));
  return result;
};

export const normalizeHaConfig = (config = {}) => {
  const hasConnections = Array.isArray(config.connections) && config.connections.length > 0;
  const rawConnections = hasConnections
    ? config.connections
    : [{
      id: DEFAULT_PRIMARY_CONNECTION_ID,
      name: '',
      url: config.url || '',
      fallbackUrl: config.fallbackUrl || '',
      authMethod: config.authMethod || 'oauth',
      token: config.token || '',
      oauthTokens: config.oauthTokens ?? null,
    }];

  const connections = dedupeConnections(rawConnections);
  const requestedPrimaryId = normalizeConnectionId(
    config.primaryConnectionId || connections[0]?.id || DEFAULT_PRIMARY_CONNECTION_ID,
    connections[0]?.id || DEFAULT_PRIMARY_CONNECTION_ID,
  );
  const primaryConnectionId = (connections.find((connection) => connection.id === requestedPrimaryId) || connections[0]).id;
  const primaryConnection = connections.find((connection) => connection.id === primaryConnectionId) || connections[0];

  return {
    url: primaryConnection.url,
    fallbackUrl: primaryConnection.fallbackUrl,
    authMethod: primaryConnection.authMethod,
    token: primaryConnection.token,
    oauthTokens: primaryConnection.oauthTokens,
    connections,
    primaryConnectionId,
    updatedAt: config.updatedAt || null,
  };
};

export const toScopedEntityId = (entityId, connectionId, primaryConnectionId = DEFAULT_PRIMARY_CONNECTION_ID) => {
  const rawEntityId = safeString(entityId);
  if (!rawEntityId) return '';
  const normalizedConnectionId = normalizeConnectionId(connectionId || primaryConnectionId, primaryConnectionId);
  const normalizedPrimaryId = normalizeConnectionId(primaryConnectionId, DEFAULT_PRIMARY_CONNECTION_ID);
  if (normalizedConnectionId === normalizedPrimaryId) return rawEntityId;
  if (rawEntityId.includes(ENTITY_CONNECTION_DELIMITER)) return rawEntityId;
  return `${rawEntityId}${ENTITY_CONNECTION_DELIMITER}${normalizedConnectionId}`;
};

export const parseScopedEntityId = (value, primaryConnectionId = DEFAULT_PRIMARY_CONNECTION_ID) => {
  const raw = safeString(value);
  const normalizedPrimaryId = normalizeConnectionId(primaryConnectionId, DEFAULT_PRIMARY_CONNECTION_ID);
  if (!raw) return { raw: '', entityId: '', connectionId: normalizedPrimaryId, isScoped: false };

  const markerIndex = raw.lastIndexOf(ENTITY_CONNECTION_DELIMITER);
  if (markerIndex === -1) {
    return { raw, entityId: raw, connectionId: normalizedPrimaryId, isScoped: false };
  }

  const entityId = raw.slice(0, markerIndex);
  const suffix = raw.slice(markerIndex + ENTITY_CONNECTION_DELIMITER.length);
  const connectionId = normalizeConnectionId(suffix || normalizedPrimaryId, normalizedPrimaryId);

  return {
    raw,
    entityId: entityId || raw,
    connectionId,
    isScoped: Boolean(entityId && suffix),
  };
};
