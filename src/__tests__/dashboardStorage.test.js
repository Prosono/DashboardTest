import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  listSharedDashboards,
  saveSharedDashboardProfile,
  fetchSharedDashboardProfile,
  saveSharedDashboard,
  __resetDashboardStorageRuntime,
} from '../services/dashboardStorage';

describe('dashboardStorage dashboard-api integration', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('tunet_app_auth_token', 'test-token');
    vi.restoreAllMocks();
    __resetDashboardStorageRuntime();
  });

  it('lists dashboards from /api/dashboards', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (String(url).includes('/api/dashboards')) {
        return {
          ok: true,
          json: async () => ({ dashboards: [{ id: 'default', name: 'Default', updatedAt: '2026-01-01T00:00:00.000Z' }] }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    }));

    const profiles = await listSharedDashboards();
    expect(profiles[0].id).toBe('default');
  });

  it('saves named dashboard by creating on 404', async () => {
    const fetchMock = vi.fn(async (url, options = {}) => {
      if (String(url).includes('/api/dashboards/team_night') && options.method === 'PUT') {
        return { ok: false, status: 404, json: async () => ({}) };
      }
      if (String(url).endsWith('/api/dashboards') && options.method === 'POST') {
        return { ok: true, status: 201, json: async () => ({ dashboard: { id: 'team_night' } }) };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    await saveSharedDashboardProfile('Team Night', { pagesConfig: { pages: ['home'], home: [] } });

    const postCall = fetchMock.mock.calls.find(([url, options]) => String(url).endsWith('/api/dashboards') && options.method === 'POST');
    expect(postCall).toBeTruthy();
  });

  it('loads default dashboard from local cache when API fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })));
    localStorage.setItem('tunet_shared_dashboard_cache', JSON.stringify({ pagesConfig: { pages: ['home'], home: ['light.a'] } }));

    const loaded = await fetchSharedDashboardProfile('default');
    expect(loaded.pagesConfig.home).toEqual(['light.a']);
  });

  it('caches default dashboard on save', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ dashboard: { id: 'default' } }) })));

    await expect(saveSharedDashboard({ pagesConfig: { pages: ['home'], home: [] } })).resolves.toBeTruthy();

    expect(localStorage.getItem('tunet_shared_dashboard_cache')).toBeTruthy();
  });
});
