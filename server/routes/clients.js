import { Router } from 'express';
import { randomUUID } from 'crypto';
import db, { DEFAULT_CLIENT_ID, normalizeClientId, provisionClientDefaults } from '../db.js';
import { adminRequired, authRequired } from '../auth.js';
import { hashPassword } from '../password.js';
import {
  fetchDashboardVersionRow,
  listDashboardVersions,
  saveDashboardVersionSnapshot,
  toDashboardVersionMeta,
} from '../dashboardVersions.js';
import { mergeHaConfigPayload, parseHaConfigRow, serializeHaConnections } from '../haConfig.js';
import { parseStoredAppActionHistory } from '../appActionHistory.js';
import {
  createClientBackupReadStream,
  deleteClientBackupFile,
  ensureClientBackupDirectory,
  listClientBackupFiles,
} from '../backupStorage.js';
import {
  buildNetworkSiteArtifacts,
  applySiteToRuntimeConfig,
  createNetworkSiteFromInput,
  deriveSiteRuntimeState,
  getNetworkRuntimeConfig,
  networkDefaults,
} from '../networkAdmin.js';
import { getRemoteInstanceHealthOverview } from '../remoteInstanceHealthMonitor.js';
import { PLATFORM_ADMIN_CLIENT_ID, isPlatformAdminClientId } from '../platformAdmin.js';

const router = Router();

const APP_ACTION_HISTORY_KEY_PREFIX = 'app_action_history::';
const normalizeDashboardId = (value) => String(value || 'default').trim().replace(/\s+/g, '_').toLowerCase();
const parseLimit = (value, fallback = 30) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(200, parsed));
};
const normalizeLocationId = (value) => String(value ?? '')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9_-]+/g, '-')
  .replace(/^-+|-+$/g, '');
