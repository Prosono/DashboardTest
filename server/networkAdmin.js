import { execFileSync } from 'child_process';
import { generateKeyPairSync, randomUUID } from 'crypto';
import {
  accessSync,
  chmodSync,
  chownSync,
  constants,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'fs';
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
const normalizeMacAddress = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/-/g, ':');
const normalizeDomainLabel = (value) => String(value ?? '')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9-]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 63);
const normalizeDisplayName = (value, fallback = '') => String(value || '').trim() || fallback;

const parseIpv4Octets = (value) => {
  const parts = String(value || '').trim().split('.');
  if (parts.length !== 4) return null;
  const octets = parts.map((part) => {
    if (!/^\d{1,3}$/.test(part)) return Number.NaN;
    return Number.parseInt(part, 10);
  });
  return octets.every((octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255)
    ? octets
    : null;
};

export const isValidIpv4 = (value) => Boolean(parseIpv4Octets(value));

export const isValidMacAddress = (value) => (
  /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(normalizeMacAddress(value))
);

export const isValidIpv4Cidr = (value) => {
  const [address, prefix, ...rest] = String(value || '').trim().split('/');
  if (rest.length || !isValidIpv4(address) || !/^\d{1,2}$/.test(prefix || '')) return false;
  const parsedPrefix = Number.parseInt(prefix, 10);
  return parsedPrefix >= 0 && parsedPrefix <= 32;
};

export const isValidDomainName = (value) => {
  const domain = String(value || '').trim().toLowerCase();
  if (!domain || domain.length > 253 || domain.includes('..')) return false;
  return domain.split('.').every((label) => (
    label.length >= 1
    && label.length <= 63
    && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)
  ));
};

export const validateNetworkSite = (site = {}) => {
  const errors = [];
  if (site.routerIp && !isValidIpv4(site.routerIp)) errors.push('Router IP must be a valid IPv4 address');
  if (site.switchIp && !isValidIpv4(site.switchIp)) errors.push('Switch IP must be a valid IPv4 address');
  if (site.haIp && !isValidIpv4(site.haIp)) errors.push('HA IP must be a valid IPv4 address');
  if (site.knxIp && !isValidIpv4(site.knxIp)) errors.push('KNX IP must be a valid IPv4 address');
  if (site.tunnelIp && !isValidIpv4(site.tunnelIp)) errors.push('Tunnel IP must be a valid IPv4 address');
  if (site.lanSubnet && !isValidIpv4Cidr(site.lanSubnet)) errors.push('LAN subnet must be a valid IPv4 CIDR');
  if (site.domainFqdn && !isValidDomainName(site.domainFqdn)) errors.push('Domain must be a valid fully qualified domain name');
  [
    ['UMR MAC', site.umrMac],
    ['Switch MAC', site.switchMac],
    ['SMARTi Hub MAC', site.haMac],
    ['KNX MAC', site.knxMac],
  ].forEach(([label, value]) => {
    if (value && !isValidMacAddress(value)) errors.push(`${label} must be a valid MAC address`);
  });
  return errors;
};

