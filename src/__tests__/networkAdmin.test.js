import { describe, expect, it } from 'vitest';
import {
  createNetworkSiteFromInput,
  buildUmrConfigText,
  deriveSiteRuntimeState,
  isValidDomainName,
  isValidIpv4,
  isValidIpv4Cidr,
  isValidMacAddress,
  parseCaddyConfig,
  parseWireGuardConfig,
  validateNetworkSite,
} from '../../server/networkAdmin.js';

const marker = 'client-a/oslo';

describe('network admin config inspection', () => {
  it('retains managed WireGuard and Caddy markers', () => {
    const wireGuard = parseWireGuardConfig(`# server
# BEGIN SMARTI NETWORK SITE ${marker}
[Peer]
# Oslo
PublicKey = public-key-a
AllowedIPs = 10.88.0.4/32, 192.168.40.0/24
# END SMARTI NETWORK SITE ${marker}
`);
    const caddy = parseCaddyConfig(`# BEGIN SMARTI NETWORK SITE ${marker}
oslo.example.no {
  encode gzip
  reverse_proxy 192.168.40.10:8123
}
# END SMARTI NETWORK SITE ${marker}
`);

    expect(wireGuard).toHaveLength(1);
    expect(wireGuard[0].marker).toBe(marker);
    expect(caddy).toHaveLength(1);
    expect(caddy[0].marker).toBe(marker);
  });

  it('detects live config and drift against the expected node', () => {
    const site = {
      clientId: 'client-a',
      locationId: 'oslo',
      wireGuardPublicKey: 'expected-key',
      tunnelIp: '10.88.0.4',
      lanSubnet: '192.168.40.0/24',
      domainFqdn: 'oslo.example.no',
      haIp: '192.168.40.10',
    };
    const runtimeConfig = {
      active: {
        wireGuardPeers: [{
          marker,
          publicKey: 'wrong-key',
          allowedIps: ['10.88.0.4/32', '192.168.40.0/24'],
        }],
        caddySites: [{
          marker,
          hosts: ['oslo.example.no'],
          reverseProxy: '192.168.40.99:8123',
        }],
      },
    };

    expect(deriveSiteRuntimeState(site, runtimeConfig)).toMatchObject({
      wireGuardApplied: true,
      caddyApplied: true,
      wireGuardDrifted: true,
      caddyDrifted: true,
      drifted: true,
    });
  });

  it('rejects malformed addressing before config is written', () => {
    expect(isValidIpv4('192.168.1.10')).toBe(true);
    expect(isValidIpv4('192.168.1.999')).toBe(false);
    expect(isValidIpv4Cidr('192.168.1.0/24')).toBe(true);
    expect(isValidIpv4Cidr('192.168.1.0/99')).toBe(false);
    expect(isValidDomainName('node.example.no')).toBe(true);
    expect(isValidDomainName('bad_domain.example.no')).toBe(false);
    expect(validateNetworkSite({
      tunnelIp: '10.88.0.999',
      lanSubnet: '192.168.1.0/99',
    })).toHaveLength(2);
  });

  it('creates client-scoped default domains for similarly named nodes', () => {
    const first = createNetworkSiteFromInput({
      clientId: 'client-a',
      locationId: 'primary',
    });
    const second = createNetworkSiteFromInput({
      clientId: 'client-b',
      locationId: 'primary',
    });

    expect(first.domainLabel).toBe('client-a-primary');
    expect(second.domainLabel).toBe('client-b-primary');
    expect(first.domainFqdn).not.toBe(second.domainFqdn);
  });

  it('normalizes site equipment and emits a UMR-safe WireGuard profile', () => {
    expect(isValidMacAddress('AA-BB-CC-DD-EE-FF')).toBe(true);
    expect(isValidMacAddress('not-a-mac')).toBe(false);

    const site = createNetworkSiteFromInput({
      clientId: 'client-a',
      locationId: 'oslo',
      tunnelIp: '10.88.0.8',
      lanSubnet: '192.168.80.0/24',
      routerIp: '192.168.80.1',
      switchIp: '192.168.80.2',
      switchMac: 'AA-BB-CC-DD-EE-FF',
      haIp: '192.168.80.120',
      knxIp: '192.168.80.10',
    });
    const profile = buildUmrConfigText(site, {
      serverPublicKey: 'server-public-key',
      serverPublicHost: 'vpn.example.no',
      listenPort: 51820,
    });

    expect(site.switchMac).toBe('aa:bb:cc:dd:ee:ff');
    expect(profile).toContain('MTU = 1420');
    expect(profile).toContain('PersistentKeepalive = 25');
  });
});