const resolveBackupLocationRequestId = (req) => {
  const bodyLocationId = typeof req.body === 'object' && req.body !== null
    ? req.body.locationId
    : '';
  return normalizeLocationId(req.query?.locationId || bodyLocationId || '');
};
const parseUrlHost = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const parsed = new globalThis.URL(raw);
    return parsed.host || parsed.hostname || '';
  } catch {
    return raw.replace(/^https?:\/\//i, '').split('/')[0] || raw;
  }
};
const safeParseJson = (value, fallback = null) => {
  try {
    if (!value) return fallback;
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
};
const detectDeviceType = (userAgentValue) => {
  const ua = String(userAgentValue || '').toLowerCase();
  if (!ua) return 'unknown';
  if (/(ipad|tablet|playbook|kindle)/.test(ua)) return 'tablet';
  if (/(mobi|iphone|ipod|android)/.test(ua)) return 'mobile';
  return 'desktop';
};
const shortUserAgent = (userAgentValue) => {
  const raw = String(userAgentValue || '').trim();
  if (!raw) return '';
  if (/iphone/i.test(raw)) return 'iPhone';
  if (/ipad/i.test(raw)) return 'iPad';
  if (/android/i.test(raw)) return 'Android';
  if (/windows/i.test(raw)) return 'Windows';
  if (/mac os|macintosh/i.test(raw)) return 'macOS';
  if (/linux/i.test(raw)) return 'Linux';
  return raw.slice(0, 80);
};
const getConnectionConfigStatus = (connection, clientId = '') => {
  const authMethod = String(connection?.authMethod || 'oauth').trim() === 'token' ? 'token' : 'oauth';
  const url = String(connection?.url || '').trim();
  const token = String(connection?.token || '').trim();
  const oauthTokens = connection?.oauthTokens && typeof connection.oauthTokens === 'object' ? connection.oauthTokens : null;
  const hasOAuthAccessToken = Boolean(
    String(oauthTokens?.access_token || oauthTokens?.accessToken || '').trim(),
  );
  const hasCredentials = authMethod === 'token' ? Boolean(token) : hasOAuthAccessToken;

  if (!url) {
    if (isPlatformAdminClientId(clientId)) {
      return {
        status: 'not_required',
        ready: false,
        isIssue: false,
        authMethod,
      };
    }
    return {
      status: 'missing_url',
      ready: false,
      isIssue: true,
      authMethod,
    };
  }
  if (!hasCredentials) {
    return {
      status: authMethod === 'token' ? 'missing_token' : 'missing_oauth',
      ready: false,
      isIssue: true,
      authMethod,
    };
  }
  return { status: 'ready', ready: true, isIssue: false, authMethod };
};
const getRemoteInstanceKey = (clientId, connectionId) => `${String(clientId || '').trim()}::${String(connectionId || '').trim()}`;
const getClientBackupLocations = (client, parsedConfig) => {
  const primaryConnectionId = String(
    parsedConfig?.primaryConnectionId
    || parsedConfig?.connections?.[0]?.id
    || 'primary',
  ).trim() || 'primary';
  const connections = Array.isArray(parsedConfig?.connections) && parsedConfig.connections.length
    ? parsedConfig.connections
    : [{
      id: primaryConnectionId,
      name: client?.name || 'Primary',
      url: '',
      fallbackUrl: '',
      authMethod: 'oauth',
    }];

  return connections.map((connection, index) => {
    const connectionId = normalizeLocationId(connection?.id || (index === 0 ? 'primary' : `connection-${index + 1}`))
      || (index === 0 ? 'primary' : `connection-${index + 1}`);
    const backupLocationId = normalizeLocationId(connection?.backupLocationId || connectionId) || connectionId;
    return {
      id: backupLocationId,
      connectionId,
      name: String(connection?.name || connectionId || 'Location').trim() || connectionId,
      isPrimary: connectionId === primaryConnectionId,
    };
  });
};
const mapNetworkSiteRow = (row) => ({
  clientId: String(row?.client_id || '').trim(),
  locationId: String(row?.location_id || '').trim(),
  displayName: String(row?.display_name || '').trim(),
  backupLocationId: String(row?.backup_location_id || '').trim(),
  lanSubnet: String(row?.lan_subnet || '').trim(),
  routerIp: String(row?.router_ip || '').trim(),
  haIp: String(row?.ha_ip || '').trim(),
  tunnelIp: String(row?.tunnel_ip || '').trim(),
  domainLabel: String(row?.domain_label || '').trim(),
  domainFqdn: String(row?.domain_fqdn || '').trim(),
  wireGuardPrivateKey: String(row?.wireguard_private_key || '').trim(),
  wireGuardPublicKey: String(row?.wireguard_public_key || '').trim(),
  createdAt: row?.created_at || null,
  updatedAt: row?.updated_at || null,
});
const buildNetworkSiteKey = (clientId, locationId) => `${normalizeClientId(clientId)}::${normalizeLocationId(locationId)}`;
const inferDomainFromConnection = (connection) => {
  const domainSuffix = String(networkDefaults?.domainSuffix || '').trim().toLowerCase();
  const suffix = domainSuffix ? `.${domainSuffix}` : '';
  const candidateHosts = [
    parseUrlHost(connection?.url),
    parseUrlHost(connection?.fallbackUrl),
  ].map((value) => String(value || '').trim().toLowerCase()).filter(Boolean);
  const fqdn = candidateHosts.find((host) => suffix && host.endsWith(suffix)) || '';
  const domainLabel = fqdn && suffix
    ? fqdn.slice(0, -suffix.length).replace(/\.$/, '')
    : '';
  return { domainLabel, domainFqdn: fqdn };
};
const mergeNetworkSiteRecord = (base = {}, saved = {}) => {
  const clientId = normalizeClientId(saved.clientId || base.clientId);
  const locationId = normalizeLocationId(saved.locationId || base.locationId);
  const backupLocationId = normalizeLocationId(saved.backupLocationId || base.backupLocationId || locationId) || locationId;
  const displayName = String(saved.displayName || base.displayName || locationId || clientId || 'Location').trim();
  const domainLabel = normalizeLocationId(saved.domainLabel || base.domainLabel || locationId);
  const domainFqdn = String(
    saved.domainFqdn
    || base.domainFqdn
    || (domainLabel && networkDefaults?.domainSuffix ? `${domainLabel}.${networkDefaults.domainSuffix}` : ''),
  ).trim().toLowerCase();
  return {
    clientId,
    locationId,
    displayName,
    backupLocationId,
    lanSubnet: String(saved.lanSubnet || base.lanSubnet || '').trim(),
    routerIp: String(saved.routerIp || base.routerIp || '').trim(),
    haIp: String(saved.haIp || base.haIp || '').trim(),
    tunnelIp: String(saved.tunnelIp || base.tunnelIp || '').trim(),
    domainLabel,
    domainFqdn,
    wireGuardPrivateKey: String(saved.wireGuardPrivateKey || base.wireGuardPrivateKey || '').trim(),
    wireGuardPublicKey: String(saved.wireGuardPublicKey || base.wireGuardPublicKey || '').trim(),
    createdAt: saved.createdAt || base.createdAt || null,
    updatedAt: saved.updatedAt || base.updatedAt || null,
  };
};
const toPublicNetworkSite = (site, runtimeConfig = null) => {
  const runtimeState = runtimeConfig ? deriveSiteRuntimeState(site, runtimeConfig) : {
    wireGuardApplied: false,
    caddyApplied: false,
    matchedPeer: null,
    matchedCaddy: null,
  };
  const backupRoot = String(networkDefaults?.backupRoot || '').replace(/\/$/, '');
  const backupDirectoryPath = site.clientId && site.backupLocationId
    ? `${backupRoot}/${site.clientId}/${site.backupLocationId}`
    : '';
  return {
    clientId: site.clientId,
    locationId: site.locationId,
    id: site.locationId,
    name: site.displayName || site.locationId,
    displayName: site.displayName || site.locationId,
    backupLocationId: site.backupLocationId || site.locationId,
    lanSubnet: site.lanSubnet,
    routerIp: site.routerIp,
    haIp: site.haIp,
    tunnelIp: site.tunnelIp,
    domainLabel: site.domainLabel,
    domainFqdn: site.domainFqdn,
    backupDirectoryPath,
    hasWireGuardKeys: Boolean(site.wireGuardPrivateKey && site.wireGuardPublicKey),
    wireGuardPublicKey: site.wireGuardPublicKey || '',
    createdAt: site.createdAt || null,
    updatedAt: site.updatedAt || null,
    runtime: {
      wireGuardApplied: Boolean(runtimeState.wireGuardApplied),
      caddyApplied: Boolean(runtimeState.caddyApplied),
      matchedPeer: runtimeState.matchedPeer || null,
      matchedCaddy: runtimeState.matchedCaddy || null,
    },
  };
};
const sanitizeRuntimeConfigForResponse = (runtimeConfig = {}) => ({
  server: runtimeConfig?.server || {},
  files: runtimeConfig?.files || {},
  commands: runtimeConfig?.commands || {},
  active: {
    wireGuardPeers: Array.isArray(runtimeConfig?.active?.wireGuardPeers) ? runtimeConfig.active.wireGuardPeers : [],
    caddySites: Array.isArray(runtimeConfig?.active?.caddySites) ? runtimeConfig.active.caddySites : [],
  },
});
const loadNetworkOverviewData = () => {
  const runtimeConfig = getNetworkRuntimeConfig();
  const clients = db.prepare(`
    SELECT
      c.id,
      c.name,
      c.updated_at
    FROM clients c
    ORDER BY c.id ASC
  `).all().filter((client) => !isPlatformAdminClientId(client.id));
  const haConfigRows = db.prepare('SELECT * FROM ha_config').all();
  const haConfigByClient = new Map(haConfigRows.map((row) => [row.client_id, row]));
  const savedRows = db.prepare(`
    SELECT
      client_id,
      location_id,
      display_name,
      backup_location_id,
      lan_subnet,
      router_ip,
      ha_ip,
      tunnel_ip,
      domain_label,
      domain_fqdn,
      wireguard_private_key,
      wireguard_public_key,
      created_at,
      updated_at
    FROM network_sites
    ORDER BY client_id ASC, location_id ASC
  `).all().map(mapNetworkSiteRow);
  const savedByKey = new Map(savedRows.map((row) => [buildNetworkSiteKey(row.clientId, row.locationId), row]));
  const usedSavedKeys = new Set();

  const clientSummaries = clients.map((client) => {
    const parsedConfig = parseHaConfigRow(haConfigByClient.get(client.id));
    const connections = Array.isArray(parsedConfig?.connections) ? parsedConfig.connections : [];
    const inferredLocations = connections.map((connection, index) => {
      const fallbackLocationId = index === 0 ? 'primary' : `connection-${index + 1}`;
      const locationId = normalizeLocationId(connection?.id || fallbackLocationId) || fallbackLocationId;
      const inferredDomain = inferDomainFromConnection(connection);
      const base = {
        clientId: client.id,
        locationId,
        displayName: String(connection?.name || locationId).trim() || locationId,
        backupLocationId: normalizeLocationId(connection?.backupLocationId || locationId) || locationId,
        domainLabel: inferredDomain.domainLabel || locationId,
        domainFqdn: inferredDomain.domainFqdn || '',
      };
      const saved = savedByKey.get(buildNetworkSiteKey(client.id, locationId)) || null;
      if (saved) usedSavedKeys.add(buildNetworkSiteKey(client.id, locationId));
      return mergeNetworkSiteRecord(base, saved || {});
    });

    const additionalSaved = savedRows
      .filter((row) => row.clientId === client.id && !usedSavedKeys.has(buildNetworkSiteKey(row.clientId, row.locationId)))
      .map((row) => {
        usedSavedKeys.add(buildNetworkSiteKey(row.clientId, row.locationId));
        return mergeNetworkSiteRecord({
          clientId: client.id,
          locationId: row.locationId,
          displayName: row.displayName || row.locationId,
          backupLocationId: row.backupLocationId || row.locationId,
          domainLabel: row.domainLabel || row.locationId,
          domainFqdn: row.domainFqdn || '',
        }, row);
      });

    const mergedLocations = [...inferredLocations, ...additionalSaved]
      .map((site) => toPublicNetworkSite(site, runtimeConfig))
      .sort((a, b) => String(a.displayName || a.locationId).localeCompare(String(b.displayName || b.locationId), 'nb'));

    return {
      id: client.id,
      name: client.name,
      updatedAt: client.updated_at,
      locationCount: mergedLocations.length,
      appliedWireGuardCount: mergedLocations.filter((location) => location.runtime?.wireGuardApplied).length,
      appliedCaddyCount: mergedLocations.filter((location) => location.runtime?.caddyApplied).length,
      locations: mergedLocations,
    };
  });

  const clientById = new Map(clientSummaries.map((client) => [client.id, client]));

  savedRows.forEach((row) => {
    if (usedSavedKeys.has(buildNetworkSiteKey(row.clientId, row.locationId))) return;
    const fallbackClient = clientById.get(row.clientId);
    const location = toPublicNetworkSite(mergeNetworkSiteRecord({
      clientId: row.clientId,
      locationId: row.locationId,
      displayName: row.displayName || row.locationId,
      backupLocationId: row.backupLocationId || row.locationId,
      domainLabel: row.domainLabel || row.locationId,
      domainFqdn: row.domainFqdn || '',
    }, row), runtimeConfig);
    if (fallbackClient) {
      fallbackClient.locations.push(location);
      fallbackClient.locationCount = fallbackClient.locations.length;
      fallbackClient.appliedWireGuardCount = fallbackClient.locations.filter((entry) => entry.runtime?.wireGuardApplied).length;
      fallbackClient.appliedCaddyCount = fallbackClient.locations.filter((entry) => entry.runtime?.caddyApplied).length;
      return;
    }
    clientSummaries.push({
      id: row.clientId,
      name: row.clientId,
      updatedAt: row.updatedAt || null,
      locationCount: 1,
      appliedWireGuardCount: location.runtime?.wireGuardApplied ? 1 : 0,
      appliedCaddyCount: location.runtime?.caddyApplied ? 1 : 0,
      locations: [location],
    });
  });

  clientSummaries.sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id), 'nb'));

  return {
    generatedAt: new Date().toISOString(),
    runtimeConfig,
    clients: clientSummaries,
    totals: clientSummaries.reduce((acc, client) => ({
      clients: acc.clients + 1,
      locations: acc.locations + Number(client.locationCount || 0),
      appliedWireGuard: acc.appliedWireGuard + Number(client.appliedWireGuardCount || 0),
      appliedCaddy: acc.appliedCaddy + Number(client.appliedCaddyCount || 0),
    }), {
      clients: 0,
      locations: 0,
      appliedWireGuard: 0,
      appliedCaddy: 0,
    }),
  };
};
const resolveNetworkSiteFromOverview = (overview, clientIdRaw, locationIdRaw) => {
  const clientId = normalizeClientId(clientIdRaw);
  const locationId = normalizeLocationId(locationIdRaw);
  const client = Array.isArray(overview?.clients)
    ? overview.clients.find((entry) => entry.id === clientId)
    : null;
  if (!client) return null;
  const site = Array.isArray(client.locations)
    ? client.locations.find((entry) => entry.locationId === locationId)
    : null;
  if (!site) return null;
  return { client, site };
};
const resolveRequestedLocationMeta = (locations, locationIdRaw) => {
  const requestedLocationId = normalizeLocationId(locationIdRaw);
  if (!requestedLocationId) return locations[0] || null;
  return locations.find((location) => location.id === requestedLocationId) || {
    id: requestedLocationId,
    name: requestedLocationId,
    isPrimary: false,
  };
};
const toDashboardMeta = (row) => ({
  id: row.id,
  clientId: row.client_id,
  name: row.name,
  updatedAt: row.updated_at,
  createdAt: row.created_at,
});

