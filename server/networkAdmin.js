import { execFileSync } from 'child_process';
import { generateKeyPairSync } from 'crypto';
import { accessSync, constants, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname } from 'path';

const normalizeLocationId = (value) => String(value ?? '')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9_-]+/g, '-')
  .replace(/^-+|-+$/g, '');

const normalizeClientId = (value) => String(value ?? '')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9_-]+/g, '-')
  .replace(/^-+|-+$/g, '');

const normalizeIpv4 = (value) => String(value || '').trim();
const normalizeSubnet = (value) => String(value || '').trim();
const normalizeDomainLabel = (value) => normalizeLocationId(value);
const normalizeDisplayName = (value, fallback = '') => String(value || '').trim() || fallback;

const DEFAULT_WG_CONFIG_PATH = process.env.NETWORK_WG_CONFIG_PATH || '/app/runtime/wireguard/wg0.conf';
const DEFAULT_CADDY_CONFIG_PATH = process.env.NETWORK_CADDY_CONFIG_PATH || '/app/runtime/caddy/Caddyfile';
const DEFAULT_DOMAIN_SUFFIX = String(process.env.NETWORK_DOMAIN_SUFFIX || 'smarti.dev').trim().replace(/^\.+|\.+$/g, '');
const DEFAULT_SERVER_PUBLIC_HOST = String(process.env.NETWORK_SERVER_PUBLIC_HOST || '65.21.203.69').trim();
const DEFAULT_WG_SERVER_PUBLIC_KEY = String(process.env.NETWORK_WG_SERVER_PUBLIC_KEY || '').trim();
const DEFAULT_WG_LISTEN_PORT = Math.max(1, Math.min(65535, Number.parseInt(String(process.env.NETWORK_WG_LISTEN_PORT || '51820'), 10) || 51820));
const DEFAULT_BACKUP_ROOT = String(process.env.HA_BACKUP_ROOT || process.env.NETWORK_BACKUP_ROOT || '/srv/ha-backups').trim();
const WG_VALIDATE_COMMAND = String(process.env.NETWORK_WG_VALIDATE_COMMAND || '').trim();
const WG_RELOAD_COMMAND = String(process.env.NETWORK_WG_RELOAD_COMMAND || '').trim();
const CADDY_VALIDATE_COMMAND = String(process.env.NETWORK_CADDY_VALIDATE_COMMAND || '').trim();
const CADDY_RELOAD_COMMAND = String(process.env.NETWORK_CADDY_RELOAD_COMMAND || '').trim();

const toBase64 = (value) => {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4;
  if (!padding) return normalized;
  return normalized.padEnd(normalized.length + (4 - padding), '=');
};

const readOptionalFile = (filePath) => {
  const normalizedPath = String(filePath || '').trim();
  if (!normalizedPath || !existsSync(normalizedPath)) return '';
  try {
    return readFileSync(normalizedPath, 'utf8');
  } catch {
    return '';
  }
};

const fileAccess = (filePath) => {
  const normalizedPath = String(filePath || '').trim();
  if (!normalizedPath) {
    return {
      path: '',
      exists: false,
      readable: false,
      writable: false,
    };
  }

  let readable = false;
  let writable = false;
  try {
    accessSync(normalizedPath, constants.R_OK);
    readable = true;
  } catch {
    readable = false;
  }
  try {
    accessSync(normalizedPath, constants.W_OK);
    writable = true;
  } catch {
    writable = false;
  }
  return {
    path: normalizedPath,
    exists: existsSync(normalizedPath),
    readable,
    writable,
  };
};

const ensureParentDirectory = (filePath) => {
  const parent = dirname(filePath);
  if (parent && !existsSync(parent)) mkdirSync(parent, { recursive: true });
};

