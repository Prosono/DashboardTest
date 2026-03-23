export const ENTITY_CONNECTION_DELIMITER = '@@';
export const DEFAULT_PRIMARY_CONNECTION_ID = 'primary';

const safeString = (value) => String(value ?? '').trim();
const IPV4_RE = /^(?:\d{1,3}\.){3}\d{1,3}$/;
const HOSTNAME_RE = /^(?:localhost|[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+)$/i;
const HAS_SCHEME_RE = /^[a-z][a-z0-9+.-]*:\/\//i;

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

export const normalizeHaUrlInput = (value) => {
  const raw = safeString(value);
  if (!raw) return '';

  if (HAS_SCHEME_RE.test(raw)) {
    try {
      const parsed = new URL(raw);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return raw;
      if (!parsed.port && parsed.protocol === 'http:' && shouldDefaultToHttp(parsed.hostname)) {
        parsed.port = '8123';
      }
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
    // For raw local HA targets, assume the default Home Assistant port when omitted.
    if (!port && scheme === 'http' && shouldDefaultToHttp(parsed.hostname)) {
      parsed.port = '8123';
    }
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return raw;
  }
};

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
    url: normalizeHaUrlInput(candidate.url),
    fallbackUrl: normalizeHaUrlInput(candidate.fallbackUrl),
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
