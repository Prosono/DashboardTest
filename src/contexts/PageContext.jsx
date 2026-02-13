import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { DEFAULT_PAGES_CONFIG } from '../config/defaults';
import {
  SAVE_DEBOUNCE_MS,
  fetchSharedDashboard,
  readCachedDashboard,
  saveSharedDashboard,
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
  const raw = localStorage.getItem(key);
  const parsed = raw === null ? NaN : Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
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

  // Remove legacy automations/lights page config entirely
  if (parsed.automations) { delete parsed.automations; }
  if (parsed.lights) { delete parsed.lights; }

  // Remove deprecated cards
  Object.keys(parsed).forEach(pageKey => {
    if (Array.isArray(parsed[pageKey])) {
      const filtered = parsed[pageKey].filter(id =>
        !deprecatedCardIds.includes(id) && !String(id).startsWith('energy_price_')
      );
      if (filtered.length !== parsed[pageKey].length) {
        parsed[pageKey] = filtered;
      }
    }
  });

  // Ensure pages array exists
  if (!Array.isArray(parsed.pages)) {
    const detectedPages = Object.keys(parsed)
      .filter(key => Array.isArray(parsed[key]) &&
        !['header', 'settings', 'lights', 'automations'].includes(key));
    parsed.pages = detectedPages.length > 0 ? detectedPages : ['home'];
  }

  // Filter out settings, automations, and lights from pages
  parsed.pages = parsed.pages.filter(id => id !== 'settings' && id !== 'lights' && id !== 'automations');
  if (parsed.pages.length === 0) { parsed.pages = ['home']; }

  // Ensure all pages have arrays
  parsed.pages.forEach((pageId) => {
    if (!Array.isArray(parsed[pageId])) { parsed[pageId] = []; }
  });

  // Ensure header exists
  if (!parsed.header) { parsed.header = []; }

  return parsed;
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
  const hasLoadedRemote = useRef(false);
  const [storageReady, setStorageReady] = useState(false);
  const saveTimer = useRef(null);

  useEffect(() => {
    let cancelled = false;

    const loadShared = async () => {
      try {
        const remoteData = await fetchSharedDashboard();
        if (cancelled || !remoteData) {
          hasLoadedRemote.current = true;
          setStorageReady(true);
          return;
        }
        const normalized = normalizeDashboardState(remoteData);
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
      } catch (error) {
        console.warn('Failed to load shared dashboard config, using cached/local fallback.', error);
      } finally {
        if (!cancelled) {
          hasLoadedRemote.current = true;
          setStorageReady(true);
        }
      }
    };

    loadShared();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hasLoadedRemote.current || !storageReady) return;

    const payload = {
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
    };

    writeCachedDashboard(payload);

    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveSharedDashboard(payload).catch((error) => {
        console.warn('Failed to persist shared dashboard config.', error);
      });
    }, SAVE_DEBOUNCE_MS);

    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
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
    storageReady,
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
    const newSettings = { ...cardSettings, [id]: { ...cardSettings[id], [setting]: value } };
    setCardSettings(newSettings);
  };

  const savePageSetting = (id, setting, value) => {
    const newSettings = { 
      ...pageSettings, 
      [id]: { ...(pageSettings[id] || {}), [setting]: value } 
    };
    setPageSettings(newSettings);
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
    setGridColumns: (val) => {
      setGridColumns(val);
    },
    headerScale,
    updateHeaderScale,
    headerTitle,
    updateHeaderTitle,
    headerSettings,
    updateHeaderSettings,
    sectionSpacing,
    updateSectionSpacing,
    persistCardSettings: (newSettings) => {
      setCardSettings(newSettings);
    },
    gridGapH,
    setGridGapH: (val) => {
      setGridGapH(val);
    },
    gridGapV,
    setGridGapV: (val) => {
      setGridGapV(val);
    },
    statusPillsConfig,
    saveStatusPillsConfig,
    cardBorderRadius,
    setCardBorderRadius: (val) => {
      setCardBorderRadius(val);
      document.documentElement.style.setProperty('--card-border-radius', `${val}px`);
    },
  };

  return (
    <PageContext.Provider value={value}>
      {children}
    </PageContext.Provider>
  );
};
