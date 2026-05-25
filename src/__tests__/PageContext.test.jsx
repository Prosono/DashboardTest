import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { PageProvider, usePages } from '../contexts/PageContext';

function Probe() {
  const ctx = usePages();
  return (
    <div>
      <span data-testid="has-profiles">{Array.isArray(ctx.globalDashboardProfiles) ? 'yes' : 'no'}</span>
      <span data-testid="has-save">{typeof ctx.saveGlobalDashboard === 'function' ? 'yes' : 'no'}</span>
      <span data-testid="has-load">{typeof ctx.loadGlobalDashboard === 'function' ? 'yes' : 'no'}</span>
      <span data-testid="page-count">{ctx.pagesConfig.pages.length}</span>
      <span data-testid="hidden-count">{ctx.hiddenCards.length}</span>
    </div>
  );
}

describe('PageProvider global dashboard context', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 404,
      json: async () => ({}),
    })));
  });

  it('exposes global dashboard storage fields without crashing', async () => {
    render(
      <PageProvider>
        <Probe />
      </PageProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('has-profiles')).toHaveTextContent('yes');
      expect(screen.getByTestId('has-save')).toHaveTextContent('yes');
      expect(screen.getByTestId('has-load')).toHaveTextContent('yes');
    });
  });

  it('falls back safely when cached dashboard state has invalid shapes', async () => {
    localStorage.setItem('tunet_shared_dashboard_cache', JSON.stringify({
      pagesConfig: { pages: 'home', home: { bad: true } },
      hiddenCards: { bad: true },
      pageSettings: 'bad',
      gridColumns: '3',
    }));

    render(
      <PageProvider>
        <Probe />
      </PageProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('page-count')).toHaveTextContent('1');
      expect(screen.getByTestId('hidden-count')).toHaveTextContent('0');
    });
  });
});