const platformAdminRequired = (req, res, next) => {
  if (!req.auth?.user || req.auth.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin only' });
  }
  if (!req.auth.user.isPlatformAdmin) {
    return res.status(403).json({ error: 'Platform admin only' });
  }
  return next();
};

router.use(authRequired, adminRequired, platformAdminRequired);

router.get('/', (_req, res) => {
  const clients = db.prepare(`
    SELECT
      c.id,
      c.name,
      c.created_at,
      c.updated_at,
      (SELECT COUNT(*) FROM users u WHERE u.client_id = c.id) AS user_count,
      (SELECT COUNT(*) FROM users u WHERE u.client_id = c.id AND u.role = 'admin') AS admin_count
    FROM clients c
    ORDER BY c.id ASC
  `).all();

  return res.json({
    clients: clients.map((c) => ({
      id: c.id,
      name: c.name,
      userCount: Number(c.user_count || 0),
      adminCount: Number(c.admin_count || 0),
      createdAt: c.created_at,
      updatedAt: c.updated_at,
    })),
  });
});

router.get('/overview', (req, res) => {
  const logLimit = parseLimit(req.query?.logLimit, 50);
  const clients = db.prepare(`
    SELECT
      c.id,
      c.name,
      c.created_at,
      c.updated_at,
      (SELECT COUNT(*) FROM users u WHERE u.client_id = c.id) AS user_count,
      (SELECT COUNT(*) FROM users u WHERE u.client_id = c.id AND u.role = 'admin') AS admin_count
    FROM clients c
    ORDER BY c.id ASC
  `).all();

  const dashboardCountRows = db.prepare(`
    SELECT client_id, COUNT(*) AS total
    FROM dashboards
    GROUP BY client_id
  `).all();
  const dashboardCounts = new Map(
    dashboardCountRows.map((row) => [row.client_id, Number(row.total || 0)]),
  );

  const sessionCountRows = db.prepare(`
    SELECT
      COALESCE(NULLIF(s.scope_client_id, ''), u.client_id) AS client_id,
      COUNT(*) AS total
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE datetime(s.expires_at) > datetime('now')
    GROUP BY COALESCE(NULLIF(s.scope_client_id, ''), u.client_id)
  `).all();
  const sessionCounts = new Map(
    sessionCountRows.map((row) => [row.client_id, Number(row.total || 0)]),
  );
  const loggedInUserCountRows = db.prepare(`
    SELECT
      COALESCE(NULLIF(s.scope_client_id, ''), u.client_id) AS client_id,
      COUNT(DISTINCT s.user_id) AS total
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE datetime(s.expires_at) > datetime('now')
    GROUP BY COALESCE(NULLIF(s.scope_client_id, ''), u.client_id)
  `).all();
  const loggedInUserCounts = new Map(
    loggedInUserCountRows.map((row) => [row.client_id, Number(row.total || 0)]),
  );

  const activeSessionRows = db.prepare(`
    SELECT
      s.token,
      s.user_id,
      s.scope_client_id,
      s.is_super_admin,
      s.session_username,
      s.created_at,
      s.expires_at,
      s.last_seen_at,
      s.last_activity_at,
      s.last_activity_path,
      s.last_activity_label,
      s.last_activity_data,
      s.ip_address,
      s.user_agent,
      u.client_id AS user_client_id,
      u.username,
      u.role
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE datetime(s.expires_at) > datetime('now')
    ORDER BY COALESCE(s.last_activity_at, s.last_seen_at, s.created_at) DESC
  `).all();
  const onlineCutoffMs = Date.now() - (5 * 60 * 1000);
  const sessionsByClient = new Map();
  const allSessionOverview = activeSessionRows.map((row) => {
    const resolvedClientId = String(row.scope_client_id || row.user_client_id || '').trim();
    const activityData = safeParseJson(row.last_activity_data, {});
    const lastSeenAt = row.last_seen_at || row.created_at || null;
    const lastActivityAt = row.last_activity_at || lastSeenAt || null;
    const lastSeenMs = Date.parse(String(lastSeenAt || ''));
    const isOnline = Number.isFinite(lastSeenMs) ? lastSeenMs >= onlineCutoffMs : false;
    const sessionOverview = {
      id: String(row.token || '').slice(0, 12),
      tokenPreview: String(row.token || '').slice(0, 12),
      userId: row.user_id,
      username: row.session_username || row.username || row.user_id,
      role: Number(row.is_super_admin || 0) === 1 ? 'admin' : row.role,
      isPlatformAdmin: Number(row.is_super_admin || 0) === 1,
      clientId: resolvedClientId,
      ipAddress: String(row.ip_address || '').trim(),
      userAgent: String(row.user_agent || '').trim(),
      deviceType: detectDeviceType(row.user_agent),
      deviceLabel: shortUserAgent(row.user_agent),
      createdAt: row.created_at || null,
      expiresAt: row.expires_at || null,
      lastSeenAt,
      lastActivityAt,
      lastActivityPath: String(row.last_activity_path || '').trim(),
      lastActivityLabel: String(row.last_activity_label || '').trim(),
      lastActivityData: activityData && typeof activityData === 'object' ? activityData : {},
      isOnline,
    };
    const existing = sessionsByClient.get(resolvedClientId) || [];
    existing.push(sessionOverview);
    sessionsByClient.set(resolvedClientId, existing);
    return sessionOverview;
  });

  const haConfigRows = db.prepare('SELECT * FROM ha_config').all();
  const haConfigByClient = new Map(haConfigRows.map((row) => [row.client_id, row]));

  const recentVersionRows = db.prepare(`
    SELECT
      dv.version_id,
      dv.client_id,
      dv.dashboard_id,
      dv.created_by,
      dv.created_at,
      dv.source_updated_at,
      COALESCE(u.username, '') AS created_by_username
    FROM dashboard_versions dv
    LEFT JOIN users u ON u.id = dv.created_by
    ORDER BY dv.created_at DESC
    LIMIT ?
  `).all(logLimit);
  const appActionRows = db.prepare(`
    SELECT key, value, updated_at
    FROM system_settings
    WHERE key LIKE ?
  `).all(`${APP_ACTION_HISTORY_KEY_PREFIX}%`);
  const appActionsByClient = new Map();
  appActionRows.forEach((row) => {
    const key = String(row?.key || '');
    if (!key.startsWith(APP_ACTION_HISTORY_KEY_PREFIX)) return;
    const rawClientId = key.slice(APP_ACTION_HISTORY_KEY_PREFIX.length);
    const clientId = normalizeClientId(rawClientId) || DEFAULT_CLIENT_ID;
    const parsed = parseStoredAppActionHistory(row?.value || '');
    appActionsByClient.set(clientId, Array.isArray(parsed) ? parsed : []);
  });

  const clientOverview = clients.map((client) => {
    const parsedConfig = parseHaConfigRow(haConfigByClient.get(client.id));
    const primaryConnectionId = String(
      parsedConfig?.primaryConnectionId
      || parsedConfig?.connections?.[0]?.id
      || 'primary',
    ).trim() || 'primary';
    const connections = Array.isArray(parsedConfig?.connections) ? parsedConfig.connections : [];
    const connectionOverview = connections.map((connection) => {
      const connectionId = String(connection?.id || 'primary').trim() || 'primary';
      const statusMeta = getConnectionConfigStatus(connection, client.id);
      return {
        id: connectionId,
        name: String(connection?.name || connectionId || 'Connection').trim() || connectionId,
        isPrimary: connectionId === primaryConnectionId,
        authMethod: statusMeta.authMethod,
        status: statusMeta.status,
        ready: statusMeta.ready,
        isIssue: statusMeta.isIssue !== false,
        urlHost: parseUrlHost(connection?.url),
        fallbackUrlHost: parseUrlHost(connection?.fallbackUrl),
        hasUrl: Boolean(String(connection?.url || '').trim()),
        hasFallbackUrl: Boolean(String(connection?.fallbackUrl || '').trim()),
        updatedAt: parsedConfig?.updatedAt || client.updated_at || null,
      };
    });
    const readyConnectionCount = connectionOverview.filter((connection) => connection.ready).length;
    const issueConnectionCount = connectionOverview.filter((connection) => connection.isIssue).length;
    const dashboardCount = Number(dashboardCounts.get(client.id) || 0);
    const activeSessionCount = Number(sessionCounts.get(client.id) || 0);
    const loggedInUserCount = Number(loggedInUserCounts.get(client.id) || 0);
    const appActionCount = Number((appActionsByClient.get(client.id) || []).length || 0);
    const sessionOverview = Array.isArray(sessionsByClient.get(client.id)) ? sessionsByClient.get(client.id) : [];
    const onlineSessionCount = sessionOverview.filter((session) => session.isOnline).length;

    return {
      id: client.id,
      name: client.name,
      createdAt: client.created_at,
      updatedAt: client.updated_at,
      userCount: Number(client.user_count || 0),
      adminCount: Number(client.admin_count || 0),
      dashboardCount,
      activeSessionCount,
      onlineSessionCount,
      loggedInUserCount,
      appActionCount,
      primaryConnectionId,
      connectionCount: connectionOverview.length,
      readyConnectionCount,
      issueConnectionCount,
      connections: connectionOverview,
      sessions: sessionOverview,
    };
  });

  const totals = clientOverview.reduce((acc, client) => ({
    clients: acc.clients + 1,
    users: acc.users + Number(client.userCount || 0),
    admins: acc.admins + Number(client.adminCount || 0),
    dashboards: acc.dashboards + Number(client.dashboardCount || 0),
    activeSessions: acc.activeSessions + Number(client.activeSessionCount || 0),
    onlineSessions: acc.onlineSessions + Number(client.onlineSessionCount || 0),
    loggedInUsers: acc.loggedInUsers + Number(client.loggedInUserCount || 0),
    appActions: acc.appActions + Number(client.appActionCount || 0),
    connections: acc.connections + Number(client.connectionCount || 0),
    readyConnections: acc.readyConnections + Number(client.readyConnectionCount || 0),
    issueConnections: acc.issueConnections + Number(client.issueConnectionCount || 0),
  }), {
    clients: 0,
    users: 0,
    admins: 0,
    dashboards: 0,
    activeSessions: 0,
    onlineSessions: 0,
    loggedInUsers: 0,
    appActions: 0,
    connections: 0,
    readyConnections: 0,
    issueConnections: 0,
  });

  const recentLogs = recentVersionRows.map((row) => ({
    id: row.version_id,
    type: 'dashboard_version',
    clientId: row.client_id,
    dashboardId: row.dashboard_id,
    createdAt: row.created_at,
    sourceUpdatedAt: row.source_updated_at || null,
    createdBy: row.created_by || '',
    createdByUsername: row.created_by_username || '',
  }));
  const recentAppActions = clientOverview
    .flatMap((client) => {
      const entries = appActionsByClient.get(client.id) || [];
      return entries.map((entry) => ({
        ...entry,
        clientId: client.id,
        clientName: client.name || client.id,
      }));
    })
    .sort((a, b) => {
      const aTs = Date.parse(String(a?.createdAt || ''));
      const bTs = Date.parse(String(b?.createdAt || ''));
      return (Number.isFinite(bTs) ? bTs : 0) - (Number.isFinite(aTs) ? aTs : 0);
    })
    .slice(0, logLimit);

  const instances = clientOverview.flatMap((client) => (
    (Array.isArray(client.connections) ? client.connections : []).map((connection) => ({
      clientId: client.id,
      clientName: client.name,
      clientUpdatedAt: client.updatedAt,
      connectionId: connection.id,
      connectionName: connection.name,
      isPrimary: Boolean(connection.isPrimary),
      authMethod: connection.authMethod,
      status: connection.status,
      ready: Boolean(connection.ready),
      isIssue: Boolean(connection.isIssue),
      urlHost: connection.urlHost || '',
      fallbackUrlHost: connection.fallbackUrlHost || '',
      hasUrl: Boolean(connection.hasUrl),
      hasFallbackUrl: Boolean(connection.hasFallbackUrl),
      updatedAt: connection.updatedAt || client.updatedAt || null,
    }))
  ));
  const remoteHealth = getRemoteInstanceHealthOverview();
  const remoteHealthMap = new Map(
    (Array.isArray(remoteHealth?.instances) ? remoteHealth.instances : [])
      .map((entry) => [getRemoteInstanceKey(entry.clientId, entry.connectionId), entry]),
  );
  const instancesWithRemoteHealth = instances.map((instance) => {
    const remoteState = remoteHealthMap.get(getRemoteInstanceKey(instance.clientId, instance.connectionId));
    return {
      ...instance,
      remoteHealth: remoteState || {
        monitored: false,
        status: 'not_monitored',
        lastCheckedAt: null,
        host: '',
        checkedUrl: '',
        error: '',
      },
    };
  });
  const issues = instancesWithRemoteHealth.filter((instance) => instance.isIssue);

  return res.json({
    generatedAt: new Date().toISOString(),
    totals: {
      ...totals,
      logs: recentLogs.length,
      appActions: Number(totals.appActions || 0),
    },
    clients: clientOverview,
    sessions: allSessionOverview,
    instances: instancesWithRemoteHealth,
    issues,
    remoteHealth,
    recentLogs,
    recentAppActions,
  });
});

