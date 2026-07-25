const env = globalThis.process?.env || {};

const MOBILITY_API_KEY = String(
  env.UNIFI_MOBILITY_API_KEY || env.UNIFY_API_KEY || '',
).trim();
const MOBILITY_API_BASE_URL = String(
  env.UNIFI_MOBILITY_API_URL || 'https://api.ui.com/v1/mobility',
).trim().replace(/\/+$/, '');
const MOBILITY_TIMEOUT_MS = Math.max(
  2000,
  Math.min(30000, Number.parseInt(String(env.UNIFI_MOBILITY_TIMEOUT_MS || '12000'), 10) || 12000),
);
const MOBILITY_CACHE_TTL_MS = Math.max(
  10000,
  Math.min(300000, Number.parseInt(String(env.UNIFI_MOBILITY_CACHE_TTL_MS || '60000'), 10) || 60000),
);

let inventoryCache = null;

const toText = (value, maxLength = 240) => (
  typeof value === 'string' || typeof value === 'number'
    ? String(value).trim().slice(0, maxLength)
    : ''
);

const getPath = (source, path) => path
  .split('.')
  .reduce((value, key) => (value && typeof value === 'object' ? value[key] : undefined), source);

const firstText = (source, paths, fallback = '') => {
  for (const path of paths) {
    const value = toText(getPath(source, path));
    if (value) return value;
  }
  return fallback;
};

const firstValue = (source, paths, fallback = null) => {
  for (const path of paths) {
    const value = getPath(source, path);
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return fallback;
};

const toArray = (value) => (Array.isArray(value) ? value : []);

const SENSITIVE_FIELD_PATTERN = /(credential|password|passwd|private.?key|pre.?shared|psk|secret|token)/i;

const sanitizeOperationalValue = (value, depth = 0) => {
  if (depth > 6) return null;
  if (Array.isArray(value)) {
    return value.slice(0, 100).map((entry) => sanitizeOperationalValue(entry, depth + 1));
  }
  if (!value || typeof value !== 'object') {
    return typeof value === 'string' ? value.slice(0, 1000) : value;
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !SENSITIVE_FIELD_PATTERN.test(key))
      .slice(0, 100)
      .map(([key, entry]) => [key, sanitizeOperationalValue(entry, depth + 1)]),
  );
};

const getMobilityConfig = () => ({
  configured: Boolean(MOBILITY_API_KEY),
  baseUrl: MOBILITY_API_BASE_URL,
  cacheTtlMs: MOBILITY_CACHE_TTL_MS,
});