const runShellCommand = (command) => {
  const normalized = String(command || '').trim();
  if (!normalized) {
    return {
      supported: false,
      ok: false,
      output: '',
      error: '',
    };
  }

  try {
    const output = execFileSync('/bin/sh', ['-lc', normalized], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return {
      supported: true,
      ok: true,
      output: String(output || '').trim(),
      error: '',
    };
  } catch (error) {
    return {
      supported: true,
      ok: false,
      output: String(error?.stdout || '').trim(),
      error: String(error?.stderr || error?.message || '').trim(),
    };
  }
};

const parseWireGuardConfig = (rawValue) => {
  const raw = String(rawValue || '').trim();
  if (!raw) return [];
  const sections = raw.split(/\n(?=\[Peer\])/g).filter((entry) => entry.includes('[Peer]'));
  return sections.map((section, index) => {
    const publicKey = section.match(/^\s*PublicKey\s*=\s*(.+)$/m)?.[1]?.trim() || '';
    const allowed = section.match(/^\s*AllowedIPs\s*=\s*(.+)$/m)?.[1]?.trim() || '';
    const comment = section.match(/^\s*#\s*(.+)$/m)?.[1]?.trim() || '';
    const marker = section.match(/^\s*#\s*BEGIN SMARTI NETWORK SITE ([^\n]+)$/m)?.[1]?.trim() || '';
    return {
      index,
      publicKey,
      allowedIps: allowed ? allowed.split(',').map((value) => value.trim()).filter(Boolean) : [],
      comment,
      marker,
      raw: section.trim(),
    };
  });
};

const parseCaddyConfig = (rawValue) => {
  const raw = String(rawValue || '');
  const lines = raw.split(/\r?\n/);
  const sites = [];
  let depth = 0;
  let current = null;

  for (const line of lines) {
    const trimmed = line.trim();
    const opens = (line.match(/\{/g) || []).length;
    const closes = (line.match(/\}/g) || []).length;

    if (!current && trimmed && !trimmed.startsWith('#') && trimmed.endsWith('{')) {
      current = {
        header: trimmed.slice(0, -1).trim(),
        lines: [line],
        depth: opens - closes,
      };
      if (current.depth <= 0) {
        const block = current.lines.join('\n');
        sites.push(block);
        current = null;
      }
      continue;
    }

    if (current) {
      current.lines.push(line);
      depth = current.depth + opens - closes;
      current.depth = depth;
      if (depth <= 0) {
        const block = current.lines.join('\n');
        sites.push(block);
        current = null;
      }
    }
  }

  return sites.map((block, index) => {
    const header = block.split(/\r?\n/, 1)[0].replace(/\{$/, '').trim();
    const hosts = header.split(',').map((value) => value.trim()).filter(Boolean);
    const reverseProxy = block.match(/^\s*reverse_proxy\s+([^\s#]+).*$/m)?.[1]?.trim() || '';
    const marker = block.match(/^\s*#\s*BEGIN SMARTI NETWORK SITE ([^\n]+)$/m)?.[1]?.trim() || '';
    return {
      index,
      hosts,
      reverseProxy,
      marker,
      raw: block.trim(),
    };
  });
};

const replaceManagedBlock = (content, startMarker, endMarker, block) => {
  const escapedStart = startMarker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedEnd = endMarker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`${escapedStart}[\\s\\S]*?${escapedEnd}\\n?`, 'm');
  if (pattern.test(content)) {
    return content.replace(pattern, block);
  }
  const suffix = content.endsWith('\n') ? '' : '\n';
  return `${content}${suffix}${block}`;
};

const buildSiteMarker = (site) => `${site.clientId}/${site.locationId}`;

export const buildWireGuardPeerSnippet = (site) => {
  const marker = buildSiteMarker(site);
  return `# BEGIN SMARTI NETWORK SITE ${marker}
[Peer]
# ${site.displayName}
PublicKey = ${site.wireGuardPublicKey}
AllowedIPs = ${site.tunnelIp}/32, ${site.lanSubnet}
# END SMARTI NETWORK SITE ${marker}
`;
};

export const buildCaddySiteSnippet = (site) => {
  const marker = buildSiteMarker(site);
  return `# BEGIN SMARTI NETWORK SITE ${marker}
${site.domainFqdn} {
    encode gzip
    reverse_proxy ${site.haIp}:8123
}
# END SMARTI NETWORK SITE ${marker}
`;
};

const createWireGuardKeyPair = () => {
  const { privateKey, publicKey } = generateKeyPairSync('x25519');
  const privateJwk = privateKey.export({ format: 'jwk' });
  const publicJwk = publicKey.export({ format: 'jwk' });
  return {
    privateKey: toBase64(privateJwk?.d || ''),
    publicKey: toBase64(publicJwk?.x || ''),
  };
};

const normalizeSiteRecord = (record = {}) => {
  const clientId = normalizeClientId(record.clientId || record.client_id);
  const locationId = normalizeLocationId(record.locationId || record.location_id);
  const backupLocationId = normalizeLocationId(record.backupLocationId || record.backup_location_id || locationId);
  const displayName = normalizeDisplayName(record.displayName || record.display_name, locationId || clientId || 'Location');
  const domainLabel = normalizeDomainLabel(record.domainLabel || record.domain_label || locationId);
  const domainFqdn = String(record.domainFqdn || record.domain_fqdn || (domainLabel && DEFAULT_DOMAIN_SUFFIX ? `${domainLabel}.${DEFAULT_DOMAIN_SUFFIX}` : '')).trim().toLowerCase();
  return {
    clientId,
    locationId,
    displayName,
    backupLocationId: backupLocationId || locationId,
    lanSubnet: normalizeSubnet(record.lanSubnet || record.lan_subnet),
    routerIp: normalizeIpv4(record.routerIp || record.router_ip),
    haIp: normalizeIpv4(record.haIp || record.ha_ip),
    tunnelIp: normalizeIpv4(record.tunnelIp || record.tunnel_ip),
    domainLabel,
    domainFqdn,
    wireGuardPrivateKey: String(record.wireGuardPrivateKey || record.wireguard_private_key || '').trim(),
    wireGuardPublicKey: String(record.wireGuardPublicKey || record.wireguard_public_key || '').trim(),
    createdAt: String(record.createdAt || record.created_at || '').trim(),
    updatedAt: String(record.updatedAt || record.updated_at || '').trim(),
  };
};

export const createNetworkSiteFromInput = (input = {}, fallback = {}) => {
  const normalized = normalizeSiteRecord({ ...fallback, ...input });
  if (!normalized.clientId) throw new Error('Client ID is required');
  if (!normalized.locationId) throw new Error('Location ID is required');
  if (!normalized.backupLocationId) normalized.backupLocationId = normalized.locationId;
  if (!normalized.displayName) normalized.displayName = normalized.locationId;
  if (!normalized.domainLabel && normalized.locationId) normalized.domainLabel = normalized.locationId;
  if (!normalized.domainFqdn && normalized.domainLabel && DEFAULT_DOMAIN_SUFFIX) {
    normalized.domainFqdn = `${normalized.domainLabel}.${DEFAULT_DOMAIN_SUFFIX}`;
  }
  if ((!normalized.wireGuardPrivateKey || !normalized.wireGuardPublicKey) && normalized.tunnelIp) {
    const keys = createWireGuardKeyPair();
    normalized.wireGuardPrivateKey = keys.privateKey;
    normalized.wireGuardPublicKey = keys.publicKey;
  }
  return normalized;
};

export const buildUmrConfigText = (site) => {
  if (!site?.tunnelIp) throw new Error('Tunnel IP is required to generate the UMR file');
  if (!site?.wireGuardPrivateKey) throw new Error('WireGuard private key is missing for this location');
  const serverPublicKey = DEFAULT_WG_SERVER_PUBLIC_KEY;
  if (!serverPublicKey) throw new Error('Server public key is not configured');
  return `[Interface]
Address = ${site.tunnelIp}/32
PrivateKey = ${site.wireGuardPrivateKey}

[Peer]
PublicKey = ${serverPublicKey}
Endpoint = ${DEFAULT_SERVER_PUBLIC_HOST}:${DEFAULT_WG_LISTEN_PORT}
AllowedIPs = 10.88.0.0/24
PersistentKeepalive = 25
`;
};

export const buildNetworkSiteArtifacts = (site) => {
  const normalizedSite = normalizeSiteRecord(site);
  let umrConfig = '';
  let umrConfigError = '';

  try {
    umrConfig = buildUmrConfigText(normalizedSite);
  } catch (error) {
    umrConfig = '';
    umrConfigError = String(error?.message || 'Unable to generate UMR config');
  }

  return {
    wireGuardPeer: buildWireGuardPeerSnippet(normalizedSite).trim(),
    caddySite: buildCaddySiteSnippet(normalizedSite).trim(),
    umrConfig,
    umrConfigError,
    dnsRecord: {
      type: 'A',
      name: normalizedSite.domainLabel || normalizedSite.locationId,
      value: DEFAULT_SERVER_PUBLIC_HOST,
      fqdn: normalizedSite.domainFqdn,
    },
    backupPath: normalizedSite.clientId && normalizedSite.backupLocationId
      ? `${DEFAULT_BACKUP_ROOT.replace(/\/$/, '')}/${normalizedSite.clientId}/${normalizedSite.backupLocationId}`
      : '',
  };
};

export const getNetworkRuntimeConfig = () => {
  const wgInfo = fileAccess(DEFAULT_WG_CONFIG_PATH);
  const caddyInfo = fileAccess(DEFAULT_CADDY_CONFIG_PATH);
  const wgRaw = wgInfo.readable ? readOptionalFile(DEFAULT_WG_CONFIG_PATH) : '';
  const caddyRaw = caddyInfo.readable ? readOptionalFile(DEFAULT_CADDY_CONFIG_PATH) : '';
  return {
    server: {
      publicHost: DEFAULT_SERVER_PUBLIC_HOST,
      domainSuffix: DEFAULT_DOMAIN_SUFFIX,
      wireGuardListenPort: DEFAULT_WG_LISTEN_PORT,
      wireGuardServerPublicKey: DEFAULT_WG_SERVER_PUBLIC_KEY,
      backupRoot: DEFAULT_BACKUP_ROOT,
    },
    files: {
      wireGuard: {
        ...wgInfo,
        path: DEFAULT_WG_CONFIG_PATH,
        hasRuntimeConfig: Boolean(wgRaw),
        peerCount: parseWireGuardConfig(wgRaw).length,
      },
      caddy: {
        ...caddyInfo,
        path: DEFAULT_CADDY_CONFIG_PATH,
        hasRuntimeConfig: Boolean(caddyRaw),
        siteCount: parseCaddyConfig(caddyRaw).length,
      },
    },
    active: {
      wireGuardPeers: parseWireGuardConfig(wgRaw),
      caddySites: parseCaddyConfig(caddyRaw),
      wireGuardRaw: wgRaw,
      caddyRaw,
    },
    commands: {
      wireGuardValidate: Boolean(WG_VALIDATE_COMMAND),
      wireGuardReload: Boolean(WG_RELOAD_COMMAND),
      caddyValidate: Boolean(CADDY_VALIDATE_COMMAND),
      caddyReload: Boolean(CADDY_RELOAD_COMMAND),
    },
  };
};

export const deriveSiteRuntimeState = (site, runtimeConfig) => {
  const peers = Array.isArray(runtimeConfig?.active?.wireGuardPeers) ? runtimeConfig.active.wireGuardPeers : [];
  const caddySites = Array.isArray(runtimeConfig?.active?.caddySites) ? runtimeConfig.active.caddySites : [];
  const matchedPeer = peers.find((peer) => (
    (site.wireGuardPublicKey && peer.publicKey === site.wireGuardPublicKey)
    || (site.tunnelIp && peer.allowedIps.includes(`${site.tunnelIp}/32`))
    || (site.lanSubnet && peer.allowedIps.includes(site.lanSubnet))
  )) || null;
  const matchedCaddy = caddySites.find((entry) => (
    site.domainFqdn
      ? entry.hosts.includes(site.domainFqdn)
      : site.domainLabel && DEFAULT_DOMAIN_SUFFIX
        ? entry.hosts.includes(`${site.domainLabel}.${DEFAULT_DOMAIN_SUFFIX}`)
        : false
  )) || null;

  return {
    wireGuardApplied: Boolean(matchedPeer),
    caddyApplied: Boolean(matchedCaddy),
    matchedPeer,
    matchedCaddy,
  };
};

export const applySiteToRuntimeConfig = (site, target = 'all') => {
  const normalizedTarget = String(target || 'all').trim().toLowerCase();
  const runtimeConfig = getNetworkRuntimeConfig();
  const result = {
    target: normalizedTarget,
    updated: [],
    validate: {},
    reload: {},
    manualReloadRequired: [],
  };

  if (normalizedTarget === 'all' || normalizedTarget === 'wireguard') {
    if (!runtimeConfig.files.wireGuard.writable) {
      throw new Error('WireGuard config is not writable from the app runtime');
    }
    const snippet = buildWireGuardPeerSnippet(site);
    const marker = buildSiteMarker(site);
    const next = replaceManagedBlock(
      runtimeConfig.active.wireGuardRaw || '',
      `# BEGIN SMARTI NETWORK SITE ${marker}`,
      `# END SMARTI NETWORK SITE ${marker}`,
      snippet,
    );
    ensureParentDirectory(DEFAULT_WG_CONFIG_PATH);
    writeFileSync(DEFAULT_WG_CONFIG_PATH, next, 'utf8');
    result.updated.push('wireguard');
    result.validate.wireGuard = runShellCommand(WG_VALIDATE_COMMAND);
    result.reload.wireGuard = runShellCommand(WG_RELOAD_COMMAND);
    if (!result.reload.wireGuard.supported) result.manualReloadRequired.push('wireguard');
  }

  if (normalizedTarget === 'all' || normalizedTarget === 'caddy') {
    if (!runtimeConfig.files.caddy.writable) {
      throw new Error('Caddy config is not writable from the app runtime');
    }
    const snippet = buildCaddySiteSnippet(site);
    const marker = buildSiteMarker(site);
    const next = replaceManagedBlock(
      runtimeConfig.active.caddyRaw || '',
      `# BEGIN SMARTI NETWORK SITE ${marker}`,
      `# END SMARTI NETWORK SITE ${marker}`,
      snippet,
    );
    ensureParentDirectory(DEFAULT_CADDY_CONFIG_PATH);
    writeFileSync(DEFAULT_CADDY_CONFIG_PATH, next, 'utf8');
    result.updated.push('caddy');
    result.validate.caddy = runShellCommand(CADDY_VALIDATE_COMMAND);
    result.reload.caddy = runShellCommand(CADDY_RELOAD_COMMAND);
    if (!result.reload.caddy.supported) result.manualReloadRequired.push('caddy');
  }

  return result;
};

export const networkDefaults = {
  backupRoot: DEFAULT_BACKUP_ROOT,
  domainSuffix: DEFAULT_DOMAIN_SUFFIX,
  serverPublicHost: DEFAULT_SERVER_PUBLIC_HOST,
  wireGuardListenPort: DEFAULT_WG_LISTEN_PORT,
  wireGuardServerPublicKey: DEFAULT_WG_SERVER_PUBLIC_KEY,
};