const env = globalThis.process?.env || {};
const DEFAULT_WG_CONFIG_PATH = env.NETWORK_WG_CONFIG_PATH || '/app/runtime/wireguard/wg0.conf';
const DEFAULT_CADDY_CONFIG_PATH = env.NETWORK_CADDY_CONFIG_PATH || '/app/runtime/caddy/Caddyfile';
const DEFAULT_DOMAIN_SUFFIX = String(env.NETWORK_DOMAIN_SUFFIX || 'smarti.dev').trim().replace(/^\.+|\.+$/g, '');
const DEFAULT_SERVER_PUBLIC_HOST = String(env.NETWORK_SERVER_PUBLIC_HOST || '65.21.203.69').trim();
const DEFAULT_WG_SERVER_PUBLIC_KEY = String(env.NETWORK_WG_SERVER_PUBLIC_KEY || '').trim();
const DEFAULT_WG_LISTEN_PORT = Math.max(1, Math.min(65535, Number.parseInt(String(env.NETWORK_WG_LISTEN_PORT || '51820'), 10) || 51820));
const DEFAULT_BACKUP_ROOT = String(env.HA_BACKUP_ROOT || env.NETWORK_BACKUP_ROOT || '/srv/ha-backups').trim();
const WG_VALIDATE_COMMAND = String(env.NETWORK_WG_VALIDATE_COMMAND || '').trim();
const WG_RELOAD_COMMAND = String(env.NETWORK_WG_RELOAD_COMMAND || '').trim();
const CADDY_VALIDATE_COMMAND = String(env.NETWORK_CADDY_VALIDATE_COMMAND || '').trim();
const CADDY_RELOAD_COMMAND = String(env.NETWORK_CADDY_RELOAD_COMMAND || '').trim();
const WG_SYNC_STATUS_PATH = String(env.NETWORK_WG_SYNC_STATUS_PATH || '').trim();
const CADDY_SYNC_STATUS_PATH = String(env.NETWORK_CADDY_SYNC_STATUS_PATH || '').trim();

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
    accessSync(existsSync(normalizedPath) ? normalizedPath : dirname(normalizedPath), constants.W_OK);
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