const mobilityRequest = async (path) => {
  if (!MOBILITY_API_KEY) {
    const error = new Error('UNIFI_MOBILITY_API_KEY or UNIFY_API_KEY is not configured');
    error.code = 'MOBILITY_NOT_CONFIGURED';
    error.status = 503;
    throw error;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MOBILITY_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(`${MOBILITY_API_BASE_URL}${path}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'X-API-Key': MOBILITY_API_KEY,
      },
      signal: controller.signal,
    });
  } catch (requestError) {
    const error = new Error(
      requestError?.name === 'AbortError'
        ? 'UniFi Mobility API timed out'
        : `UniFi Mobility API could not be reached: ${requestError?.message || 'network error'}`,
    );
    error.code = requestError?.name === 'AbortError' ? 'MOBILITY_TIMEOUT' : 'MOBILITY_UNREACHABLE';
    error.status = 502;
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  const raw = await response.text();
  let payload = null;
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    payload = {};
  }
  if (!response.ok) {
    const message = firstText(payload, ['message', 'err.msg'], `UniFi Mobility API returned HTTP ${response.status}`);
    const error = new Error(message);
    error.code = firstText(payload, ['code'], `MOBILITY_HTTP_${response.status}`);
    error.traceId = firstText(payload, ['traceId']);
    error.status = response.status;
    throw error;
  }
  return payload && typeof payload === 'object' ? payload : {};
};

const fetchCollection = async (path) => {
  const separator = path.includes('?') ? '&' : '?';
  const output = [];
  let offset = 0;
  for (let page = 0; page < 10; page += 1) {
    const payload = await mobilityRequest(`${path}${separator}limit=200&offset=${offset}`);
    const rows = toArray(payload.data);
    output.push(...rows);
    const total = Number(payload.total);
    if (!Number.isFinite(total) || output.length >= total || rows.length < 200) break;
    offset += rows.length;
  }
  return output;
};

const normalizeWorkspace = (workspace) => ({
  id: firstText(workspace, ['id', 'workspace_id', 'workspaceId', 'uuid']),
  name: firstText(workspace, ['name', 'display_name', 'displayName'], 'UniFi Mobility workspace'),
});

const normalizeDeviceSummary = (device, workspace) => {
  const status = firstText(device, [
    'status',
    'state',
    'connectivity.status',
    'reported_state.status',
    'reportedState.status',
  ], 'UNKNOWN').toUpperCase();
  return {
    id: firstText(device, ['id', 'device_id', 'deviceId', 'uuid']),
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    name: firstText(device, ['name', 'display_name', 'displayName'], 'UMR'),
    model: firstText(device, ['model', 'model_name', 'modelName', 'product.name']),
    macAddress: firstText(device, ['mac', 'mac_address', 'macAddress']).toLowerCase(),
    firmwareVersion: firstText(device, ['firmware', 'firmware_version', 'firmwareVersion', 'version']),
    status,
    online: ['ONLINE', 'CONNECTED', 'UP', 'ACTIVE'].includes(status),
    lastSeenAt: firstText(device, ['last_seen_at', 'lastSeenAt', 'last_seen', 'lastSeen']),
  };
};

const normalizeClient = (client) => {
  const status = firstText(client, ['status', 'state'], 'UNKNOWN').toUpperCase();
  return {
    id: firstText(client, ['id', 'client_id', 'clientId', 'uuid']),
    name: firstText(client, ['name', 'hostname', 'display_name', 'displayName'], 'Ukjent klient'),
    ipAddress: firstText(client, ['ip', 'ip_address', 'ipAddress']),
    macAddress: firstText(client, ['mac', 'mac_address', 'macAddress']).toLowerCase(),
    type: firstText(client, ['type', 'connection_type', 'connectionType']),
    status,
    online: ['ONLINE', 'CONNECTED', 'UP', 'ACTIVE'].includes(status),
    blocked: status === 'BLOCKED' || Boolean(firstValue(client, ['blocked', 'is_blocked', 'isBlocked'], false)),
    connectedAt: firstText(client, ['connected_at', 'connectedAt']),
  };
};

const normalizeDeviceDetail = (device) => {
  const summary = normalizeDeviceSummary(device, { id: '', name: '' });
  const cellular = firstValue(device, ['cellular', 'modem', 'internet.cellular', 'wan.cellular'], {}) || {};
  const wan = firstValue(device, ['wan', 'internet', 'uplink'], {}) || {};
  const vpn = firstValue(device, ['vpn', 'vpns', 'site_to_site_vpn', 'siteToSiteVpn'], null);
  const subscription = firstValue(device, ['subscription', 'cloud_subscription', 'cloudSubscription'], {}) || {};
  const gps = firstValue(device, ['gps', 'location', 'geo'], {}) || {};

  return {
    ...summary,
    wan: {
      ipAddress: firstText(wan, ['ip', 'ip_address', 'ipAddress', 'public_ip', 'publicIp']),
      status: firstText(wan, ['status', 'state']),
      source: firstText(wan, ['source', 'type', 'internet_source', 'internetSource']),
    },
    cellular: {
      carrier: firstText(cellular, ['carrier', 'operator', 'network', 'network_name', 'networkName']),
      technology: firstText(cellular, ['technology', 'radio', 'network_type', 'networkType']),
      signal: firstText(cellular, ['signal', 'signal_strength', 'signalStrength', 'quality']),
      rsrp: firstText(cellular, ['rsrp', 'signal.rsrp']),
      rssi: firstText(cellular, ['rssi', 'signal.rssi']),
      sinr: firstText(cellular, ['sinr', 'signal.sinr']),
      imei: firstText(cellular, ['imei']),
      iccid: firstText(cellular, ['iccid', 'sim.iccid']),
      simStatus: firstText(cellular, ['sim_status', 'simStatus', 'sim.status']),
    },
    // Mobility device details may contain more than status data. Only return a
    // bounded, redacted operational view to the superadmin browser.
    vpn: sanitizeOperationalValue(vpn),
    subscription: {
      status: firstText(subscription, ['status', 'state']),
      active: Boolean(firstValue(subscription, ['active', 'is_active', 'isActive'], false)),
      expiresAt: firstText(subscription, ['expires_at', 'expiresAt', 'expiration']),
    },
    gps: {
      latitude: firstValue(gps, ['latitude', 'lat'], null),
      longitude: firstValue(gps, ['longitude', 'lng', 'lon'], null),
    },
  };
};

export const getUnifiMobilityStatus = () => getMobilityConfig();

export const listUnifiMobilityInventory = async ({ force = false } = {}) => {
  const config = getMobilityConfig();
  if (!config.configured) {
    return {
      ...config,
      connected: false,
      workspaces: [],
      devices: [],
      refreshedAt: null,
    };
  }
  if (!force && inventoryCache && (Date.now() - inventoryCache.cachedAt) < MOBILITY_CACHE_TTL_MS) {
    return inventoryCache.value;
  }

  const workspaceRows = await fetchCollection('/workspaces');
  const workspaces = workspaceRows.map(normalizeWorkspace).filter((workspace) => workspace.id);
  const deviceGroups = await Promise.all(workspaces.map(async (workspace) => {
    const devices = await fetchCollection(`/workspaces/${encodeURIComponent(workspace.id)}/devices`);
    return devices
      .map((device) => normalizeDeviceSummary(device, workspace))
      .filter((device) => device.id);
  }));
  const value = {
    ...config,
    connected: true,
    workspaces,
    devices: deviceGroups.flat(),
    refreshedAt: new Date().toISOString(),
  };
  inventoryCache = {
    cachedAt: Date.now(),
    value,
  };
  return value;
};

export const getUnifiMobilityDeviceSnapshot = async (workspaceId, deviceId) => {
  const safeWorkspaceId = String(workspaceId || '').trim();
  const safeDeviceId = String(deviceId || '').trim();
  if (!safeWorkspaceId || !safeDeviceId) {
    const error = new Error('Mobility workspace and device must both be selected');
    error.code = 'MOBILITY_DEVICE_NOT_SELECTED';
    error.status = 400;
    throw error;
  }
  const basePath = `/workspaces/${encodeURIComponent(safeWorkspaceId)}/devices/${encodeURIComponent(safeDeviceId)}`;
  const [devicePayload, clients] = await Promise.all([
    mobilityRequest(basePath),
    fetchCollection(`${basePath}/clients`),
  ]);
  return {
    configured: true,
    connected: true,
    workspaceId: safeWorkspaceId,
    deviceId: safeDeviceId,
    device: normalizeDeviceDetail(devicePayload.data || {}),
    clients: clients.map(normalizeClient),
    refreshedAt: new Date().toISOString(),
    traceId: firstText(devicePayload, ['traceId']),
  };
};
