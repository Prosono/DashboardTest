import { afterEach, describe, expect, it, vi } from 'vitest';

const jsonResponse = (payload) => ({
  ok: true,
  status: 200,
  text: async () => JSON.stringify(payload),
});

describe('UniFi Mobility operational data', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('returns useful device status while redacting VPN secrets', async () => {
    vi.stubEnv('UNIFI_MOBILITY_API_KEY', 'server-only-test-key');
    const fetchMock = vi.fn(async (url) => {
      if (String(url).includes('/clients?')) {
        return jsonResponse({
          data: [{
            id: 'client-1',
            name: 'SMARTi Hub',
            ipAddress: '192.168.107.120',
            macAddress: 'aa:bb:cc:dd:ee:ff',
            status: 'ONLINE',
          }],
          total: 1,
        });
      }
      return jsonResponse({
        data: {
          id: 'umr-1',
          name: 'Oslo UMR',
          status: 'ONLINE',
          cellular: {
            carrier: 'Telenor',
            rsrp: '-91',
          },
          vpn: {
            status: 'CONNECTED',
            privateKey: 'must-not-leave-server',
            peers: [{
              endpoint: 'vpn.example.no:51820',
              preshared_key: 'must-also-be-redacted',
            }],
          },
        },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { getUnifiMobilityDeviceSnapshot } = await import('../../server/unifiMobility.js');
    const snapshot = await getUnifiMobilityDeviceSnapshot('workspace-1', 'umr-1');

    expect(snapshot.device.cellular.carrier).toBe('Telenor');
    expect(snapshot.device.vpn).toEqual({
      status: 'CONNECTED',
      peers: [{ endpoint: 'vpn.example.no:51820' }],
    });
    expect(snapshot.clients[0]).toMatchObject({
      name: 'SMARTi Hub',
      online: true,
    });
    expect(fetchMock.mock.calls[0][1].headers['X-API-Key']).toBe('server-only-test-key');
    expect(JSON.stringify(snapshot)).not.toContain('must-not-leave-server');
    expect(JSON.stringify(snapshot)).not.toContain('must-also-be-redacted');
  });

  it('accepts the existing UNIFY_API_KEY environment variable', async () => {
    vi.stubEnv('UNIFI_MOBILITY_API_KEY', '');
    vi.stubEnv('UNIFY_API_KEY', 'existing-alias-key');

    const { getUnifiMobilityStatus } = await import('../../server/unifiMobility.js');

    expect(getUnifiMobilityStatus().configured).toBe(true);
  });
});
