const DEFAULT_PRIMARY_CONNECTION_ID = 'primary';

const safeString = (value) => String(value ?? '').trim();
const IPV4_RE = /^(?:\d{1,3}\.){3}\d{1,3}$/;
const HOSTNAME_RE = /^(?:localhost|[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+)$/i;
const HAS_SCHEME_RE = /^[a-z][a-z0-9+.-]*:\/\//i;

const safeJsonParse = (raw, fallback = null) => {
  if (typeof raw !== 'string' || !raw.trim()) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
};

const normalizeAuthMethod = (value) => (safeString(value).toLowerCase() === 'token' ? 'token' : 'oauth');

const stripPathLikeSegments = (value) => String(value || '').split(/[/?#]/, 1)[0].trim();

const splitBareHostAndPort = (value) => {
  const raw = stripPathLikeSegments(value);
  if (!raw) return { host: '', port: '' };

  if (raw.startsWith('[')) {
    const endIndex = raw.indexOf(']');
    if (endIndex === -1) return { host: raw, port: '' };
    const host = raw.slice(1, endIndex);
    const port = raw.slice(endIndex + 1).replace(/^:/, '');
    return { host, port };
  }

  const colonCount = (raw.match(/:/g) || []).length;
  if (colonCount === 1) {
    const [host, port = ''] = raw.split(':');
    if (/^\d+$/.test(port)) return { host, port };
  }

  return { host: raw, port: '' };
};

const isPrivateIpv4 = (host) => {
  if (!IPV4_RE.test(host)) return false;
  const octets = host.split('.').map((part) => Number.parseInt(part, 10));
  if (octets.some((part) => !Number.isFinite(part) || part < 0 || part > 255)) return false;
  const [a, b] = octets;
  return a === 10
    || a === 127
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168);
};

const isLikelyBareHost = (host) => {
  if (!host) return false;
  if (host.includes(':')) return true;
  return IPV4_RE.test(host) || HOSTNAME_RE.test(host);
};

const shouldDefaultToHttp = (host) => {
  const normalizedHost = String(host || '').trim().toLowerCase();
  return normalizedHost === 'localhost'
    || normalizedHost.endsWith('.local')
    || isPrivateIpv4(normalizedHost)
    || normalizedHost.includes(':');
};

const normalizeHaUrlInput = (value) => {
  const raw = safeString(value);
  if (!raw) return '';

  if (HAS_SCHEME_RE.test(raw)) {
    try {
      const parsed = new URL(raw);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return raw;
      return parsed.toString().replace(/\/$/, '');
    } catch {
      return raw;
    }
  }

  const { host, port } = splitBareHostAndPort(raw);
  if (!isLikelyBareHost(host)) return raw;

  const scheme = shouldDefaultToHttp(host) ? 'http' : 'https';

  try {
    const parsed = new URL(`${scheme}://${raw}`);
    if (!port && scheme === 'http' && shouldDefaultToHttp(parsed.hostname)) {
      parsed.port = '8123';
    }
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return raw;
  }
};

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
    url: normalizeHaUrlInput(candidate?.url),
    fallbackUrl: normalizeHaUrlInput(candidate?.fallbackUrl),
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
