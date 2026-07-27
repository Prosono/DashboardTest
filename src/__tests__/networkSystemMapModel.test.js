import { describe, expect, it } from 'vitest';
import { buildNetworkSystemMap } from '../components/pages/networkSystemMapModel';

const componentIds = [
  'cellular',
  'umr',
  'wireguard',
  'server',
  'caddy',
  'domain',
  'hub',
  'knx',
  'equipment',
  'backup',
];

const configuredSite = {
  clientId: 'obf',
  locationId: 'sofienborg',
  routerIp: '192.168.107.1',
  umrMac: '94:2a:6f:e6:60:6f',
  mobilityDeviceId: 'umr-obf',
  lanSubnet: '192.168.107.0/24',
  haIp: '192.168.107.10',
  haMac: 'aa:bb:cc:dd:ee:01',
  knxIp: '192.168.107.20',
  knxMac: 'aa:bb:cc:dd:ee:02',
  tunnelIp: '10.88.0.5',
  domainFqdn: 'obf1.smarti.dev',
  backupDirectoryPath: '/srv/ha-backups/obf/sofienborg',
  hasWireGuardKeys: true,
};

describe('network system map model', () => {
  it('shows every component for a fully observed site', () => {
    const map = buildNetworkSystemMap({
      site: {
        ...configuredSite,
        runtime: {
          wireGuardApplied: true,
          wireGuardRuntimeAvailable: true,
          wireGuardHandshakeAt: '2026-07-27T09:59:15.000Z',
          wireGuardHandshakeRecent: true,
          wireGuardTransferRxBytes: 2048,
          wireGuardTransferTxBytes: 4096,
          caddyApplied: true,
        },
      },
      overview: {
        server: {
          publicHost: '65.21.203.69',
          wireGuardListenPort: 51820,
        },
      },
      detail: {
        operations: {
          remoteHealth: {
            status: 'up',
            checkedUrl: 'https://obf1.smarti.dev',
          },
          backup: {
            directoryExists: true,
            fileCount: 3,
            totalBytes: 8192,
            path: '/srv/ha-backups/obf/sofienborg',
          },
        },
      },
      mobilitySummary: { online: true, name: 'UMR OBF' },
      mobilitySnapshot: {
        device: {
          online: true,
          cellular: { carrier: 'Telia', technology: '4G' },
        },
      },
      hubClient: { online: true, name: 'SMARTi Hub' },
      knxClient: { online: true, name: 'KNX' },
    });

    expect(map.nodes.map((entry) => entry.id)).toEqual(componentIds);
    expect(map.nodes).toHaveLength(10);
    expect(map.edges).toHaveLength(9);
    expect(map.nodes.find((entry) => entry.id === 'wireguard')?.status).toBe('healthy');
    expect(map.nodes.find((entry) => entry.id === 'domain')?.status).toBe('healthy');
    expect(map.nodes.find((entry) => entry.id === 'backup')?.status).toBe('healthy');
    expect(map.nodes.find((entry) => entry.id === 'equipment')?.status).toBe('configured');
  });

  it('distinguishes published configuration from failed live checks', () => {
    const map = buildNetworkSystemMap({
      site: {
        ...configuredSite,
        runtime: {
          wireGuardApplied: true,
          wireGuardRuntimeAvailable: true,
          wireGuardHandshakeAt: null,
          wireGuardHandshakeRecent: false,
          caddyApplied: true,
        },
      },
      detail: {
        operations: {
          remoteHealth: {
            status: 'down',
            error: '502 Bad Gateway',
          },
          backup: {
            directoryExists: true,
            fileCount: 0,
          },
        },
      },
      mobilitySummary: { online: true },
      mobilitySnapshot: { device: { online: true } },
    });

    expect(map.nodes.find((entry) => entry.id === 'umr')?.status).toBe('healthy');
    expect(map.nodes.find((entry) => entry.id === 'wireguard')?.status).toBe('offline');
    expect(map.nodes.find((entry) => entry.id === 'caddy')?.status).toBe('offline');
    expect(map.nodes.find((entry) => entry.id === 'caddy')?.evidenceKey)
      .toBe('superAdminNetwork.systemMap.evidence.remoteFailed');
    expect(map.nodes.find((entry) => entry.id === 'domain')?.status).toBe('offline');
    expect(map.nodes.find((entry) => entry.id === 'hub')?.status).toBe('offline');
  });

  it('keeps the complete topology for an unconfigured instance', () => {
    const map = buildNetworkSystemMap({
      site: {
        clientId: 'new-client',
        locationId: 'new-site',
      },
    });

    expect(map.nodes.map((entry) => entry.id)).toEqual(componentIds);
    expect(map.nodes).toHaveLength(10);
    expect(map.edges).toHaveLength(9);
    expect(map.nodes.every((entry) => entry.status === 'unknown' || entry.id === 'server')).toBe(true);
  });

  it('shows the legacy KNX to Cedalo and cloud Home Assistant topology', () => {
    const map = buildNetworkSystemMap({
      site: {
        clientId: 'smeigedag',
        locationId: 'primary',
        architectureType: 'legacy_mqtt',
        knxIp: '192.168.10.20',
        knxMac: 'aa:bb:cc:dd:ee:10',
        mqttBroker: 'Cedalo',
        mqttTopicPrefix: 'smeigedag/#',
        proxmoxHost: 'proxmox-01',
        cloudHaHost: 'ha-smeigedag',
        domainFqdn: 'smeigedag.smarti.dev',
        backupDirectoryPath: '/srv/ha-backups/smeigedag/primary',
      },
      detail: {
        operations: {
          remoteHealth: {
            status: 'up',
            checkedUrl: 'https://smeigedag.smarti.dev',
          },
          backup: {
            directoryExists: true,
            fileCount: 2,
          },
        },
      },
    });

    expect(map.architectureType).toBe('legacy_mqtt');
    expect(map.nodes.map((entry) => entry.id)).toEqual([
      'equipment',
      'knx',
      'cedalo',
      'mqttTopics',
      'proxmox',
      'cloudHa',
      'domain',
      'backup',
    ]);
    expect(map.edges.map((entry) => entry.id)).toEqual([
      'equipment-knx',
      'knx-cedalo',
      'cedalo-topics',
      'topics-cloud-ha',
      'proxmox-cloud-ha',
      'cloud-ha-domain',
      'cloud-ha-backup',
    ]);
    expect(map.nodes.find((entry) => entry.id === 'cloudHa')?.status).toBe('healthy');
    expect(map.nodes.find((entry) => entry.id === 'cedalo')?.status).toBe('configured');
    expect(map.nodes.some((entry) => ['umr', 'wireguard', 'hub'].includes(entry.id))).toBe(false);
  });
});