router.get('/backups/overview', async (_req, res) => {
  const clients = db.prepare(`
    SELECT
      c.id,
      c.name,
      c.updated_at
    FROM clients c
    ORDER BY c.id ASC
  `).all().filter((client) => !isPlatformAdminClientId(client.id));
  const haConfigRows = db.prepare('SELECT * FROM ha_config').all();
  const haConfigByClient = new Map(haConfigRows.map((row) => [row.client_id, row]));

  try {
    const clientSummaries = await Promise.all(
      clients.map(async (client) => {
        const parsedConfig = parseHaConfigRow(haConfigByClient.get(client.id));
        const locations = getClientBackupLocations(client, parsedConfig);
        const locationSummaries = await Promise.all(
          locations.map(async (location) => {
            const backupInfo = await listClientBackupFiles(client.id, location.id);
            return {
              id: location.id,
              connectionId: location.connectionId,
              name: location.name,
              isPrimary: Boolean(location.isPrimary),
              backupDirectoryExists: Boolean(backupInfo.exists),
              backupDirectoryPath: backupInfo.displayDirectoryPath,
              backupRootPath: backupInfo.displayRootPath,
              backupFileCount: Number(backupInfo.fileCount || 0),
              totalBackupBytes: Number(backupInfo.totalBytes || 0),
              latestBackupAt: backupInfo.latestBackupAt || null,
            };
          }),
        );

        const backupFileCount = locationSummaries.reduce((sum, location) => sum + Number(location.backupFileCount || 0), 0);
        const totalBackupBytes = locationSummaries.reduce((sum, location) => sum + Number(location.totalBackupBytes || 0), 0);
        const latestBackupAt = locationSummaries.reduce((latest, location) => {
          const currentTs = Date.parse(String(location.latestBackupAt || ''));
          const latestTs = Date.parse(String(latest || ''));
          if (!Number.isFinite(currentTs)) return latest;
          if (!Number.isFinite(latestTs) || currentTs > latestTs) return location.latestBackupAt;
          return latest;
        }, null);

        return {
          id: client.id,
          name: client.name,
          updatedAt: client.updated_at,
          locationCount: locationSummaries.length,
          readyLocationCount: locationSummaries.filter((location) => location.backupDirectoryExists).length,
          missingLocationCount: locationSummaries.filter((location) => !location.backupDirectoryExists).length,
          backupFileCount,
          totalBackupBytes,
          latestBackupAt,
          locations: locationSummaries,
        };
      }),
    );

    const totals = clientSummaries.reduce((acc, client) => ({
      clients: acc.clients + 1,
      locations: acc.locations + Number(client.locationCount || 0),
      readyDirectories: acc.readyDirectories + Number(client.readyLocationCount || 0),
      missingDirectories: acc.missingDirectories + Number(client.missingLocationCount || 0),
      backupFiles: acc.backupFiles + Number(client.backupFileCount || 0),
      totalBackupBytes: acc.totalBackupBytes + Number(client.totalBackupBytes || 0),
    }), {
      clients: 0,
      locations: 0,
      readyDirectories: 0,
      missingDirectories: 0,
      backupFiles: 0,
      totalBackupBytes: 0,
    });

    return res.json({
      generatedAt: new Date().toISOString(),
      totals,
      clients: clientSummaries,
    });
  } catch (error) {
    return res.status(500).json({ error: error?.message || 'Failed to load backup overview' });
  }
});

