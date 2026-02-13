import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  listSharedDashboards,
  saveSharedDashboardProfile,
  fetchSharedDashboardProfile,
  __resetDashboardStorageRuntime,
} from '../services/dashboardStorage';

describe('dashboardStorage fallbacks', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    __resetDashboardStorageRuntime();
  });

  it('falls back to default envelope when /profiles list is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url, options = {}) => {
      if (String(url).endsWith('/profiles') && options.method === 'GET') {
        return { ok: false, status: 405, json: async () => ({}) };
      }
      if (String(url).endsWith('/api/dashboard-config') && options.method === 'GET') {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            updatedAt: '2026-01-01T00:00:00.000Z',
            data: {
              __saved_profiles__: {
                my_dash: {
                  id: 'my_dash',
                  name: 'My Dash',
                  updatedAt: '2026-01-01T00:00:00.000Z',
                  data: { pagesConfig: { pages: ['home'], home: [] } },
                },
              },
            },
          }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    }));

    const profiles = await listSharedDashboards();

    expect(profiles.map((p) => p.id)).toEqual(['default', 'my_dash']);
  });

  it('stores named profile in embedded default payload when profile save endpoint fails', async () => {
    const fetchMock = vi.fn(async (url, options = {}) => {
      if (String(url).includes('/profiles/') && options.method === 'PUT') {
        return { ok: false, status: 500, json: async () => ({}) };
      }
      if (String(url).endsWith('/api/dashboard-config') && options.method === 'GET') {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            updatedAt: '2026-01-01T00:00:00.000Z',
            data: { existing: true },
          }),
        };
      }
      if (String(url).endsWith('/api/dashboard-config') && options.method === 'PUT') {
        return { ok: true, status: 200, json: async () => ({}) };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    await saveSharedDashboardProfile('Team Night', { pagesConfig: { pages: ['home'], home: [] } });

    const putCall = fetchMock.mock.calls.find(([url, options]) => String(url).endsWith('/api/dashboard-config') && options.method === 'PUT');
    const payload = JSON.parse(putCall[1].body);

    expect(payload.data.__saved_profiles__.team_night.name).toBe('Team Night');
  });


  it('stops probing /profiles after first unsupported response to prevent request spam', async () => {
    const fetchMock = vi.fn(async (url, options = {}) => {
      if (String(url).endsWith('/profiles') && options.method === 'GET') {
        return { ok: false, status: 404, json: async () => ({}) };
      }
      if (String(url).endsWith('/api/dashboard-config') && options.method === 'GET') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ updatedAt: '2026-01-01T00:00:00.000Z', data: {} }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    await listSharedDashboards();
    await listSharedDashboards();

    const profileGets = fetchMock.mock.calls.filter(([url, options]) => String(url).endsWith('/profiles') && options?.method === 'GET');
    expect(profileGets).toHaveLength(1);
  });

  it('loads named profile from embedded default payload when profile load endpoint fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url, options = {}) => {
      if (String(url).includes('/profiles/') && options.method === 'GET') {
        return { ok: false, status: 503, json: async () => ({}) };
      }
      if (String(url).endsWith('/api/dashboard-config') && options.method === 'GET') {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            updatedAt: '2026-01-01T00:00:00.000Z',
            data: {
              __saved_profiles__: {
                team_night: {
                  id: 'team_night',
                  name: 'Team Night',
                  updatedAt: '2026-01-01T00:00:00.000Z',
                  data: { pagesConfig: { pages: ['home'], home: ['light.a'] } },
                },
              },
            },
          }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    }));

    const loaded = await fetchSharedDashboardProfile('Team Night');
    expect(loaded.pagesConfig.home).toEqual(['light.a']);
  });
});
