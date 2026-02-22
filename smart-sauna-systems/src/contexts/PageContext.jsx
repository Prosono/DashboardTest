import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { DEFAULT_PAGES_CONFIG } from '../config/defaults';
import {
  fetchSharedDashboard,
  fetchSharedDashboardProfile,
  listSharedDashboards,
  readCachedDashboard,
  saveSharedDashboard,
  saveSharedDashboardProfile,
  toProfileId,
  writeCachedDashboard,
} from '../services/dashboardStorage';

const readJSON = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (error) {
    console.error(`Failed to parse ${key}:`, error);
    return fallback;
  }
};

const readNumber = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw === null ? NaN : Number(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
  } catch (error) {
    console.error(`Failed to read ${key}:`, error);
    return fallback;
  }
};

const deprecatedCardIds = ['power', 'rocky', 'climate', 'shield', 'weather', 'car', 'sonos'];
const DEFAULT_SECTION_SPACING = {
  headerToStatus: 16,
  statusToNav: 24,
  navToGrid: 24,
};

const getDefaultDashboardState = () => ({
  pagesConfig: DEFAULT_PAGES_CONFIG,
  cardSettings: {},
  customNames: {},
  customIcons: {},
  hiddenCards: [],
  pageSettings: {},
  gridColumns: 4,
  gridGapH: 20,
  gridGapV: 20,
  cardBorderRadius: 16,
  headerScale: 1,
  sectionSpacing: DEFAULT_SECTION_SPACING,
  headerTitle: '',
  headerSettings: { showTitle: true, showClock: true, showDate: true },
  statusPillsConfig: [],
});

function normalizePagesConfig(parsed) {
  if (!parsed) return DEFAULT_PAGES_CONFIG;

  const next = { ...parsed };

  if (next.automations) { delete next.automations; }
  if (next.lights) { delete next.lights; }

  Object.keys(next).forEach(pageKey => {
    if (Array.isArray(next[pageKey])) {
      const filtered = next[pageKey].filter(id =>
        !deprecatedCardIds.includes(id) && !String(id).startsWith('energy_price_')
      );
      if (filtered.length !== next[pageKey].length) {
        next[pageKey] = filtered;
      }
    }
  });

  if (!Array.isArray(next.pages)) {
    const detectedPages = Object.keys(next)
      .filter(key => Array.isArray(next[key]) &&
        !['header', 'settings', 'lights', 'automations'].includes(key));
    next.pages = detectedPages.length > 0 ? detectedPages : ['home'];
  }

  next.pages = next.pages.filter(id => id !== 'settings' && id !== 'lights' && id !== 'automations');
  if (next.pages.length === 0) { next.pages = ['home']; }

  next.pages.forEach((pageId) => {
    if (!Array.isArray(next[pageId])) { next[pageId] = []; }
  });

  if (!next.header) { next.header = []; }

  return next;
}

function normalizeDashboardState(raw) {
  const defaults = getDefaultDashboardState();
  const source = raw || {};

  const spacingSaved = source.sectionSpacing;
  const sectionSpacing = spacingSaved
    ? {
      headerToStatus: Number.isFinite(spacingSaved.headerToStatus) ? spacingSaved.headerToStatus : DEFAULT_SECTION_SPACING.headerToStatus,
      statusToNav: Number.isFinite(spacingSaved.statusToNav) ? spacingSaved.statusToNav : DEFAULT_SECTION_SPACING.statusToNav,
      navToGrid: Number.isFinite(spacingSaved.navToGrid) ? spacingSaved.navToGrid : DEFAULT_SECTION_SPACING.navToGrid,
    }
    : defaults.sectionSpacing;

  const normalizedPageSettings = { ...(source.pageSettings || {}) };
  Object.keys(normalizedPageSettings).forEach((pageId) => {
    if (normalizedPageSettings[pageId]?.type === 'sonos') {
      normalizedPageSettings[pageId] = { ...normalizedPageSettings[pageId], type: 'media' };
    }
  });

  return {
    pagesConfig: normalizePagesConfig(source.pagesConfig),
    cardSettings: source.cardSettings || defaults.cardSettings,
    customNames: source.customNames || defaults.customNames,
    customIcons: source.customIcons || defaults.customIcons,
    hiddenCards: (source.hiddenCards || defaults.hiddenCards).filter(id => !deprecatedCardIds.includes(id)),
    pageSettings: normalizedPageSettings,
    gridColumns: Number.isFinite(source.gridColumns) ? source.gridColumns : defaults.gridColumns,
    gridGapH: Number.isFinite(source.gridGapH) ? source.gridGapH : defaults.gridGapH,
    gridGapV: Number.isFinite(source.gridGapV) ? source.gridGapV : defaults.gridGapV,
    cardBorderRadius: Number.isFinite(source.cardBorderRadius) ? source.cardBorderRadius : defaults.cardBorderRadius,
    headerScale: Number.isFinite(source.headerScale) ? source.headerScale : defaults.headerScale,
    sectionSpacing,
    headerTitle: typeof source.headerTitle === 'string' ? source.headerTitle : defaults.headerTitle,
    headerSettings: source.headerSettings || defaults.headerSettings,
    statusPillsConfig: Array.isArray(source.statusPillsConfig) ? source.statusPillsConfig : defaults.statusPillsConfig,
  };
}