router.get('/network/overview', (_req, res) => {
  try {
    const overview = loadNetworkOverviewData();
    const runtime = sanitizeRuntimeConfigForResponse(overview.runtimeConfig);
    return res.json({
      generatedAt: overview.generatedAt,
      totals: overview.totals,
      server: runtime.server,
      files: runtime.files,
      active: runtime.active,
      commands: runtime.commands,
      clients: overview.clients,
    });
  } catch (error) {
    return res.status(500).json({ error: error?.message || 'Failed to load network overview' });
  }
});

router.get('/network/sites/:clientId/:locationId', (req, res) => {
  const clientId = normalizeClientId(req.params.clientId);
  const locationId = normalizeLocationId(req.params.locationId);
  if (!clientId || !locationId) return res.status(400).json({ error: 'Valid clientId and locationId are required' });

  try {
    const overview = loadNetworkOverviewData();
    const resolved = resolveNetworkSiteFromOverview(overview, clientId, locationId);
    if (!resolved) return res.status(404).json({ error: 'Network location not found' });

    const savedRow = db.prepare(`
      SELECT
        client_id,
        location_id,
        display_name,
        backup_location_id,
        lan_subnet,
        router_ip,
        ha_ip,
        tunnel_ip,
        domain_label,
        domain_fqdn,
        wireguard_private_key,
        wireguard_public_key,
        created_at,
        updated_at
      FROM network_sites
      WHERE client_id = ? AND location_id = ?
    `).get(clientId, locationId);
    const mergedSite = mergeNetworkSiteRecord(resolved.site, savedRow ? mapNetworkSiteRow(savedRow) : {});
    const artifacts = buildNetworkSiteArtifacts(mergedSite);
    return res.json({
      client: {
        id: resolved.client.id,
        name: resolved.client.name,
      },
      site: toPublicNetworkSite(mergedSite, overview.runtimeConfig),
      persisted: Boolean(savedRow),
      artifacts,
      runtime: sanitizeRuntimeConfigForResponse(overview.runtimeConfig),
    });
  } catch (error) {
    return res.status(500).json({ error: error?.message || 'Failed to load network location' });
  }
});

