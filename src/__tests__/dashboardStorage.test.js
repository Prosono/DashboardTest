import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  listSharedDashboards,
  saveSharedDashboardProfile,
  fetchSharedDashboardProfile,
  saveSharedDashboard,
  __resetDashboardStorageRuntime,
} from '../services/dashboardStorage';

describe('dashboardStorage profile-api integration', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    __resetDashboardStorageRuntime();
  });

  it('lists profiles from /api/profiles and normalizes ids by profile name', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (String(url).includes('/api/profiles?')) {
        return {
          ok: true,
          json: async () => ([
            { id: 'uuid-1', name: 'My Dash', updated_at: '2026-01-01T00:00:00.000Z' },
          ]),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    }));

    const profiles = await listSharedDashboards();
    expect(profiles.map((p) => p.id)).toEqual(['my_dash', 'default']);
  });

  it('saves a new named profile through POST /api/profiles', async () => {
    const fetchMock = vi.fn(async (url, options = {}) => {
      if (String(url).includes('/api/profiles?')) {
        return { ok: true, json: async () => ([]) };
      }
      if (String(url).endsWith('/api/profiles') && options.method === 'POST') {
        return {
          ok: true,
          json: async () => ({ id: 'uuid-2', name: 'Team Night', updated_at: '2026-01-01T00:00:00.000Z' }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    await saveSharedDashboardProfile('Team Night', { pagesConfig: { pages: ['home'], home: [] } });

    const postCall = fetchMock.mock.calls.find(([url, options]) => String(url).endsWith('/api/profiles') && options.method === 'POST');
    expect(postCall).toBeTruthy();
  });

  it('loads profile data from cached fallback when backend is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })));

    await saveSharedDashboardProfile('Team Night', { pagesConfig: { pages: ['home'], home: ['light.a'] } });

    const loaded = await fetchSharedDashboardProfile('Team Night');
    expect(loaded.pagesConfig.home).toEqual(['light.a']);
  });

  it('caches default dashboard when save fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })));

    await expect(saveSharedDashboard({ pagesConfig: { pages: ['home'], home: [] } })).resolves.toBeTruthy();

    expect(localStorage.getItem('tunet_shared_dashboard_cache')).toBeTruthy();
  });
});