const readSyncStatus = (filePath) => {
  const normalizedPath = String(filePath || '').trim();
  if (!normalizedPath) return { configured: false, available: false };
  try {
    const payload = JSON.parse(readFileSync(normalizedPath, 'utf8'));
    return {
      configured: true,
      available: true,
      ok: payload?.ok === true,
      state: String(payload?.state || '').trim(),
      message: String(payload?.message || '').trim(),
      updatedAt: String(payload?.updatedAt || '').trim(),
    };
  } catch {
    return {
      configured: true,
      available: false,
      ok: false,
      state: 'waiting',
      message: '',
      updatedAt: '',
    };
  }
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

export const parseWireGuardConfig = (rawValue) => {
  const raw = String(rawValue || '').trim();
  if (!raw) return [];
  const sections = raw.split(/\n(?=\[Peer\])/g).filter((entry) => entry.includes('[Peer]'));
  const managedBlocks = Array.from(raw.matchAll(
    /^# BEGIN SMARTI NETWORK SITE ([^\r\n]+)\r?\n([\s\S]*?)^# END SMARTI NETWORK SITE \1\s*$/gm,
  )).map((match) => {
    const block = String(match[0] || '').trim();
    const body = String(match[2] || '');
    return {
      marker: String(match[1] || '').trim(),
      publicKey: body.match(/^\s*PublicKey\s*=\s*(.+)$/m)?.[1]?.trim() || '',
      allowedIps: (body.match(/^\s*AllowedIPs\s*=\s*(.+)$/m)?.[1] || '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
      raw: block,
    };
  });

  return sections.map((section, index) => {
    const publicKey = section.match(/^\s*PublicKey\s*=\s*(.+)$/m)?.[1]?.trim() || '';
    const allowed = section.match(/^\s*AllowedIPs\s*=\s*(.+)$/m)?.[1]?.trim() || '';
    const comment = section.match(/^\s*#\s*(.+)$/m)?.[1]?.trim() || '';
    const allowedIps = allowed ? allowed.split(',').map((value) => value.trim()).filter(Boolean) : [];
    const managed = managedBlocks.find((entry) => (
      (publicKey && entry.publicKey === publicKey)
      || (allowedIps.length && entry.allowedIps.some((value) => allowedIps.includes(value)))
    ));
    return {
      index,
      publicKey,
      allowedIps,
      comment,
      marker: managed?.marker || '',
      raw: managed?.raw || section.trim(),
    };
  });
};

export const parseCaddyConfig = (rawValue) => {
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

  const managedBlocks = Array.from(raw.matchAll(
    /^# BEGIN SMARTI NETWORK SITE ([^\r\n]+)\r?\n([\s\S]*?)^# END SMARTI NETWORK SITE \1\s*$/gm,
  )).map((match) => {
    const body = String(match[2] || '').trim();
    const header = body.split(/\r?\n/, 1)[0].replace(/\{$/, '').trim();
    return {
      marker: String(match[1] || '').trim(),
      hosts: header.split(',').map((value) => value.trim()).filter(Boolean),
      reverseProxy: body.match(/^\s*reverse_proxy\s+([^\s#]+).*$/m)?.[1]?.trim() || '',
      raw: String(match[0] || '').trim(),
    };
  });

  return sites.map((block, index) => {
    const header = block.split(/\r?\n/, 1)[0].replace(/\{$/, '').trim();
    const hosts = header.split(',').map((value) => value.trim()).filter(Boolean);
    const reverseProxy = block.match(/^\s*reverse_proxy\s+([^\s#]+).*$/m)?.[1]?.trim() || '';
    const managed = managedBlocks.find((entry) => (
      entry.hosts.some((host) => hosts.includes(host))
      || (reverseProxy && entry.reverseProxy === reverseProxy)
    ));
    return {
      index,
      hosts,
      reverseProxy,
      marker: managed?.marker || '',
      raw: managed?.raw || block.trim(),
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

const removeManagedBlock = (content, startMarker, endMarker) => {
  const escapedStart = startMarker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedEnd = endMarker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`${escapedStart}[\\s\\S]*?${escapedEnd}\\n?`, 'm');
  return String(content || '').replace(pattern, '').replace(/\n{3,}/g, '\n\n');
};

export const reconcileWireGuardSiteConfig = (content, site, mode = 'apply') => {
  const marker = buildSiteMarker(site);
  const startMarker = `# BEGIN SMARTI NETWORK SITE ${marker}`;
  const endMarker = `# END SMARTI NETWORK SITE ${marker}`;
  const expectedAllowedIps = new Set(
    [`${site?.tunnelIp || ''}/32`, site?.lanSubnet]
      .map((value) => String(value || '').trim())
      .filter((value) => value && value !== '/32'),
  );
  const expectedPublicKey = String(site?.wireGuardPublicKey || '').trim();
  const withoutManagedBlock = removeManagedBlock(content, startMarker, endMarker);
  const sections = String(withoutManagedBlock || '').split(/(?=^\[Peer\][ \t]*\r?$)/gm);
  const removedPeers = [];
  const keptSections = sections.filter((section) => {
    if (!section.trimStart().startsWith('[Peer]')) return true;
    const publicKey = section.match(/^\s*PublicKey\s*=\s*(.+)$/m)?.[1]?.trim() || '';
    const allowedIps = (section.match(/^\s*AllowedIPs\s*=\s*(.+)$/m)?.[1] || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    const conflicts = Boolean(
      (expectedPublicKey && publicKey === expectedPublicKey)
      || allowedIps.some((value) => expectedAllowedIps.has(value)),
    );
    if (conflicts) removedPeers.push({ publicKey, allowedIps });
    return !conflicts;
  });
  const cleaned = keptSections.join('').replace(/\n{3,}/g, '\n\n').trimEnd();
  const next = mode === 'remove'
    ? `${cleaned}\n`
    : `${cleaned}${cleaned ? '\n\n' : ''}${buildWireGuardPeerSnippet(site)}`;
  return {
    content: next,
    removedPeers,
  };
};

const writeFileAtomic = (filePath, content) => {
  ensureParentDirectory(filePath);
  const tempPath = `${filePath}.tmp-${globalThis.process?.pid || 'network'}-${randomUUID()}`;
  const existingStat = existsSync(filePath) ? statSync(filePath) : null;
  try {
    writeFileSync(tempPath, content, {
      encoding: 'utf8',
      mode: existingStat ? existingStat.mode & 0o777 : 0o640,
    });
    if (existingStat) {
      chmodSync(tempPath, existingStat.mode & 0o777);
      if (typeof globalThis.process?.getuid === 'function' && globalThis.process.getuid() === 0) {
        chownSync(tempPath, existingStat.uid, existingStat.gid);
      }
    }
    renameSync(tempPath, filePath);
  } finally {
    if (existsSync(tempPath)) unlinkSync(tempPath);
  }
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

export const createWireGuardKeyPair = () => {
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
  const domainLabel = normalizeDomainLabel(
    record.domainLabel
      || record.domain_label
      || [clientId, locationId].filter(Boolean).join('-'),
  );
  const domainFqdn = String(record.domainFqdn || record.domain_fqdn || (domainLabel && DEFAULT_DOMAIN_SUFFIX ? `${domainLabel}.${DEFAULT_DOMAIN_SUFFIX}` : '')).trim().toLowerCase();
  return {
    clientId,
    locationId,
    displayName,
    backupLocationId: backupLocationId || locationId,
    lanSubnet: normalizeSubnet(record.lanSubnet || record.lan_subnet),
    routerIp: normalizeIpv4(record.routerIp || record.router_ip),
    umrMac: normalizeMacAddress(record.umrMac || record.umr_mac),
    mobilityWorkspaceId: String(record.mobilityWorkspaceId || record.mobility_workspace_id || '').trim(),
    mobilityDeviceId: String(record.mobilityDeviceId || record.mobility_device_id || '').trim(),
    switchIp: normalizeIpv4(record.switchIp || record.switch_ip),
    switchMac: normalizeMacAddress(record.switchMac || record.switch_mac),
    haIp: normalizeIpv4(record.haIp || record.ha_ip),
    haMac: normalizeMacAddress(record.haMac || record.ha_mac),
    knxIp: normalizeIpv4(record.knxIp || record.knx_ip),
    knxMac: normalizeMacAddress(record.knxMac || record.knx_mac),
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
  if (!normalized.domainLabel && normalized.locationId) {
    normalized.domainLabel = normalizeDomainLabel(
      [normalized.clientId, normalized.locationId].filter(Boolean).join('-'),
    );
  }
  if (!normalized.domainFqdn && normalized.domainLabel && DEFAULT_DOMAIN_SUFFIX) {
    normalized.domainFqdn = `${normalized.domainLabel}.${DEFAULT_DOMAIN_SUFFIX}`;
  }
  const validationErrors = validateNetworkSite(normalized);
  if (validationErrors.length) throw new Error(validationErrors.join('. '));
  if ((!normalized.wireGuardPrivateKey || !normalized.wireGuardPublicKey) && normalized.tunnelIp) {
    const keys = createWireGuardKeyPair();
    normalized.wireGuardPrivateKey = keys.privateKey;
    normalized.wireGuardPublicKey = keys.publicKey;
  }
  return normalized;
};

export const buildUmrConfigText = (site, options = {}) => {
  if (!site?.tunnelIp) throw new Error('Tunnel IP is required to generate the UMR file');
  if (!site?.wireGuardPrivateKey) throw new Error('WireGuard private key is missing for this location');
  const serverPublicKey = String(options.serverPublicKey || DEFAULT_WG_SERVER_PUBLIC_KEY).trim();
  const serverPublicHost = String(options.serverPublicHost || DEFAULT_SERVER_PUBLIC_HOST).trim();
  const listenPort = Number.parseInt(String(options.listenPort || DEFAULT_WG_LISTEN_PORT), 10)
    || DEFAULT_WG_LISTEN_PORT;
  if (!serverPublicKey) throw new Error('Server public key is not configured');
  return `[Interface]
Address = ${site.tunnelIp}/32
PrivateKey = ${site.wireGuardPrivateKey}
MTU = 1420

[Peer]
PublicKey = ${serverPublicKey}
Endpoint = ${serverPublicHost}:${listenPort}
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
      wireGuardReload: Boolean(WG_RELOAD_COMMAND || WG_SYNC_STATUS_PATH),
      caddyValidate: Boolean(CADDY_VALIDATE_COMMAND),
      caddyReload: Boolean(CADDY_RELOAD_COMMAND || CADDY_SYNC_STATUS_PATH),
    },
    syncStatus: {
      wireGuard: readSyncStatus(WG_SYNC_STATUS_PATH),
      caddy: readSyncStatus(CADDY_SYNC_STATUS_PATH),
    },
  };
};

export const deriveSiteRuntimeState = (site, runtimeConfig) => {
  const peers = Array.isArray(runtimeConfig?.active?.wireGuardPeers) ? runtimeConfig.active.wireGuardPeers : [];
  const caddySites = Array.isArray(runtimeConfig?.active?.caddySites) ? runtimeConfig.active.caddySites : [];
  const marker = buildSiteMarker(site);
  const matchingPeers = peers.filter((peer) => (
    peer.marker === marker
  ) || (
    (site.wireGuardPublicKey && peer.publicKey === site.wireGuardPublicKey)
    || (site.tunnelIp && peer.allowedIps.includes(`${site.tunnelIp}/32`))
    || (site.lanSubnet && peer.allowedIps.includes(site.lanSubnet))
  ));
  const matchedPeer = matchingPeers.find((peer) => peer.marker === marker)
    || matchingPeers[0]
    || null;
  const wireGuardDuplicate = matchingPeers.length > 1;
  const matchedCaddy = caddySites.find((entry) => (
    entry.marker === marker
  )) || caddySites.find((entry) => (
    site.domainFqdn
      ? entry.hosts.includes(site.domainFqdn)
      : site.domainLabel && DEFAULT_DOMAIN_SUFFIX
        ? entry.hosts.includes(`${site.domainLabel}.${DEFAULT_DOMAIN_SUFFIX}`)
        : false
  )) || null;
  const expectedAllowedIps = [`${site.tunnelIp}/32`, site.lanSubnet].filter(Boolean);
  const wireGuardDrifted = Boolean(matchedPeer) && (
    wireGuardDuplicate
    || (site.wireGuardPublicKey && matchedPeer.publicKey !== site.wireGuardPublicKey)
    || expectedAllowedIps.some((value) => !matchedPeer.allowedIps.includes(value))
  );
  const expectedReverseProxy = site.haIp ? `${site.haIp}:8123` : '';
  const caddyDrifted = Boolean(matchedCaddy) && (
    (site.domainFqdn && !matchedCaddy.hosts.includes(site.domainFqdn))
    || (expectedReverseProxy && matchedCaddy.reverseProxy !== expectedReverseProxy)
  );

  return {
    wireGuardApplied: Boolean(matchedPeer),
    caddyApplied: Boolean(matchedCaddy),
    wireGuardDrifted,
    wireGuardDuplicate,
    caddyDrifted,
    drifted: wireGuardDrifted || caddyDrifted,
    matchedPeer,
    matchedCaddy,
  };
};

const mutateSiteRuntimeConfig = (site, target = 'all', mode = 'apply') => {
  const normalizedTarget = String(target || 'all').trim().toLowerCase();
  if (!['all', 'wireguard', 'caddy'].includes(normalizedTarget)) {
    throw new Error('Target must be all, wireguard or caddy');
  }
  const runtimeConfig = getNetworkRuntimeConfig();
  const marker = buildSiteMarker(site);
  const result = {
    target: normalizedTarget,
    mode,
    updated: [],
    validate: {},
    reload: {},
    manualReloadRequired: [],
    reconciledWireGuardPeers: [],
  };
  const changes = [];
  if (normalizedTarget === 'all' || normalizedTarget === 'wireguard') {
    const original = runtimeConfig.active.wireGuardRaw || '';
    const reconciliation = reconcileWireGuardSiteConfig(original, site, mode);
    const next = reconciliation.content;
    result.reconciledWireGuardPeers = reconciliation.removedPeers;
    if (next !== original) {
      changes.push({
        key: 'wireGuard',
        resultKey: 'wireguard',
        path: DEFAULT_WG_CONFIG_PATH,
        original,
        existed: runtimeConfig.files.wireGuard.exists,
        writable: runtimeConfig.files.wireGuard.writable,
        next,
        validateCommand: WG_VALIDATE_COMMAND,
        reloadCommand: WG_RELOAD_COMMAND,
      });
    }
  }

  if (normalizedTarget === 'all' || normalizedTarget === 'caddy') {
    const original = runtimeConfig.active.caddyRaw || '';
    const next = mode === 'remove'
      ? removeManagedBlock(
        original,
        `# BEGIN SMARTI NETWORK SITE ${marker}`,
        `# END SMARTI NETWORK SITE ${marker}`,
      )
      : replaceManagedBlock(
        original,
        `# BEGIN SMARTI NETWORK SITE ${marker}`,
        `# END SMARTI NETWORK SITE ${marker}`,
        buildCaddySiteSnippet(site),
      );
    if (next !== original) {
      changes.push({
        key: 'caddy',
        resultKey: 'caddy',
        path: DEFAULT_CADDY_CONFIG_PATH,
        original,
        existed: runtimeConfig.files.caddy.exists,
        writable: runtimeConfig.files.caddy.writable,
        next,
        validateCommand: CADDY_VALIDATE_COMMAND,
        reloadCommand: CADDY_RELOAD_COMMAND,
      });
    }
  }

  const blocked = changes.find((change) => !change.writable);
  if (blocked) throw new Error(`${blocked.resultKey === 'wireguard' ? 'WireGuard' : 'Caddy'} config is not writable from the app runtime`);

  const written = [];
  try {
    changes.forEach((change) => {
      writeFileAtomic(change.path, change.next);
      written.push(change);
      result.updated.push(change.resultKey);
    });
    changes.forEach((change) => {
      const validation = runShellCommand(change.validateCommand);
      result.validate[change.key] = validation;
      if (validation.supported && !validation.ok) {
        throw new Error(`${change.resultKey === 'wireguard' ? 'WireGuard' : 'Caddy'} validation failed: ${validation.error || validation.output || 'unknown error'}`);
      }
    });
  } catch (error) {
    [...written].reverse().forEach((change) => {
      try {
        if (change.existed) writeFileAtomic(change.path, change.original);
        else if (existsSync(change.path)) unlinkSync(change.path);
      } catch {
        // Keep the original error. A failed rollback is visible in the runtime overview.
      }
    });
    throw error;
  }

  changes.forEach((change) => {
    const reload = runShellCommand(change.reloadCommand);
    const syncStatusPath = change.key === 'wireGuard' ? WG_SYNC_STATUS_PATH : CADDY_SYNC_STATUS_PATH;
    if (!reload.supported && syncStatusPath) {
      result.reload[change.key] = {
        supported: true,
        ok: true,
        queued: true,
        output: '',
        error: '',
      };
      return;
    }
    result.reload[change.key] = reload;
    if (!reload.supported) result.manualReloadRequired.push(change.resultKey);
  });
  return result;
};

export const applySiteToRuntimeConfig = (site, target = 'all') => (
  mutateSiteRuntimeConfig(site, target, 'apply')
);

export const removeSiteFromRuntimeConfig = (site, target = 'all') => (
  mutateSiteRuntimeConfig(site, target, 'remove')
);

export const networkDefaults = {
  backupRoot: DEFAULT_BACKUP_ROOT,
  domainSuffix: DEFAULT_DOMAIN_SUFFIX,
  serverPublicHost: DEFAULT_SERVER_PUBLIC_HOST,
  wireGuardListenPort: DEFAULT_WG_LISTEN_PORT,
  wireGuardServerPublicKey: DEFAULT_WG_SERVER_PUBLIC_KEY,
};