router.post('/network/sites', (req, res) => {
  const clientId = normalizeClientId(req.body?.clientId);
  const locationId = normalizeLocationId(req.body?.locationId);
  if (!clientId || !locationId) return res.status(400).json({ error: 'Valid clientId and locationId are required' });

  const client = db.prepare('SELECT id, name FROM clients WHERE id = ?').get(clientId);
  if (!client) return res.status(404).json({ error: 'Client not found' });

  try {
    const overview = loadNetworkOverviewData();
    const resolved = resolveNetworkSiteFromOverview(overview, clientId, locationId);
    const savedRow = db.prepare(`
      SELECT
        client_id,
        location_id,
        display_name,
        backup_location_id,
        lan_subnet,
        router_ip,
        ha_ip,
        tunnel_ip,
        domain_label,
        domain_fqdn,
        wireguard_private_key,
        wireguard_public_key,
        created_at,
        updated_at
      FROM network_sites
      WHERE client_id = ? AND location_id = ?
    `).get(clientId, locationId);
    const fallback = mergeNetworkSiteRecord(
      resolved?.site || {
        clientId,
        locationId,
        displayName: locationId,
        backupLocationId: locationId,
        domainLabel: locationId,
      },
      savedRow ? mapNetworkSiteRow(savedRow) : {},
    );
    const nextSite = createNetworkSiteFromInput({
      ...req.body,
      clientId,
      locationId,
    }, fallback);
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO network_sites (
        client_id,
        location_id,
        display_name,
        backup_location_id,
        lan_subnet,
        router_ip,
        ha_ip,
        tunnel_ip,
        domain_label,
        domain_fqdn,
        wireguard_private_key,
        wireguard_public_key,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(client_id, location_id) DO UPDATE SET
        display_name = excluded.display_name,
        backup_location_id = excluded.backup_location_id,
        lan_subnet = excluded.lan_subnet,
        router_ip = excluded.router_ip,
        ha_ip = excluded.ha_ip,
        tunnel_ip = excluded.tunnel_ip,
        domain_label = excluded.domain_label,
        domain_fqdn = excluded.domain_fqdn,
        wireguard_private_key = excluded.wireguard_private_key,
        wireguard_public_key = excluded.wireguard_public_key,
        updated_at = excluded.updated_at
    `).run(
      nextSite.clientId,
      nextSite.locationId,
      nextSite.displayName,
      nextSite.backupLocationId,
      nextSite.lanSubnet,
      nextSite.routerIp,
      nextSite.haIp,
      nextSite.tunnelIp,
      nextSite.domainLabel,
      nextSite.domainFqdn,
      nextSite.wireGuardPrivateKey,
      nextSite.wireGuardPublicKey,
      savedRow?.created_at || now,
      now,
    );

    const refreshedOverview = loadNetworkOverviewData();
    const refreshedResolved = resolveNetworkSiteFromOverview(refreshedOverview, clientId, locationId);
    const artifacts = buildNetworkSiteArtifacts(nextSite);
    return res.json({
      client: {
        id: client.id,
        name: client.name,
      },
      site: toPublicNetworkSite(refreshedResolved?.site || nextSite, refreshedOverview.runtimeConfig),
      persisted: true,
      artifacts,
      runtime: sanitizeRuntimeConfigForResponse(refreshedOverview.runtimeConfig),
    });
  } catch (error) {
    return res.status(400).json({ error: error?.message || 'Failed to save network location' });
  }
});

router.post('/network/sites/:clientId/:locationId/apply', (req, res) => {
  const clientId = normalizeClientId(req.params.clientId);
  const locationId = normalizeLocationId(req.params.locationId);
  const target = String(req.body?.target || 'all').trim().toLowerCase() || 'all';
  if (!clientId || !locationId) return res.status(400).json({ error: 'Valid clientId and locationId are required' });

  const row = db.prepare(`
    SELECT
      client_id,
      location_id,
      display_name,
      backup_location_id,
      lan_subnet,
      router_ip,
      ha_ip,
      tunnel_ip,
      domain_label,
      domain_fqdn,
      wireguard_private_key,
      wireguard_public_key,
      created_at,
      updated_at
    FROM network_sites
    WHERE client_id = ? AND location_id = ?
  `).get(clientId, locationId);
  if (!row) return res.status(404).json({ error: 'Save the network site before applying it to server config' });

  const site = mergeNetworkSiteRecord(mapNetworkSiteRow(row), mapNetworkSiteRow(row));
  const shouldApplyWireGuard = target === 'all' || target === 'wireguard';
  const shouldApplyCaddy = target === 'all' || target === 'caddy';
  if (shouldApplyWireGuard) {
    if (!site.tunnelIp || !site.lanSubnet || !site.wireGuardPublicKey) {
      return res.status(400).json({ error: 'Tunnel IP, LAN subnet and WireGuard public key are required for WireGuard apply' });
    }
  }
  if (shouldApplyCaddy) {
    if (!site.domainFqdn || !site.haIp) {
      return res.status(400).json({ error: 'Domain and HA IP are required for Caddy apply' });
    }
  }

  try {
    const result = applySiteToRuntimeConfig(site, target);
    const refreshedOverview = loadNetworkOverviewData();
    const refreshedResolved = resolveNetworkSiteFromOverview(refreshedOverview, clientId, locationId);
    return res.json({
      success: true,
      site: toPublicNetworkSite(refreshedResolved?.site || site, refreshedOverview.runtimeConfig),
      result,
      runtime: sanitizeRuntimeConfigForResponse(refreshedOverview.runtimeConfig),
    });
  } catch (error) {
    return res.status(400).json({ error: error?.message || 'Failed to apply server config' });
  }
});

router.get('/network/sites/:clientId/:locationId/umr-config', (req, res) => {
  const clientId = normalizeClientId(req.params.clientId);
  const locationId = normalizeLocationId(req.params.locationId);
  if (!clientId || !locationId) return res.status(400).json({ error: 'Valid clientId and locationId are required' });

  const row = db.prepare(`
    SELECT
      client_id,
      location_id,
      display_name,
      backup_location_id,
      lan_subnet,
      router_ip,
      ha_ip,
      tunnel_ip,
      domain_label,
      domain_fqdn,
      wireguard_private_key,
      wireguard_public_key,
      created_at,
      updated_at
    FROM network_sites
    WHERE client_id = ? AND location_id = ?
  `).get(clientId, locationId);
  if (!row) return res.status(404).json({ error: 'Network location not found' });

  try {
    const site = mergeNetworkSiteRecord(mapNetworkSiteRow(row), mapNetworkSiteRow(row));
    const artifacts = buildNetworkSiteArtifacts(site);
    if (!artifacts.umrConfig) {
      return res.status(400).json({ error: artifacts.umrConfigError || 'Unable to generate UMR config' });
    }
    const fileName = `${site.clientId}-${site.locationId}-umr.conf`.replace(/[^a-z0-9._-]+/gi, '-');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    return res.send(artifacts.umrConfig);
  } catch (error) {
    return res.status(400).json({ error: error?.message || 'Failed to generate UMR config' });
  }
});

router.post('/', (req, res) => {
  const rawClientId = String(req.body?.clientId || '').trim();
  const clientId = normalizeClientId(rawClientId);
  const name = String(req.body?.name || '').trim();

  if (!clientId) return res.status(400).json({ error: 'Valid clientId is required' });

  const existing = db.prepare('SELECT id, name, created_at, updated_at FROM clients WHERE id = ?').get(clientId);
  if (existing) {
    return res.json({
      client: {
        id: existing.id,
        name: existing.name,
        createdAt: existing.created_at,
        updatedAt: existing.updated_at,
      },
      created: false,
    });
  }

  provisionClientDefaults(clientId, name || rawClientId || clientId);
  const created = db.prepare('SELECT id, name, created_at, updated_at FROM clients WHERE id = ?').get(clientId);
  return res.status(201).json({
    client: {
      id: created.id,
      name: created.name,
      createdAt: created.created_at,
      updatedAt: created.updated_at,
    },
    created: true,
  });
});

router.post('/:clientId/admin', (req, res) => {
  const clientId = normalizeClientId(req.params.clientId);
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');

  if (!clientId) return res.status(400).json({ error: 'Valid clientId is required' });
  if (!username || !password) return res.status(400).json({ error: 'Username and password are required' });

  const client = db.prepare('SELECT id FROM clients WHERE id = ?').get(clientId);
  if (!client) {
    return res.status(404).json({ error: 'Client not found' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE client_id = ? AND username = ?').get(clientId, username);
  if (existing) {
    return res.status(409).json({ error: 'Username already exists for this client' });
  }

  const now = new Date().toISOString();
  const id = randomUUID();
  db.prepare(`
    INSERT INTO users (
      id, client_id, username, password_hash, role, assigned_dashboard_id,
      ha_url, ha_token, full_name, email, phone, avatar_url,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'admin', 'default', '', '', '', '', '', '', ?, ?)
  `).run(id, clientId, username, hashPassword(password), now, now);

  return res.status(201).json({
    user: {
      id,
      clientId,
      username,
      role: 'admin',
      assignedDashboardId: 'default',
      createdAt: now,
      updatedAt: now,
    },
  });
});

router.get('/:clientId/ha-config', (req, res) => {
  const clientId = normalizeClientId(req.params.clientId);
  if (!clientId) return res.status(400).json({ error: 'Valid clientId is required' });

  const client = db.prepare('SELECT id FROM clients WHERE id = ?').get(clientId);
  if (!client) return res.status(404).json({ error: 'Client not found' });

  const row = db.prepare('SELECT * FROM ha_config WHERE client_id = ?').get(clientId);
  const parsedConfig = parseHaConfigRow(row);

  return res.json({
    config: parsedConfig,
  });
});

router.put('/:clientId/ha-config', (req, res) => {
  const clientId = normalizeClientId(req.params.clientId);
  if (!clientId) return res.status(400).json({ error: 'Valid clientId is required' });

  const client = db.prepare('SELECT id FROM clients WHERE id = ?').get(clientId);
  if (!client) return res.status(404).json({ error: 'Client not found' });

  const existing = db.prepare('SELECT * FROM ha_config WHERE client_id = ?').get(clientId);
  const existingConfig = parseHaConfigRow(existing);
  const merged = mergeHaConfigPayload(existingConfig, req.body || {});

  const now = new Date().toISOString();
  const oauthTokensJson = merged.oauthTokens ? JSON.stringify(merged.oauthTokens) : null;
  const connectionsJson = serializeHaConnections(merged);

  db.prepare(`
    INSERT INTO ha_config (client_id, url, fallback_url, auth_method, token, oauth_tokens, connections_json, updated_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(client_id) DO UPDATE SET
      url = excluded.url,
      fallback_url = excluded.fallback_url,
      auth_method = excluded.auth_method,
      token = excluded.token,
      oauth_tokens = excluded.oauth_tokens,
      connections_json = excluded.connections_json,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at
  `).run(
    clientId,
    merged.url,
    merged.fallbackUrl,
    merged.authMethod,
    merged.token,
    oauthTokensJson,
    connectionsJson,
    req.auth.user.id,
    existing?.created_at || now,
    now,
  );

  const savedConfig = { ...merged, updatedAt: now };

  return res.json({
    config: savedConfig,
  });
});

router.get('/:clientId/backups', async (req, res) => {
  const clientId = normalizeClientId(req.params.clientId);
  if (!clientId) return res.status(400).json({ error: 'Valid clientId is required' });

  const client = db.prepare('SELECT id, name FROM clients WHERE id = ?').get(clientId);
  if (!client) return res.status(404).json({ error: 'Client not found' });

  try {
    const parsedConfig = parseHaConfigRow(db.prepare('SELECT * FROM ha_config WHERE client_id = ?').get(clientId));
    const locations = getClientBackupLocations(client, parsedConfig);
    const location = resolveRequestedLocationMeta(locations, resolveBackupLocationRequestId(req));
    const backupInfo = await listClientBackupFiles(clientId, location?.id || '');
    return res.json({
      client: {
        id: client.id,
        name: client.name,
      },
      location: location ? {
        id: location.id,
        connectionId: location.connectionId,
        name: location.name,
        isPrimary: Boolean(location.isPrimary),
      } : null,
      directory: {
        exists: Boolean(backupInfo.exists),
        path: backupInfo.displayDirectoryPath,
        clientPath: backupInfo.displayClientDirectoryPath,
        rootPath: backupInfo.displayRootPath,
      },
      summary: {
        fileCount: Number(backupInfo.fileCount || 0),
        totalBytes: Number(backupInfo.totalBytes || 0),
        latestBackupAt: backupInfo.latestBackupAt || null,
      },
      files: Array.isArray(backupInfo.files) ? backupInfo.files : [],
    });
  } catch (error) {
    return res.status(error?.statusCode || 500).json({ error: error?.message || 'Failed to load client backups' });
  }
});

router.post('/:clientId/backups/provision', async (req, res) => {
  const clientId = normalizeClientId(req.params.clientId);
  if (!clientId) return res.status(400).json({ error: 'Valid clientId is required' });

  const client = db.prepare('SELECT id, name FROM clients WHERE id = ?').get(clientId);
  if (!client) return res.status(404).json({ error: 'Client not found' });

  try {
    const parsedConfig = parseHaConfigRow(db.prepare('SELECT * FROM ha_config WHERE client_id = ?').get(clientId));
    const locations = getClientBackupLocations(client, parsedConfig);
    const location = resolveRequestedLocationMeta(locations, resolveBackupLocationRequestId(req));
    const backupInfo = await ensureClientBackupDirectory(clientId, location?.id || '');
    return res.json({
      client: {
        id: client.id,
        name: client.name,
      },
      location: location ? {
        id: location.id,
        connectionId: location.connectionId,
        name: location.name,
        isPrimary: Boolean(location.isPrimary),
      } : null,
      directory: {
        exists: Boolean(backupInfo.exists),
        path: backupInfo.displayDirectoryPath,
        clientPath: backupInfo.displayClientDirectoryPath,
        rootPath: backupInfo.displayRootPath,
      },
      summary: {
        fileCount: Number(backupInfo.fileCount || 0),
        totalBytes: Number(backupInfo.totalBytes || 0),
        latestBackupAt: backupInfo.latestBackupAt || null,
      },
    });
  } catch (error) {
    return res.status(error?.statusCode || 500).json({ error: error?.message || 'Failed to prepare backup directory' });
  }
});

router.delete('/:clientId/backups/files/:fileName', async (req, res) => {
  const clientId = normalizeClientId(req.params.clientId);
  if (!clientId) return res.status(400).json({ error: 'Valid clientId is required' });

  const client = db.prepare('SELECT id FROM clients WHERE id = ?').get(clientId);
  if (!client) return res.status(404).json({ error: 'Client not found' });

  try {
    const deleted = await deleteClientBackupFile(clientId, req.params.fileName, resolveBackupLocationRequestId(req));
    return res.json({
      success: true,
      fileName: deleted.fileName,
      clientId: deleted.clientId,
      locationId: deleted.locationId || '',
    });
  } catch (error) {
    return res.status(error?.statusCode || 500).json({ error: error?.message || 'Failed to delete backup file' });
  }
});

router.get('/:clientId/backups/files/:fileName/download', async (req, res) => {
  const clientId = normalizeClientId(req.params.clientId);
  if (!clientId) return res.status(400).json({ error: 'Valid clientId is required' });

  const client = db.prepare('SELECT id FROM clients WHERE id = ?').get(clientId);
  if (!client) return res.status(404).json({ error: 'Client not found' });

  try {
    const file = await createClientBackupReadStream(clientId, req.params.fileName, resolveBackupLocationRequestId(req));
    const safeFileName = String(file.fileName || 'backup.tar').replace(/"/g, '');
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', String(file.sizeBytes || 0));
    res.setHeader('Content-Disposition', `attachment; filename="${safeFileName}"`);
    file.stream.on('error', () => {
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to stream backup file' });
      } else {
        res.destroy();
      }
    });
    return file.stream.pipe(res);
  } catch (error) {
    return res.status(error?.statusCode || 500).json({ error: error?.message || 'Failed to download backup file' });
  }
});

router.get('/:clientId/dashboards', (req, res) => {
  const clientId = normalizeClientId(req.params.clientId);
  if (!clientId) return res.status(400).json({ error: 'Valid clientId is required' });
  const client = db.prepare('SELECT id FROM clients WHERE id = ?').get(clientId);
  if (!client) return res.status(404).json({ error: 'Client not found' });
  const rows = db.prepare('SELECT client_id, id, name, created_at, updated_at FROM dashboards WHERE client_id = ? ORDER BY updated_at DESC').all(clientId);
  return res.json({ dashboards: rows.map(toDashboardMeta) });
});

router.get('/:clientId/dashboards/:dashboardId', (req, res) => {
  const clientId = normalizeClientId(req.params.clientId);
  const dashboardId = normalizeDashboardId(req.params.dashboardId);
  if (!clientId) return res.status(400).json({ error: 'Valid clientId is required' });
  const client = db.prepare('SELECT id FROM clients WHERE id = ?').get(clientId);
  if (!client) return res.status(404).json({ error: 'Client not found' });
  const row = db.prepare('SELECT * FROM dashboards WHERE client_id = ? AND id = ?').get(clientId, dashboardId);
  if (!row) return res.status(404).json({ error: 'Dashboard not found' });
  return res.json({
    ...toDashboardMeta(row),
    data: JSON.parse(row.data),
  });
});

router.get('/:clientId/dashboards/:dashboardId/versions', (req, res) => {
  const clientId = normalizeClientId(req.params.clientId);
  const dashboardId = normalizeDashboardId(req.params.dashboardId);
  if (!clientId) return res.status(400).json({ error: 'Valid clientId is required' });
  const client = db.prepare('SELECT id FROM clients WHERE id = ?').get(clientId);
  if (!client) return res.status(404).json({ error: 'Client not found' });
  const existing = db.prepare('SELECT id FROM dashboards WHERE client_id = ? AND id = ?').get(clientId, dashboardId);
  if (!existing) return res.status(404).json({ error: 'Dashboard not found' });
  const limit = parseLimit(req.query?.limit, 30);
  return res.json({ versions: listDashboardVersions(clientId, dashboardId, limit) });
});

router.post('/:clientId/dashboards/:dashboardId/versions/:versionId/restore', (req, res) => {
  const clientId = normalizeClientId(req.params.clientId);
  const dashboardId = normalizeDashboardId(req.params.dashboardId);
  const versionId = String(req.params.versionId || '').trim();
  if (!clientId) return res.status(400).json({ error: 'Valid clientId is required' });
  if (!versionId) return res.status(400).json({ error: 'versionId is required' });

  const client = db.prepare('SELECT id FROM clients WHERE id = ?').get(clientId);
  if (!client) return res.status(404).json({ error: 'Client not found' });

  const existing = db.prepare('SELECT * FROM dashboards WHERE client_id = ? AND id = ?').get(clientId, dashboardId);
  if (!existing) return res.status(404).json({ error: 'Dashboard not found' });

  const versionRow = fetchDashboardVersionRow(clientId, dashboardId, versionId);
  if (!versionRow) return res.status(404).json({ error: 'Dashboard version not found' });

  let restoredData;
  try {
    restoredData = JSON.parse(versionRow.data);
  } catch {
    return res.status(500).json({ error: 'Stored dashboard version is invalid JSON' });
  }

  let backupVersionId = null;
  const now = new Date().toISOString();
  db.exec('BEGIN');
  try {
    backupVersionId = saveDashboardVersionSnapshot({
      clientId,
      dashboardId,
      name: existing.name,
      data: existing.data,
      createdBy: req.auth?.user?.id || null,
      sourceUpdatedAt: existing.updated_at,
    });
    db.prepare('UPDATE dashboards SET data = ?, updated_at = ? WHERE client_id = ? AND id = ?')
      .run(JSON.stringify(restoredData), now, clientId, dashboardId);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  const row = db.prepare('SELECT client_id, id, name, created_at, updated_at FROM dashboards WHERE client_id = ? AND id = ?')
    .get(clientId, dashboardId);
  return res.json({
    dashboard: toDashboardMeta(row),
    data: restoredData,
    restoredVersion: toDashboardVersionMeta(versionRow),
    backupVersionId,
  });
});

router.put('/:clientId/dashboards/:dashboardId', (req, res) => {
  const clientId = normalizeClientId(req.params.clientId);
  const dashboardId = normalizeDashboardId(req.params.dashboardId);
  const name = String(req.body?.name || dashboardId).trim() || dashboardId;
  const data = req.body?.data;
  if (!clientId) return res.status(400).json({ error: 'Valid clientId is required' });
  const client = db.prepare('SELECT id FROM clients WHERE id = ?').get(clientId);
  if (!client) return res.status(404).json({ error: 'Client not found' });
  if (!data || typeof data !== 'object') {
    return res.status(400).json({ error: 'Dashboard data is required' });
  }

  const existing = db.prepare('SELECT * FROM dashboards WHERE client_id = ? AND id = ?').get(clientId, dashboardId);
  const now = new Date().toISOString();
  if (!existing) {
    db.prepare('INSERT INTO dashboards (client_id, id, name, data, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(clientId, dashboardId, name, JSON.stringify(data), req.auth.user.id, now, now);
  } else {
    db.exec('BEGIN');
    try {
      saveDashboardVersionSnapshot({
        clientId,
        dashboardId,
        name: existing.name,
        data: existing.data,
        createdBy: req.auth.user.id,
        sourceUpdatedAt: existing.updated_at,
      });
      db.prepare('UPDATE dashboards SET name = ?, data = ?, updated_at = ? WHERE client_id = ? AND id = ?')
        .run(name, JSON.stringify(data), now, clientId, dashboardId);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  const row = db.prepare('SELECT client_id, id, name, created_at, updated_at FROM dashboards WHERE client_id = ? AND id = ?').get(clientId, dashboardId);
  return res.json({ dashboard: toDashboardMeta(row) });
});

router.put('/:clientId', (req, res) => {
  const clientId = normalizeClientId(req.params.clientId);
  const name = String(req.body?.name || '').trim();

  if (!clientId) return res.status(400).json({ error: 'Valid clientId is required' });
  if (!name) return res.status(400).json({ error: 'Client name is required' });

  const existing = db.prepare('SELECT id FROM clients WHERE id = ?').get(clientId);
  if (!existing) return res.status(404).json({ error: 'Client not found' });

  const now = new Date().toISOString();
  db.prepare('UPDATE clients SET name = ?, updated_at = ? WHERE id = ?').run(name, now, clientId);

  const updated = db.prepare('SELECT id, name, created_at, updated_at FROM clients WHERE id = ?').get(clientId);
  return res.json({
    client: {
      id: updated.id,
      name: updated.name,
      createdAt: updated.created_at,
      updatedAt: updated.updated_at,
    },
  });
});

router.delete('/:clientId', (req, res) => {
  const clientId = normalizeClientId(req.params.clientId);
  const confirmation = String(req.body?.confirmation || '').trim();

  if (!clientId) return res.status(400).json({ error: 'Valid clientId is required' });
  if (confirmation !== 'OK') {
    return res.status(400).json({ error: 'Type OK in confirmation field to delete this client' });
  }
  if (clientId === PLATFORM_ADMIN_CLIENT_ID) {
    return res.status(400).json({ error: 'Cannot delete platform admin client' });
  }
  if (req.auth?.user?.clientId === clientId) {
    return res.status(400).json({ error: 'Cannot delete the currently active client' });
  }

  const existing = db.prepare('SELECT id FROM clients WHERE id = ?').get(clientId);
  if (!existing) return res.status(404).json({ error: 'Client not found' });

  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE client_id = ?)').run(clientId);
    db.prepare('DELETE FROM users WHERE client_id = ?').run(clientId);
    db.prepare('DELETE FROM dashboard_versions WHERE client_id = ?').run(clientId);
    db.prepare('DELETE FROM dashboards WHERE client_id = ?').run(clientId);
    db.prepare('DELETE FROM ha_config WHERE client_id = ?').run(clientId);
    db.prepare('DELETE FROM clients WHERE id = ?').run(clientId);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  return res.json({ success: true });
});

export default router;