const getBookingSnapshotVersion = (setting) => {
  const parsed = Number(setting?.bookingSnapshotsUpdatedAt);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const hasBookingSnapshotData = (setting) => Array.isArray(setting?.bookingSnapshots);

function mergeCardSettingsByBookingSnapshots(remoteCardSettings, localCardSettings) {
  const remote = remoteCardSettings && typeof remoteCardSettings === 'object' ? remoteCardSettings : {};
  const local = localCardSettings && typeof localCardSettings === 'object' ? localCardSettings : {};
  if (!Object.keys(local).length) return remote;

  const merged = { ...remote };
  const keys = new Set([...Object.keys(remote), ...Object.keys(local)]);
  keys.forEach((key) => {
    const localEntry = local[key];
    if (!localEntry || typeof localEntry !== 'object') return;

    const remoteEntry = remote[key];
    if (!remoteEntry || typeof remoteEntry !== 'object') {
      if (hasBookingSnapshotData(localEntry)) {
        merged[key] = { ...localEntry };
      }
      return;
    }

    const localVersion = getBookingSnapshotVersion(localEntry);
    const remoteVersion = getBookingSnapshotVersion(remoteEntry);
    if (localVersion === 0 && remoteVersion === 0) return;

    if (localVersion > remoteVersion) {
      merged[key] = {
        ...remoteEntry,
        bookingSnapshots: hasBookingSnapshotData(localEntry) ? localEntry.bookingSnapshots : [],
        bookingSnapshotsUpdatedAt: localVersion,
      };
    }
  });

  return merged;
}

function mergeDashboardStateWithLocalSnapshots(remoteState, localState) {
  if (!remoteState || typeof remoteState !== 'object') return remoteState;
  if (!localState || typeof localState !== 'object') return remoteState;

  return {
    ...remoteState,
    cardSettings: mergeCardSettingsByBookingSnapshots(remoteState.cardSettings, localState.cardSettings),
  };
}

function loadLegacyLocalStorageState() {
  const state = getDefaultDashboardState();
  state.pagesConfig = normalizePagesConfig(readJSON('tunet_pages_config', null));

  const hidden = readJSON('tunet_hidden_cards', null);
  if (hidden) state.hiddenCards = hidden.filter(id => !deprecatedCardIds.includes(id));

  state.customNames = readJSON('tunet_custom_names', state.customNames) || {};
  state.customIcons = readJSON('tunet_custom_icons', state.customIcons) || {};
  state.cardSettings = readJSON('tunet_card_settings', state.cardSettings) || {};

  const pageSettingsSaved = readJSON('tunet_page_settings', null);
  if (pageSettingsSaved) {
    const nextSettings = { ...pageSettingsSaved };
    Object.keys(nextSettings).forEach((pageId) => {
      if (nextSettings[pageId]?.type === 'sonos') {
        nextSettings[pageId] = { ...nextSettings[pageId], type: 'media' };
      }
    });
    state.pageSettings = nextSettings;
  }

  const savedCols = readNumber('tunet_grid_columns', null);
  if (savedCols !== null) state.gridColumns = savedCols;
  const savedGap = readNumber('tunet_grid_gap', null);
  const savedGapH = readNumber('tunet_grid_gap_h', null);
  const savedGapV = readNumber('tunet_grid_gap_v', null);
  if (savedGapH !== null) state.gridGapH = savedGapH;
  else if (savedGap !== null) state.gridGapH = savedGap;
  if (savedGapV !== null) state.gridGapV = savedGapV;
  else if (savedGap !== null) state.gridGapV = savedGap;

  const savedRadius = readNumber('tunet_card_border_radius', null);
  if (savedRadius !== null) state.cardBorderRadius = savedRadius;
  const savedScale = readNumber('tunet_header_scale', null);
  if (savedScale !== null) state.headerScale = savedScale;

  const spacingSaved = readJSON('tunet_section_spacing', null);
  if (spacingSaved) {
    state.sectionSpacing = {
      headerToStatus: Number.isFinite(spacingSaved.headerToStatus) ? spacingSaved.headerToStatus : DEFAULT_SECTION_SPACING.headerToStatus,
      statusToNav: Number.isFinite(spacingSaved.statusToNav) ? spacingSaved.statusToNav : DEFAULT_SECTION_SPACING.statusToNav,
      navToGrid: Number.isFinite(spacingSaved.navToGrid) ? spacingSaved.navToGrid : DEFAULT_SECTION_SPACING.navToGrid,
    };
  }

  state.headerTitle = localStorage.getItem('tunet_header_title') || '';
  state.headerSettings = readJSON('tunet_header_settings', state.headerSettings) || state.headerSettings;
  state.statusPillsConfig = readJSON('tunet_status_pills_config', state.statusPillsConfig) || [];

  return state;
}

const PageContext = createContext(null);

export const usePages = () => {
  const context = useContext(PageContext);
  if (!context) {
    throw new Error('usePages must be used within PageProvider');
  }
  return context;
};

export const PageProvider = ({ children }) => {
  const cachedState = normalizeDashboardState(readCachedDashboard() || loadLegacyLocalStorageState());
  const [pagesConfig, setPagesConfig] = useState(cachedState.pagesConfig);
  const [cardSettings, setCardSettings] = useState(cachedState.cardSettings);
  const [customNames, setCustomNames] = useState(cachedState.customNames);
  const [customIcons, setCustomIcons] = useState(cachedState.customIcons);
  const [hiddenCards, setHiddenCards] = useState(cachedState.hiddenCards);
  const [pageSettings, setPageSettings] = useState(cachedState.pageSettings);
  const [gridColumns, setGridColumns] = useState(cachedState.gridColumns);
  const [gridGapH, setGridGapH] = useState(cachedState.gridGapH);
  const [gridGapV, setGridGapV] = useState(cachedState.gridGapV);
  const [cardBorderRadius, setCardBorderRadius] = useState(cachedState.cardBorderRadius);
  const [headerScale, setHeaderScale] = useState(cachedState.headerScale);
  const [sectionSpacing, setSectionSpacing] = useState(cachedState.sectionSpacing);
  const [headerTitle, setHeaderTitle] = useState(cachedState.headerTitle);
  const [headerSettings, setHeaderSettings] = useState(cachedState.headerSettings);
  const [statusPillsConfig, setStatusPillsConfig] = useState(cachedState.statusPillsConfig);

  const [globalDashboardState, setGlobalDashboardState] = useState({
    profiles: [{ id: 'default', name: 'default', updatedAt: null }],
    busy: false,
    error: '',
  });

  const setGlobalBusy = (busy) => setGlobalDashboardState((prev) => ({ ...prev, busy }));
  const setGlobalError = (error) => setGlobalDashboardState((prev) => ({ ...prev, error }));
  const setGlobalProfiles = (profiles) => setGlobalDashboardState((prev) => ({ ...prev, profiles }));

  const getDashboardStateSnapshot = useCallback(() => ({
    pagesConfig,
    cardSettings,
    customNames,
    customIcons,
    hiddenCards,
    pageSettings,
    gridColumns,
    gridGapH,
    gridGapV,
    cardBorderRadius,
    headerScale,
    sectionSpacing,
    headerTitle,
    headerSettings,
    statusPillsConfig,
  }), [
    pagesConfig,
    cardSettings,
    customNames,
    customIcons,
    hiddenCards,
    pageSettings,
    gridColumns,
    gridGapH,
    gridGapV,
    cardBorderRadius,
    headerScale,
    sectionSpacing,
    headerTitle,
    headerSettings,
    statusPillsConfig,
  ]);

  const applyDashboardState = useCallback((rawState) => {
    const normalized = normalizeDashboardState(rawState);
    setPagesConfig(normalized.pagesConfig);
    setCardSettings(normalized.cardSettings);
    setCustomNames(normalized.customNames);
    setCustomIcons(normalized.customIcons);
    setHiddenCards(normalized.hiddenCards);
    setPageSettings(normalized.pageSettings);
    setGridColumns(normalized.gridColumns);
    setGridGapH(normalized.gridGapH);
    setGridGapV(normalized.gridGapV);
    setCardBorderRadius(normalized.cardBorderRadius);
    setHeaderScale(normalized.headerScale);
    setSectionSpacing(normalized.sectionSpacing);
    setHeaderTitle(normalized.headerTitle);
    setHeaderSettings(normalized.headerSettings);
    setStatusPillsConfig(normalized.statusPillsConfig);
    writeCachedDashboard(normalized);
  }, []);

  const refreshGlobalDashboards = useCallback(async () => {
    setGlobalError('');
    try {
      const profiles = await listSharedDashboards();
      setGlobalProfiles(profiles);
      return profiles;
    } catch (error) {
      console.warn('Failed to list global dashboards.', error);
      setGlobalError('Unable to list global dashboards.');
      return [];
    }
  }, []);

  const saveGlobalDashboard = useCallback(async (profileId = 'default') => {
    const profile = toProfileId(profileId);
    setGlobalBusy(true);
    setGlobalError('');
    try {
      const snapshot = getDashboardStateSnapshot();
      if (profile === 'default') {
        await saveSharedDashboard(snapshot);
      } else {
        await saveSharedDashboardProfile(profile, snapshot);
      }
      await refreshGlobalDashboards();
      return true;
    } catch (error) {
      console.warn('Failed to save global dashboard.', error);
      setGlobalError('Unable to save dashboard globally.');
      return false;
    } finally {
      setGlobalBusy(false);
    }
  }, [refreshGlobalDashboards, getDashboardStateSnapshot]);

  const loadGlobalDashboard = useCallback(async (profileId = 'default') => {
    const profile = toProfileId(profileId);
    setGlobalBusy(true);
    setGlobalError('');
    try {
      const data = profile === 'default'
        ? await fetchSharedDashboard()
        : await fetchSharedDashboardProfile(profile);
      if (!data) {
        setGlobalError('Selected dashboard is empty or missing.');
        return false;
      }
      applyDashboardState(data);
      return true;
    } catch (error) {
      console.warn('Failed to load global dashboard.', error);
      setGlobalError('Unable to load selected global dashboard.');
      return false;
    } finally {
      setGlobalBusy(false);
    }
  }, [applyDashboardState]);

  useEffect(() => {
    let cancelled = false;

    const initShared = async () => {
      try {
        const remoteData = await fetchSharedDashboard();
        if (!cancelled && remoteData) {
          const localSnapshot = getDashboardStateSnapshot();
          const mergedRemoteData = mergeDashboardStateWithLocalSnapshots(remoteData, localSnapshot);
          applyDashboardState(mergedRemoteData);
        }
      } catch (error) {
        console.warn('Failed to load shared dashboard config on startup. Using cache/local fallback.', error);
      } finally {
        if (!cancelled) refreshGlobalDashboards();
      }
    };

    initShared();

    return () => {
      cancelled = true;
    };
  }, [applyDashboardState, getDashboardStateSnapshot, refreshGlobalDashboards]);

  useEffect(() => {
    writeCachedDashboard({
      pagesConfig,
      cardSettings,
      customNames,
      customIcons,
      hiddenCards,
      pageSettings,
      gridColumns,
      gridGapH,
      gridGapV,
      cardBorderRadius,
      headerScale,
      sectionSpacing,
      headerTitle,
      headerSettings,
      statusPillsConfig,
    });
  }, [
    pagesConfig,
    cardSettings,
    customNames,
    customIcons,
    hiddenCards,
    pageSettings,
    gridColumns,
    gridGapH,
    gridGapV,
    cardBorderRadius,
    headerScale,
    sectionSpacing,
    headerTitle,
    headerSettings,
    statusPillsConfig,
  ]);

  const saveCustomName = (id, name) => {
    const newNames = { ...customNames, [id]: name };
    setCustomNames(newNames);
  };

  const saveCustomIcon = (id, iconName) => {
    const newIcons = { ...customIcons, [id]: iconName };
    setCustomIcons(newIcons);
  };

  const saveCardSetting = (id, setting, value) => {
    setCardSettings((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || {}), [setting]: value },
    }));
  };

  const savePageSetting = (id, setting, value) => {
    setPageSettings((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || {}), [setting]: value },
    }));
  };

  const persistPageSettings = (newSettings) => {
    setPageSettings(newSettings);
  };

  const toggleCardVisibility = (cardId) => {
    const newHidden = hiddenCards.includes(cardId)
      ? hiddenCards.filter(id => id !== cardId)
      : [...hiddenCards, cardId];
    setHiddenCards(newHidden);
  };

  const updateHeaderScale = (newScale) => {
    setHeaderScale(newScale);
  };

  const updateHeaderTitle = (newTitle) => {
    setHeaderTitle(newTitle);
  };

  const updateSectionSpacing = (partial) => {
    const nextSpacing = { ...sectionSpacing, ...partial };
    setSectionSpacing(nextSpacing);
  };

  const updateHeaderSettings = (newSettings) => {
    setHeaderSettings(newSettings);
  };

  const saveStatusPillsConfig = (newConfig) => {
    setStatusPillsConfig(newConfig);
  };

  const persistConfig = (newConfig) => {
    setPagesConfig(newConfig);
  };

  const safeGlobalDashboardProfiles = Array.isArray(globalDashboardState?.profiles)
    ? globalDashboardState.profiles
    : [{ id: 'default', name: 'default', updatedAt: null }];
  const safeGlobalStorageBusy = Boolean(globalDashboardState?.busy);
  const safeGlobalStorageError = typeof globalDashboardState?.error === 'string'
    ? globalDashboardState.error
    : '';

  const value = {
    pagesConfig,
    setPagesConfig,
    persistConfig,
    cardSettings,
    setCardSettings,
    saveCardSetting,
    customNames,
    saveCustomName,
    customIcons,
    saveCustomIcon,
    hiddenCards,
    toggleCardVisibility,
    pageSettings,
    setPageSettings,
    persistPageSettings,
    savePageSetting,
    gridColumns,
    setGridColumns,
    headerScale,
    updateHeaderScale,
    headerTitle,
    updateHeaderTitle,
    headerSettings,
    updateHeaderSettings,
    sectionSpacing,
    updateSectionSpacing,
    persistCardSettings: setCardSettings,
    gridGapH,
    setGridGapH,
    gridGapV,
    setGridGapV,
    statusPillsConfig,
    saveStatusPillsConfig,
    cardBorderRadius,
    setCardBorderRadius: (val) => {
      setCardBorderRadius(val);
      document.documentElement.style.setProperty('--card-border-radius', `${val}px`);
    },
    globalDashboardProfiles: safeGlobalDashboardProfiles,
    globalStorageBusy: safeGlobalStorageBusy,
    globalStorageError: safeGlobalStorageError,
    refreshGlobalDashboards,
    saveGlobalDashboard,
    loadGlobalDashboard,
  };

  return (
    <PageContext.Provider value={value}>
      {children}
    </PageContext.Provider>
  );
};
