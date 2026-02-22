const DEFAULT_PRIMARY_CONNECTION_ID = 'primary';

const safeString = (value) => String(value ?? '').trim();

const safeJsonParse = (raw, fallback = null) => {
  if (typeof raw !== 'string' || !raw.trim()) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
};

const normalizeAuthMethod = (value) => (safeString(value).toLowerCase() === 'token' ? 'token' : 'oauth');

const normalizeConnectionId = (value, fallback = DEFAULT_PRIMARY_CONNECTION_ID) => {
  const normalized = safeString(value)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || fallback;
};

const normalizeConnection = (candidate, index = 0) => {
  const fallbackId = index === 0 ? DEFAULT_PRIMARY_CONNECTION_ID : `connection-${index + 1}`;
  const id = normalizeConnectionId(candidate?.id || candidate?.connectionId, fallbackId);
  const authMethod = normalizeAuthMethod(candidate?.authMethod);
  const token = authMethod === 'token' ? safeString(candidate?.token) : '';

  return {
    id,
    name: safeString(candidate?.name) || '',
    url: safeString(candidate?.url),
    fallbackUrl: safeString(candidate?.fallbackUrl),
    authMethod,
    token,
    oauthTokens: candidate?.oauthTokens ?? null,
  };
};

const dedupeConnections = (connections = []) => {
  const seen = new Set();
  const result = [];

  connections.forEach((rawConnection, index) => {
    const normalized = normalizeConnection(rawConnection, index);
    let { id } = normalized;
    if (seen.has(id)) {
      let suffix = 2;
      while (seen.has(`${id}-${suffix}`)) suffix += 1;
      id = `${id}-${suffix}`;
    }
    seen.add(id);
    result.push({ ...normalized, id });
  });

  if (!result.length) {
    result.push(normalizeConnection({}, 0));
  }
  return result;
};

const buildLegacyConnection = (row) => {
  const legacyOauthTokens = safeJsonParse(row?.oauth_tokens, null);
  return normalizeConnection({
    id: DEFAULT_PRIMARY_CONNECTION_ID,
    name: 'Primary',
    url: row?.url || '',
    fallbackUrl: row?.fallback_url || '',
    authMethod: row?.auth_method || 'oauth',
    token: row?.token || '',
    oauthTokens: legacyOauthTokens,
  }, 0);
};

const normalizeFromRawConnections = (rawConnections, preferredPrimaryId = '') => {
  const connections = dedupeConnections(Array.isArray(rawConnections) ? rawConnections : []);
  const requestedPrimaryId = normalizeConnectionId(preferredPrimaryId || connections[0]?.id || DEFAULT_PRIMARY_CONNECTION_ID, connections[0]?.id || DEFAULT_PRIMARY_CONNECTION_ID);
  const primaryConnection = connections.find((connection) => connection.id === requestedPrimaryId) || connections[0];
  return { connections, primaryConnectionId: primaryConnection.id };
};

export const parseHaConfigRow = (row) => {
  const legacyConnection = buildLegacyConnection(row);
  const parsed = safeJsonParse(row?.connections_json, null);
  const parsedConnections = Array.isArray(parsed)
    ? parsed
    : (Array.isArray(parsed?.connections) ? parsed.connections : null);
  const parsedPrimaryConnectionId = !Array.isArray(parsed) ? safeString(parsed?.primaryConnectionId) : '';

  const { connections, primaryConnectionId } = parsedConnections?.length
    ? normalizeFromRawConnections(parsedConnections, parsedPrimaryConnectionId)
    : normalizeFromRawConnections([legacyConnection], legacyConnection.id);

  const primaryConnection = connections.find((connection) => connection.id === primaryConnectionId) || connections[0];

  return {
    connections,
    primaryConnectionId,
    url: primaryConnection?.url || '',
    fallbackUrl: primaryConnection?.fallbackUrl || '',
    authMethod: primaryConnection?.authMethod || 'oauth',
    token: primaryConnection?.token || '',
    oauthTokens: primaryConnection?.oauthTokens ?? null,
    updatedAt: row?.updated_at || null,
  };
};

const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj || {}, key);

export const mergeHaConfigPayload = (existingConfig, payload = {}) => {
  const hasConnections = Array.isArray(payload?.connections);

  if (hasConnections) {
    const { connections, primaryConnectionId } = normalizeFromRawConnections(
      payload.connections,
      payload.primaryConnectionId,
    );
    const primaryConnection = connections.find((connection) => connection.id === primaryConnectionId) || connections[0];
    return {
      connections,
      primaryConnectionId,
      url: primaryConnection?.url || '',
      fallbackUrl: primaryConnection?.fallbackUrl || '',
      authMethod: primaryConnection?.authMethod || 'oauth',
      token: primaryConnection?.token || '',
      oauthTokens: primaryConnection?.oauthTokens ?? null,
    };
  }

  const hasUrl = hasOwn(payload, 'url');
  const hasFallbackUrl = hasOwn(payload, 'fallbackUrl');
  const hasAuthMethod = hasOwn(payload, 'authMethod');
  const hasToken = hasOwn(payload, 'token');
  const hasOauthTokens = hasOwn(payload, 'oauthTokens');

  const normalizedPrimaryId = normalizeConnectionId(
    existingConfig?.primaryConnectionId || existingConfig?.connections?.[0]?.id || DEFAULT_PRIMARY_CONNECTION_ID,
    DEFAULT_PRIMARY_CONNECTION_ID,
  );
  const sourceConnections = Array.isArray(existingConfig?.connections) && existingConfig.connections.length
    ? existingConfig.connections
    : [normalizeConnection({}, 0)];

  const connections = sourceConnections.map((connection, index) => {
    if (connection.id !== normalizedPrimaryId) return normalizeConnection(connection, index);

    const authMethod = hasAuthMethod
      ? normalizeAuthMethod(payload?.authMethod)
      : normalizeAuthMethod(connection?.authMethod);

    const token = hasToken
      ? safeString(payload?.token)
      : safeString(connection?.token);

    return normalizeConnection({
      ...connection,
      url: hasUrl ? safeString(payload?.url) : connection?.url,
      fallbackUrl: hasFallbackUrl ? safeString(payload?.fallbackUrl) : connection?.fallbackUrl,
      authMethod,
      token: authMethod === 'token' ? token : '',
      oauthTokens: hasOauthTokens ? (payload?.oauthTokens ?? null) : (connection?.oauthTokens ?? null),
    }, index);
  });

  const deduped = dedupeConnections(connections);
  const primaryConnection = deduped.find((connection) => connection.id === normalizedPrimaryId) || deduped[0];

  return {
    connections: deduped,
    primaryConnectionId: primaryConnection.id,
    url: primaryConnection?.url || '',
    fallbackUrl: primaryConnection?.fallbackUrl || '',
    authMethod: primaryConnection?.authMethod || 'oauth',
    token: primaryConnection?.token || '',
    oauthTokens: primaryConnection?.oauthTokens ?? null,
  };
};

export const serializeHaConnections = (config) => JSON.stringify({
  primaryConnectionId: config.primaryConnectionId,
  connections: Array.isArray(config.connections) ? config.connections : [],
});

