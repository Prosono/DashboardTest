// src/App.jsx

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { en, nn, nb } from './i18n';
import {
  AlertTriangle,
  Check,
  Edit2,
  LayoutGrid,
  Server,
  Plus,
  Lock,
  User,
  Eye,
  EyeOff,
  RefreshCw,
} from './icons';

import SettingsDropdown from './components/ui/SettingsDropdown';
import { Header, StatusBar } from './layouts';

import {
  MediaPage,
  PageNavigation,
  PersonStatus,
  SuperAdminOverview,
} from './components';

import {
  HomeAssistantProvider,
  useConfig,
  useHomeAssistant,
  usePages
} from './contexts';

import {
  useModals, useSmartTheme, useTempHistory,
  useAddCard, useConnectionSetup,
  useResponsiveGrid, useEntityHelpers,
  usePageManagement, useDashboardEffects,
} from './hooks';

import { formatDuration } from './utils';
import './styles/dashboard.css';

import { clearAllOAuthTokens, clearOAuthTokens, loadTokensForConnection, saveTokens, saveTokensForConnection } from './services/oauthStorage';
import {
  fetchCurrentUser,
  clearStoredHaConfig,
  getClientId,
  loginWithPassword,
  logoutUser,
  readStoredHaConfig,
  setClientId as setStoredClientId,
  updateProfile as updateCurrentProfile,
  listUsers as listServerUsers,
  createUser as createServerUser,
  updateUser as updateServerUser,
  deleteUser as deleteServerUser,
  listClients as listServerClients,
  createClient as createServerClient,
  createClientAdmin as createServerClientAdmin,
  updateClient as updateServerClient,
  deleteClient as deleteServerClient,
  fetchPlatformOverview as fetchServerPlatformOverview,
  fetchClientHaConfig as fetchServerClientHaConfig,
  saveClientHaConfig as saveServerClientHaConfig,
  listClientDashboards as listServerClientDashboards,
  fetchClientDashboard as fetchServerClientDashboard,
  saveClientDashboard as saveServerClientDashboard,
  listClientDashboardVersions as listServerClientDashboardVersions,
  restoreClientDashboardVersion as restoreServerClientDashboardVersion,
  fetchGlobalBranding as fetchServerGlobalBranding,
  saveGlobalBranding as saveServerGlobalBranding,
  fetchSharedHaConfig,
  saveSharedHaConfig,
  writeStoredHaConfig,
} from './services/appAuth';

import { isCardRemovable as _isCardRemovable, isCardHiddenByLogic as _isCardHiddenByLogic, isMediaPage as _isMediaPage } from './utils/cardUtils';
import { getCardGridSize as _getCardGridSize, buildGridLayout as _buildGridLayout } from './utils/gridLayout';
import { createDragAndDropHandlers } from './utils/dragAndDrop';
import { dispatchCardRender } from './rendering/cardRenderers';
import ModalOrchestrator from './rendering/ModalOrchestrator';
import CardErrorBoundary from './components/ui/CardErrorBoundary';
import EditOverlay from './components/ui/EditOverlay';
import AuroraBackground from './components/effects/AuroraBackground';
import {
  appendLogoVersion,
  getLogoForTheme,
  getStoredHeaderLogoUrl,
  getStoredHeaderLogoVersion,
  resolveLogoUrl,
  saveStoredLogoOverrides,
} from './utils/branding';
import { normalizeHaConfig } from './utils/haConnections';

const SUPER_ADMIN_OVERVIEW_PAGE_ID = '__super_admin_overview';

function AppContent({
  showOnboarding,
  setShowOnboarding,
  currentUser,
  globalBranding,
  onLogout,
  onProfileUpdated,
  onSaveGlobalBranding,
  userAdminApi,
}) {
  const {
    currentTheme,
    setCurrentTheme,
    language,
    setLanguage,
    inactivityTimeout,
    setInactivityTimeout,
    bgMode,
    setBgMode,
    bgColor,
    setBgColor,
    bgGradient,
    setBgGradient,
    bgImage,
    setBgImage,
    cardTransparency,
    setCardTransparency,
    cardBorderOpacity,
    setCardBorderOpacity,
    config,
    setConfig
  } = useConfig();
  const isLightTheme = currentTheme === 'light';

  const {
    pagesConfig,
    setPagesConfig,
    persistConfig,
    cardSettings,
    saveCardSetting: saveCardSettingRaw,
    customNames,
    saveCustomName,
    customIcons,
    saveCustomIcon,
    hiddenCards,
    toggleCardVisibility,
    pageSettings,
    persistPageSettings,
    savePageSetting,
    gridColumns,
    setGridColumns,
    gridGapH,
    setGridGapH,
    gridGapV,
    setGridGapV,
    cardBorderRadius,
    setCardBorderRadius,
    headerScale,
    updateHeaderScale,
    headerTitle,
    headerSettings,
    updateHeaderSettings,
    sectionSpacing,
    updateSectionSpacing,
    persistCardSettings,
    statusPillsConfig,
    saveStatusPillsConfig,
    globalDashboardProfiles,
    globalStorageBusy,
    globalStorageError,
    refreshGlobalDashboards,
    saveGlobalDashboard,
    loadGlobalDashboard,
  } = usePages();

  const {
    entities,
    connected,
    haUnavailableVisible,
    oauthExpired,
    conn,
    activeUrl,
    authRef
  } = useHomeAssistant();

  const translations = useMemo(() => ({ en, nn, nb }), []);
  const nnFallback = useMemo(() => ({
    'system.tabHeader': 'Topptekst',
    'system.tabLayout': 'Oppsett'
  }), []);

  const t = (key) => {
    const value = translations[language]?.[key] ?? translations.nn[key];
    if (value !== undefined) return value;
    if ((language === 'nn' || language === 'nb') && nnFallback[key]) return nnFallback[key];
    return key;
  };
  const normalizeRole = useCallback((role) => {
    const value = String(role || '').trim().toLowerCase();
    if (
      value === 'admin'
      || value === 'administrator'
      || value === 'administratorclient'
      || value === 'clientadmin'
      || value === 'client_admin'
      || value === 'localadmin'
      || value === 'local_admin'
    ) return 'admin';
    if (value === 'inspector' || value === 'inspektør') return 'inspector';
    return 'user';
  }, []);
  const isVisibleForRole = useCallback((visibleRoles, role) => {
    let rawTargets = [];
    if (Array.isArray(visibleRoles)) {
      rawTargets = visibleRoles;
    } else if (typeof visibleRoles === 'string') {
      const str = visibleRoles.trim();
      if (str.startsWith('[') && str.endsWith(']')) {
        try {
          const parsed = JSON.parse(str);
          rawTargets = Array.isArray(parsed) ? parsed : [];
        } catch {
          rawTargets = str.split(',');
        }
      } else {
        rawTargets = str ? str.split(',') : [];
      }
    } else if (visibleRoles && typeof visibleRoles === 'object') {
      rawTargets = Object.values(visibleRoles);
    }

    if (rawTargets.length === 0) {
      if (visibleRoles === null || visibleRoles === undefined || visibleRoles === '') return true;
      return false;
    }

    const normalizedRole = normalizeRole(role);
    const normalizedTargets = rawTargets
      .map((item) => String(item || '').trim().toLowerCase())
      .filter(Boolean);
    if (normalizedTargets.length === 0) return false;
    if (normalizedTargets.includes('all')) return true;
    return normalizedTargets.some((target) => normalizeRole(target) === normalizedRole);
  }, [normalizeRole]);

  const globalHeaderTitle = String(globalBranding?.title || '').trim();
  const globalBrandingVersion = Date.parse(String(globalBranding?.updatedAt || '')) || 0;
  const resolvedHeaderTitle = globalHeaderTitle || headerTitle || t('page.home');
  const effectiveHeaderSettings = useMemo(() => {
    const next = { ...(headerSettings || {}) };
    const globalLogo = String(globalBranding?.logoUrl || '').trim();
    const globalLogoLight = String(globalBranding?.logoUrlLight || '').trim();
    const globalLogoDark = String(globalBranding?.logoUrlDark || '').trim();

    if (globalLogo) next.logoUrl = globalLogo;
    if (globalLogoLight) next.logoUrlLight = globalLogoLight;
    if (globalLogoDark) next.logoUrlDark = globalLogoDark;
    if (globalBrandingVersion > 0) next.logoUpdatedAt = globalBrandingVersion;

    return next;
  }, [
    headerSettings,
    globalBranding?.logoUrl,
    globalBranding?.logoUrlLight,
    globalBranding?.logoUrlDark,
    globalBrandingVersion,
  ]);

  // Modal state management
  const modals = useModals();
  const {
    setShowNordpoolModal,
    setShowCostModal,
    setActiveClimateEntityModal,
    setShowLightModal,
    setActiveCarModal,
    setShowPersonModal,
    setShowAndroidTVModal,
    setShowVacuumModal,
    setShowSensorInfoModal,
    setShowCalendarModal,
    setShowTodoModal,
    setShowRoomModal,
    setShowWeatherModal,
    setActiveSaunaFieldModal,
    activeMediaModal,
    setActiveMediaModal,
    setActiveMediaGroupKey,
    setActiveMediaGroupIds,
    setActiveMediaSessionSensorIds,
    activeMediaId,
    setActiveMediaId,
    showAddCardModal,
    setShowAddCardModal,
    showConfigModal,
    setShowConfigModal,
    showAddPageModal,
    setShowAddPageModal,
    setShowHeaderEditModal,
    setShowEditCardModal,
    setShowStatusPillsConfig,
    hasOpenModal,
    closeAllModals,
  } = modals;

  const [activeVacuumId, setActiveVacuumId] = useState(null);
  const [showThemeSidebar, setShowThemeSidebar] = useState(false);
  const [showLayoutSidebar, setShowLayoutSidebar] = useState(false);
  const [editCardSettingsKey, setEditCardSettingsKey] = useState(null);

  const [editMode, setEditMode] = useState(false);
  const isPlatformAdmin = currentUser?.isPlatformAdmin === true;
  const currentUserRole = normalizeRole(currentUser?.role);
  const isLocalClientAdmin = currentUserRole === 'admin' && !isPlatformAdmin;
  const canEditDashboard = isLocalClientAdmin;
  const canEditGlobalBranding = isPlatformAdmin;
  const canEditClientSubtitle = isLocalClientAdmin;
  const canManageUsersAndClients = currentUserRole === 'admin' || isPlatformAdmin;
  const WARNING_SENSOR_ID = 'sensor.system_warning_details';
  const CRITICAL_SENSOR_ID = 'sensor.system_critical_details';
  const { gridColCount, isCompactCards, isMobile } = useResponsiveGrid(gridColumns);

  useEffect(() => {
    if (!canEditDashboard && editMode) setEditMode(false);
  }, [canEditDashboard, editMode]);

  useEffect(() => {
    if (!entities?.[WARNING_SENSOR_ID]) return;
    const exists = Array.isArray(statusPillsConfig) && statusPillsConfig.some((pill) => pill?.entityId === WARNING_SENSOR_ID);
    if (exists) return;

    const warningPill = {
      id: 'pill_system_warning_details',
      type: 'conditional',
      entityId: WARNING_SENSOR_ID,
      label: 'Systemvarsel',
      sublabel: 'Trykk for detaljer',
      icon: 'AlertTriangle',
      bgColor: 'rgba(239, 68, 68, 0.16)',
      iconBgColor: 'rgba(239, 68, 68, 0.2)',
      iconColor: 'text-red-400',
      labelColor: 'text-red-300',
      sublabelColor: 'text-red-200',
      condition: { type: 'not_state', states: ['unknown', 'unavailable', 'none', 'ok', '0'] },
      clickable: true,
      animated: false,
      visible: true,
      mediaFilter: '',
      mediaFilterMode: 'startsWith',
      mediaSelectionMode: 'filter',
      mediaEntityIds: [],
      sessionSensorIds: [],
    };

    saveStatusPillsConfig([...(statusPillsConfig || []), warningPill]);
  }, [entities, statusPillsConfig, saveStatusPillsConfig, WARNING_SENSOR_ID]);

  useEffect(() => {
    if (!entities?.[CRITICAL_SENSOR_ID]) return;
    const exists = Array.isArray(statusPillsConfig) && statusPillsConfig.some((pill) => pill?.entityId === CRITICAL_SENSOR_ID);
    if (exists) return;

    const criticalPill = {
      id: 'pill_system_critical_details',
      type: 'conditional',
      entityId: CRITICAL_SENSOR_ID,
      label: 'Kritisk varsel',
      sublabel: 'Trykk for detaljer',
      icon: 'AlertTriangle',
      bgColor: 'rgba(220, 38, 38, 0.2)',
      iconBgColor: 'rgba(220, 38, 38, 0.25)',
      iconColor: 'text-red-300',
      labelColor: 'text-red-200',
      sublabelColor: 'text-red-100',
      condition: { type: 'not_state', states: ['unknown', 'unavailable', 'none', 'ok', '0'] },
      clickable: true,
      animated: false,
      visible: true,
      mediaFilter: '',
      mediaFilterMode: 'startsWith',
      mediaSelectionMode: 'filter',
      mediaEntityIds: [],
      sessionSensorIds: [],
    };

    saveStatusPillsConfig([...(statusPillsConfig || []), criticalPill]);
  }, [entities, statusPillsConfig, saveStatusPillsConfig, CRITICAL_SENSOR_ID]);

  const parseAlertCountFromState = useCallback((rawState) => {
    const normalized = String(rawState ?? '').trim().toLowerCase();
    if (!normalized || ['unknown', 'unavailable', 'none', 'ok', '0'].includes(normalized)) return 0;
    const numeric = Number(normalized);
    if (Number.isFinite(numeric) && numeric > 0) return Math.round(numeric);
    return 1;
  }, []);

  const warningAlertCount = parseAlertCountFromState(entities?.[WARNING_SENSOR_ID]?.state);
  const criticalAlertCount = parseAlertCountFromState(entities?.[CRITICAL_SENSOR_ID]?.state);
  const mobileAlertCount = warningAlertCount + criticalAlertCount;
  const mobileAlertTargetId = criticalAlertCount > 0 ? CRITICAL_SENSOR_ID : WARNING_SENSOR_ID;
  const statusPillsForBar = useMemo(() => {
    if (!isMobile) return statusPillsConfig;
    return (statusPillsConfig || []).filter((pill) => !String(pill?.entityId || '').includes('system_warning_details'));
  }, [isMobile, statusPillsConfig]);

  const saveHeaderLogos = useCallback(async ({ title, logoUrl, logoUrlLight, logoUrlDark, updatedAt: updatedAtInput }) => {
    if (!canEditGlobalBranding || typeof onSaveGlobalBranding !== 'function') {
      return { ok: false, persisted: false };
    }

    const nextTitle = String(title || '').trim();
    const nextDefault = String(logoUrl || '').trim();
    const nextLight = String(logoUrlLight || '').trim();
    const nextDark = String(logoUrlDark || '').trim();
    const updatedAt = Number.isFinite(Number(updatedAtInput)) ? Number(updatedAtInput) : Date.now();

    saveStoredLogoOverrides({
      logoUrl: nextDefault,
      logoUrlLight: nextLight,
      logoUrlDark: nextDark,
      updatedAt,
    });

    try {
      const result = await onSaveGlobalBranding({
        title: nextTitle,
        logoUrl: nextDefault,
        logoUrlLight: nextLight,
        logoUrlDark: nextDark,
      });
      return {
        ok: result?.ok !== false,
        persisted: true,
      };
    } catch {
      return { ok: false, persisted: true };
    }
  }, [canEditGlobalBranding, onSaveGlobalBranding]);

  const [draggingId, setDraggingId] = useState(null);
  const [activePage, _setActivePage] = useState(() => {
    try { return localStorage.getItem('tunet_active_page') || 'home'; } catch { return 'home'; }
  });

  const setActivePage = useCallback((page) => {
    _setActivePage(page);
    try { localStorage.setItem('tunet_active_page', page); } catch {}
  }, []);

  const dragSourceRef = useRef(null);
  const touchTargetRef = useRef(null);
  const [touchTargetId, setTouchTargetId] = useState(null);
  const [touchPath, setTouchPath] = useState(null);
  const touchSwapCooldownRef = useRef(0);
  const pointerDragRef = useRef(false);
  const ignoreTouchRef = useRef(false);
  const [tempHistoryById, _setTempHistoryById] = useTempHistory(conn, cardSettings);

  // ── Connection / onboarding hook ───────────────────────────────────────
  const {
    onboardingStep, setOnboardingStep,
    onboardingUrlError, setOnboardingUrlError,
    onboardingTokenError, setOnboardingTokenError,
    testingConnection, testConnection,
    connectionTestResult, setConnectionTestResult,
    configTab, setConfigTab,
    startOAuthLogin, handleOAuthLogout,
    canAdvanceOnboarding, isOnboardingActive,
  } = useConnectionSetup({
    config, setConfig, connected,
    showOnboarding, setShowOnboarding,
    showConfigModal, setShowConfigModal, t,
  });

  const updateCount = Object.values(entities).filter(e => e.entity_id.startsWith('update.') && e.state === 'on' && !e.attributes.skipped_version).length;

  const resetToHome = () => {
    const isHome = activePage === 'home';
    const noModals = !hasOpenModal() && !editingPage && !editMode;

    if (!isHome || !noModals) {
      setActivePage('home');
      closeAllModals();
      setActiveVacuumId(null);
      setEditCardSettingsKey(null);
      setEditingPage(null);
      setEditMode(false);
      setShowStatusPillsConfig(false);
      setShowCalendarModal(false);
      setShowTodoModal(null);
      setShowWeatherModal(null);
    }
  };

  // ── Dashboard-level side-effects (timers, title, haptics, idle) ────────
  const {
    now, mediaTick,
    optimisticLightBrightness, setOptimisticLightBrightness,
  } = useDashboardEffects({
    resolvedHeaderTitle, inactivityTimeout,
    resetToHome, activeMediaModal, entities,
  });

  // Smart Theme Logic — only active when bgMode is 'theme'
  useSmartTheme({ currentTheme, bgMode, entities, now });

  // ── Validate persisted activePage still exists in config ───────────────
  const visiblePageIds = useMemo(() => {
    const allPageIds = pagesConfig.pages || [];
    const roleFiltered = (editMode && canEditDashboard) ? allPageIds : allPageIds.filter((id) => {
      const settings = pageSettings[id] || {};
      return isVisibleForRole(settings.visibleRoles, currentUserRole);
    });
    if (!isPlatformAdmin) return roleFiltered;
    const deduped = [SUPER_ADMIN_OVERVIEW_PAGE_ID];
    roleFiltered.forEach((id) => {
      if (id !== SUPER_ADMIN_OVERVIEW_PAGE_ID) deduped.push(id);
    });
    return deduped;
  }, [pagesConfig.pages, pageSettings, editMode, canEditDashboard, currentUserRole, isPlatformAdmin, isVisibleForRole]);

  const appliedSuperOverviewRef = useRef('');
  useEffect(() => {
    if (!isPlatformAdmin) return;
    const marker = `${currentUser?.id || ''}:${currentUser?.clientId || ''}`;
    if (!marker || appliedSuperOverviewRef.current === marker) return;
    appliedSuperOverviewRef.current = marker;
    setActivePage(SUPER_ADMIN_OVERVIEW_PAGE_ID);
  }, [isPlatformAdmin, currentUser?.id, currentUser?.clientId, setActivePage]);

  useEffect(() => {
    if (visiblePageIds.includes(activePage)) return;
    setActivePage(visiblePageIds[0] || 'home');
  }, [visiblePageIds, activePage, setActivePage]);

  // ── Entity accessor helpers ────────────────────────────────────────────
  const {
    getS, getA, getEntityImageUrl, callService: rawCallService,
    isSonosActive, isMediaActive,
    hvacMap, fanMap, swingMap,
  } = useEntityHelpers({ entities, conn, activeUrl, language, now, t });

  const canControlDevices = currentUserRole !== 'inspector' && !isPlatformAdmin;
  const isAdminUser = canManageUsersAndClients;
  const profileDisplayName = String(currentUser?.fullName || currentUser?.username || t('profile.userFallback')).trim();
  const [dashboardDirty, setDashboardDirty] = useState(false);
  const dashboardDirtyReadyRef = useRef(false);
  const quickSaveBusyRef = useRef(false);
  const snapshotPersistTimerRef = useRef(0);
  const latestSaveGlobalDashboardRef = useRef(saveGlobalDashboard);
  const latestAssignedDashboardRef = useRef(String(currentUser?.assignedDashboardId || 'default'));
  const callService = useCallback((domain, service, payload, target) => {
    if (!canControlDevices) return false;
    return rawCallService(domain, service, payload, target);
  }, [canControlDevices, rawCallService]);

  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState('');
  const mobileScrollLockRef = useRef({ locked: false, scrollY: 0 });
  const loadedAssignedDashboardRef = useRef('');
  const navRowRef = useRef(null);
  const navStickyAnchorRef = useRef(0);
  const navPinTopRef = useRef(8);
  const navScrollLastRef = useRef(0);
  const navScrollRafRef = useRef(0);
  const [navStickyOnScrollDown, setNavStickyOnScrollDown] = useState(false);
  const [navPinnedMetrics, setNavPinnedMetrics] = useState({ left: 0, width: 0, height: 0 });
  const [navPinTopPx, setNavPinTopPx] = useState(8);
  const [mobileTopFadeActive, setMobileTopFadeActive] = useState(false);
  const [mobilePullDistance, setMobilePullDistance] = useState(0);
  const [mobilePullRefreshing, setMobilePullRefreshing] = useState(false);
  const mobilePullStartYRef = useRef(0);
  const mobilePullTrackingRef = useRef(false);
  const mobilePullDistanceRef = useRef(0);
  const [profileState, setProfileState] = useState({
    username: '',
    fullName: '',
    email: '',
    phone: '',
    avatarUrl: '',
  });

  useEffect(() => {
    setProfileState({
      username: currentUser?.username || '',
      fullName: currentUser?.fullName || '',
      email: currentUser?.email || '',
      phone: currentUser?.phone || '',
      avatarUrl: currentUser?.avatarUrl || '',
    });
  }, [currentUser?.username, currentUser?.fullName, currentUser?.email, currentUser?.phone, currentUser?.avatarUrl]);

  const saveProfile = useCallback(async (e) => {
    e?.preventDefault?.();
    setProfileSaving(true);
    setProfileError('');
    try {
      const updated = await updateCurrentProfile(profileState);
      if (updated && onProfileUpdated) onProfileUpdated(updated);
      setShowProfileModal(false);
    } catch (error) {
      setProfileError(error?.message || t('profile.saveFailed'));
    } finally {
      setProfileSaving(false);
    }
  }, [profileState, onProfileUpdated, t]);

  useEffect(() => {
    if (!currentUser?.id) return;
    const assignedDashboardId = String(currentUser.assignedDashboardId || 'default');
    const loadKey = `${currentUser.id}:${assignedDashboardId}`;
    if (loadedAssignedDashboardRef.current === loadKey) return;
    loadedAssignedDashboardRef.current = loadKey;

    loadGlobalDashboard(assignedDashboardId)
      .then(() => {
        dashboardDirtyReadyRef.current = false;
        setDashboardDirty(false);
      })
      .catch(() => {
        // best effort: keep current/cached dashboard if assigned load fails
      });
  }, [currentUser?.id, currentUser?.assignedDashboardId, loadGlobalDashboard]);

  useEffect(() => {
    latestSaveGlobalDashboardRef.current = saveGlobalDashboard;
  }, [saveGlobalDashboard]);

  useEffect(() => {
    latestAssignedDashboardRef.current = String(currentUser?.assignedDashboardId || 'default');
  }, [currentUser?.assignedDashboardId]);

  useEffect(() => {
    if (!isAdminUser) {
      dashboardDirtyReadyRef.current = false;
      setDashboardDirty(false);
      return;
    }
    if (!dashboardDirtyReadyRef.current) {
      dashboardDirtyReadyRef.current = true;
      return;
    }
    setDashboardDirty(true);
  }, [
    isAdminUser,
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

  const quickSaveDashboard = useCallback(async () => {
    if (!isAdminUser || quickSaveBusyRef.current) return;
    quickSaveBusyRef.current = true;
    const target = latestAssignedDashboardRef.current || 'default';
    try {
      const saveFn = latestSaveGlobalDashboardRef.current;
      if (typeof saveFn !== 'function') return;
      const ok = await saveFn(target);
      if (ok) setDashboardDirty(false);
    } finally {
      quickSaveBusyRef.current = false;
    }
  }, [isAdminUser]);

  const scheduleSnapshotPersist = useCallback(() => {
    if (!isAdminUser || typeof window === 'undefined') return;
    if (snapshotPersistTimerRef.current) {
      window.clearTimeout(snapshotPersistTimerRef.current);
    }
    snapshotPersistTimerRef.current = window.setTimeout(() => {
      snapshotPersistTimerRef.current = 0;
      quickSaveDashboard();
    }, 1200);
  }, [isAdminUser, quickSaveDashboard]);

  useEffect(() => () => {
    if (snapshotPersistTimerRef.current && typeof window !== 'undefined') {
      window.clearTimeout(snapshotPersistTimerRef.current);
      snapshotPersistTimerRef.current = 0;
    }
  }, []);

  const saveCardSetting = useCallback((id, setting, value) => {
    saveCardSettingRaw(id, setting, value);
    if (setting === 'bookingSnapshots') {
      scheduleSnapshotPersist();
    }
  }, [saveCardSettingRaw, scheduleSnapshotPersist]);

  const renderUserChip = (extraClassName = '') => (
    currentUser ? (
      <button
        onClick={() => setShowProfileModal(true)}
        className={`px-2 py-1 rounded-full border border-[var(--glass-border)] text-[10px] uppercase tracking-wider text-[var(--text-secondary)] hover:text-[var(--text-primary)] ${extraClassName}`}
        title={t('profile.title')}
      >
        <User className="w-3 h-3 inline mr-1" />
        {profileDisplayName}
      </button>
    ) : null
  );

  const renderSettingsControl = () => (
    <div className="relative">
      <SettingsDropdown
        onOpenSettings={() => { setShowConfigModal(true); setConfigTab('connection'); }}
        onOpenTheme={() => setShowThemeSidebar(true)}
        onOpenLayout={() => setShowLayoutSidebar(true)}
        onOpenHeader={() => setShowHeaderEditModal(true)}
        showLayout={canEditDashboard}
        showHeader={canEditDashboard || canEditGlobalBranding}
        showConnection={canManageUsersAndClients}
        t={t}
      />
      {isAdminUser && updateCount > 0 && (
        <div className="absolute -top-1 -right-1 w-5 h-5 bg-gray-600 rounded-full flex items-center justify-center border-2 border-[var(--card-bg)] pointer-events-none shadow-sm">
          <span className="text-[11px] font-bold text-white leading-none pt-[1px]">{updateCount}</span>
        </div>
      )}
    </div>
  );

  // ── Page management ────────────────────────────────────────────────────
  const {
    newPageLabel, setNewPageLabel,
    newPageIcon, setNewPageIcon,
    editingPage, setEditingPage,
    createPage, createMediaPage, deletePage, removeCard,
  } = usePageManagement({
    pagesConfig, persistConfig, pageSettings, persistPageSettings,
    savePageSetting, pageDefaults: { home: { label: t('page.home'), icon: LayoutGrid } },
    activePage, setActivePage,
    showAddPageModal, setShowAddPageModal,
    showAddCardModal, setShowAddCardModal, t,
  });

  const restoreMobileScroll = useCallback(() => {
    if (!mobileScrollLockRef.current.locked) return;
    const { scrollY } = mobileScrollLockRef.current;
    const body = document.body;
    const html = document.documentElement;
    body.style.position = '';
    body.style.top = '';
    body.style.left = '';
    body.style.right = '';
    body.style.width = '';
    body.style.overflow = '';
    body.style.touchAction = '';
    html.style.overflow = '';
    html.style.touchAction = '';
    window.scrollTo(0, scrollY || 0);
    mobileScrollLockRef.current = { locked: false, scrollY: 0 };
  }, []);

  const shouldLockMobileScroll = isMobile && (
    hasOpenModal()
    || showProfileModal
    || Boolean(editingPage)
    || showOnboarding
  );

  useEffect(() => {
    if (!shouldLockMobileScroll) {
      restoreMobileScroll();
      return;
    }
    if (mobileScrollLockRef.current.locked) return;

    const scrollY = window.scrollY || window.pageYOffset || 0;
    const body = document.body;
    mobileScrollLockRef.current = { locked: true, scrollY };

    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';
    body.style.overflow = 'hidden';
  }, [shouldLockMobileScroll, restoreMobileScroll]);

  useEffect(() => () => restoreMobileScroll(), [restoreMobileScroll]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const maybeLock = async () => {
      try {
        const orientation = window.screen?.orientation;
        if (!orientation?.lock) return;
        await orientation.lock('portrait');
      } catch {
        // Some browsers (notably iOS Safari) do not allow programmatic locking.
      }
    };
    maybeLock();
  }, []);

  const readSafeAreaTopPx = useCallback(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return 0;
    const rootStyle = window.getComputedStyle(document.documentElement);
    const fromVar = parseFloat(rootStyle.getPropertyValue('--safe-area-top'));
    const fromFallback = parseFloat(rootStyle.getPropertyValue('--safe-area-top-fallback'));
    const probe = document.createElement('div');
    probe.style.position = 'fixed';
    probe.style.top = '0';
    probe.style.left = '0';
    probe.style.width = '0';
    probe.style.height = '0';
    probe.style.paddingTop = 'env(safe-area-inset-top)';
    probe.style.visibility = 'hidden';
    probe.style.pointerEvents = 'none';
    document.body.appendChild(probe);
    const fromProbe = parseFloat(window.getComputedStyle(probe).paddingTop) || 0;
    probe.remove();
    const candidates = [fromVar, fromFallback, fromProbe]
      .filter((value) => Number.isFinite(value) && value >= 0);
    const inset = candidates.length ? Math.max(...candidates) : 0;
    return Math.max(0, Math.min(48, inset));
  }, []);

  const getNavPinTopPx = useCallback(() => {
    if (!isMobile) return 8;
    return Math.round(readSafeAreaTopPx() + 14);
  }, [isMobile, readSafeAreaTopPx]);

  const syncNavPinTop = useCallback(() => {
    const next = getNavPinTopPx();
    navPinTopRef.current = next;
    setNavPinTopPx((prev) => (Math.abs(prev - next) < 1 ? prev : next));
    return next;
  }, [getNavPinTopPx]);

  const measureNavRowMetrics = useCallback(() => {
    if (typeof window === 'undefined') return null;
    const element = navRowRef.current;
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    const next = {
      left: rect.left,
      width: rect.width,
      height: rect.height,
    };
    setNavPinnedMetrics((prev) => {
      if (prev.left === next.left && prev.width === next.width && prev.height === next.height) return prev;
      return next;
    });
    return rect;
  }, []);

  const measureNavStickyAnchor = useCallback(() => {
    if (typeof window === 'undefined') return;
    const pinTop = syncNavPinTop();
    if (navStickyOnScrollDown) return;
    const rect = measureNavRowMetrics();
    if (!rect) return;
    navStickyAnchorRef.current = Math.max(0, (window.scrollY || 0) + rect.top - pinTop);
  }, [navStickyOnScrollDown, measureNavRowMetrics, syncNavPinTop]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const rafId = window.requestAnimationFrame(() => {
      measureNavStickyAnchor();
    });
    return () => window.cancelAnimationFrame(rafId);
  }, [measureNavStickyAnchor, isMobile, activePage, editMode, haUnavailableVisible, sectionSpacing?.navToGrid]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    navScrollLastRef.current = window.scrollY || 0;
    setMobileTopFadeActive(isMobile && (window.scrollY || 0) > 2);

    const onScroll = () => {
      if (navScrollRafRef.current) return;
      navScrollRafRef.current = window.requestAnimationFrame(() => {
        navScrollRafRef.current = 0;
        const currentY = window.scrollY || 0;
        const delta = currentY - navScrollLastRef.current;
        const pastAnchor = currentY > navStickyAnchorRef.current;
        if (isMobile) syncNavPinTop();
        setMobileTopFadeActive((prev) => {
          const next = isMobile && currentY > 2;
          return prev === next ? prev : next;
        });

        setNavStickyOnScrollDown((prev) => {
          if (!pastAnchor) return false;
          if (delta > 0) return true;
          if (delta < 0) return prev;
          return prev;
        });

        navScrollLastRef.current = currentY;
      });
    };

    const onResize = () => {
      measureNavRowMetrics();
      measureNavStickyAnchor();
      if ((window.scrollY || 0) <= navStickyAnchorRef.current) {
        setNavStickyOnScrollDown(false);
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      if (navScrollRafRef.current) {
        window.cancelAnimationFrame(navScrollRafRef.current);
        navScrollRafRef.current = 0;
      }
    };
  }, [measureNavStickyAnchor, measureNavRowMetrics, isMobile, syncNavPinTop]);

  const triggerPullRefresh = useCallback(() => {
    if (mobilePullRefreshing || typeof window === 'undefined') return;
    setMobilePullRefreshing(true);
    window.setTimeout(() => {
      window.location.reload();
    }, 220);
  }, [mobilePullRefreshing]);

  useEffect(() => {
    if (typeof window === 'undefined' || !isMobile) return undefined;

    const PULL_REFRESH_TRIGGER_PX = 68;
    const PULL_REFRESH_MAX_PX = 110;
    const PULL_REFRESH_RESISTANCE = 0.6;
    const PULL_REFRESH_START_ZONE_PX = 170;

    const getSafeAreaTopPx = () => {
      if (typeof window === 'undefined' || typeof document === 'undefined') return 0;
      const styles = window.getComputedStyle(document.documentElement);
      const safeTop = Number.parseFloat(styles.getPropertyValue('--safe-area-top') || '0');
      const safeTopFallback = Number.parseFloat(styles.getPropertyValue('--safe-area-top-fallback') || '0');
      const resolved = Math.max(
        Number.isFinite(safeTop) ? safeTop : 0,
        Number.isFinite(safeTopFallback) ? safeTopFallback : 0,
      );
      return Number.isFinite(resolved) ? resolved : 0;
    };

    const resetPullState = () => {
      mobilePullTrackingRef.current = false;
      mobilePullDistanceRef.current = 0;
      setMobilePullDistance(0);
    };

    const onTouchStart = (event) => {
      if (mobilePullRefreshing || shouldLockMobileScroll || editMode) return;
      const startTarget = event.target;
      if (startTarget && typeof startTarget.closest === 'function' && startTarget.closest('[data-disable-pull-refresh="true"]')) return;
      if ((window.scrollY || window.pageYOffset || 0) > 0) return;
      if (!event.touches || event.touches.length !== 1) return;
      const startY = event.touches[0].clientY;
      const safeAreaTopPx = getSafeAreaTopPx();
      const navTop = navRowRef.current?.getBoundingClientRect?.().top;
      const maxStartY = Number.isFinite(navTop)
        ? Math.min(safeAreaTopPx + PULL_REFRESH_START_ZONE_PX, navTop + 6)
        : (safeAreaTopPx + PULL_REFRESH_START_ZONE_PX);
      if (startY > maxStartY) return;
      mobilePullTrackingRef.current = true;
      mobilePullStartYRef.current = startY;
      mobilePullDistanceRef.current = 0;
      setMobilePullDistance(0);
    };

    const onTouchMove = (event) => {
      if (!mobilePullTrackingRef.current) return;
      const moveTarget = event.target;
      if (moveTarget && typeof moveTarget.closest === 'function' && moveTarget.closest('[data-disable-pull-refresh="true"]')) {
        resetPullState();
        return;
      }
      if (!event.touches || event.touches.length !== 1) {
        resetPullState();
        return;
      }

      const scrollTop = window.scrollY || window.pageYOffset || 0;
      const delta = event.touches[0].clientY - mobilePullStartYRef.current;
      if (scrollTop > 0 || delta <= 0) {
        if (scrollTop > 0 || delta < -6) resetPullState();
        return;
      }

      const resisted = Math.min(PULL_REFRESH_MAX_PX, delta * PULL_REFRESH_RESISTANCE);
      mobilePullDistanceRef.current = resisted;
      setMobilePullDistance((prev) => (Math.abs(prev - resisted) < 0.5 ? prev : resisted));
    };

    const onTouchEnd = () => {
      if (!mobilePullTrackingRef.current) return;
      mobilePullTrackingRef.current = false;
      const shouldRefresh = mobilePullDistanceRef.current >= PULL_REFRESH_TRIGGER_PX;
      mobilePullDistanceRef.current = 0;
      setMobilePullDistance(0);
      if (shouldRefresh) triggerPullRefresh();
    };

    const onTouchCancel = () => {
      resetPullState();
    };

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('touchcancel', onTouchCancel, { passive: true });

    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchCancel);
      resetPullState();
    };
  }, [isMobile, mobilePullRefreshing, shouldLockMobileScroll, editMode, triggerPullRefresh]);

  const getCardSettingsKey = useCallback((cardId, pageId = activePage) => `${pageId}::${cardId}`, [activePage]);

  const personStatus = (id) => (
    <PersonStatus
      key={id} id={id} entities={entities} editMode={editMode}
      customNames={customNames} customIcons={customIcons}
      cardSettings={cardSettings} getCardSettingsKey={getCardSettingsKey}
      getEntityImageUrl={getEntityImageUrl} getS={getS}
      onOpenPerson={(pid) => setShowPersonModal(pid)}
      onEditCard={(eid, sk) => { setShowEditCardModal(eid); setEditCardSettingsKey(sk); }}
      onRemoveCard={removeCard} t={t}
    />
  );

  const pageDefaults = {
    home: { label: t('page.home'), icon: LayoutGrid },
    [SUPER_ADMIN_OVERVIEW_PAGE_ID]: { label: t('superAdminOverview.pageLabel'), icon: Server },
  };

  const pages = visiblePageIds.map(id => ({
    id,
    label: pageDefaults[id]?.label || id,
    icon: pageDefaults[id]?.icon || LayoutGrid
  }));

  const isCardVisibleForCurrentRole = useCallback((cardId, pageId = activePage) => {
    if (editMode && canEditDashboard) return true;
    const settingsKey = `${pageId}::${cardId}`;
    const settings = {
      ...(cardSettings[cardId] || {}),
      ...(cardSettings[settingsKey] || {}),
    };
    return isVisibleForRole(settings.visibleRoles, currentUserRole);
  }, [editMode, canEditDashboard, activePage, cardSettings, currentUserRole, isVisibleForRole]);

  const cardUtilCtx = { getCardSettingsKey, cardSettings, entities, activePage };
  const isCardRemovable = (cardId, pageId = activePage) => _isCardRemovable(cardId, pageId, cardUtilCtx);
  const isCardHiddenByLogic = (cardId) => _isCardHiddenByLogic(cardId, cardUtilCtx);
  const isMediaPage = (pageId) => _isMediaPage(pageId, pageSettings);

  // ── Add-card dialog hook ───────────────────────────────────────────────
  const {
    addCardTargetPage, setAddCardTargetPage,
    addCardType, setAddCardType,
    searchTerm, setSearchTerm,
    selectedEntities, setSelectedEntities,
    selectedWeatherId, setSelectedWeatherId,
    selectedTempId, setSelectedTempId,
    selectedAndroidTVMediaId, setSelectedAndroidTVMediaId,
    selectedAndroidTVRemoteId, setSelectedAndroidTVRemoteId,
    selectedCostTodayId, setSelectedCostTodayId,
    selectedCostMonthId, setSelectedCostMonthId,
    costSelectionTarget, setCostSelectionTarget,
    selectedNordpoolId, setSelectedNordpoolId,
    nordpoolDecimals, setNordpoolDecimals,
    onAddSelected,
    getAddCardAvailableLabel,
    getAddCardNoneLeftLabel,
  } = useAddCard({
    showAddCardModal, activePage, isMediaPage,
    pagesConfig, persistConfig,
    cardSettings, persistCardSettings, getCardSettingsKey, saveCardSetting,
    setShowAddCardModal, setShowEditCardModal, setEditCardSettingsKey, t,
  });

  const getCardGridSize = useCallback(
    (cardId) => _getCardGridSize(cardId, getCardSettingsKey, cardSettings, activePage, gridColCount),
    [getCardSettingsKey, cardSettings, activePage, gridColCount]
  );

  const adjustCardGridSize = useCallback((cardId, deltaCol = 0, deltaRow = 0) => {
    if (!deltaCol && !deltaRow) return;
    const settingsKey = getCardSettingsKey(cardId);
    persistCardSettings((prev) => {
      const current = _getCardGridSize(cardId, getCardSettingsKey, prev, activePage, gridColCount);
      const nextCol = Math.max(1, Math.min(gridColCount, current.colSpan + deltaCol));
      const nextRow = Math.max(1, Math.min(8, current.rowSpan + deltaRow));
      return {
        ...prev,
        [settingsKey]: {
          ...(prev[settingsKey] || {}),
          gridColSpan: nextCol,
          gridRowSpan: nextRow,
        },
      };
    });
  }, [persistCardSettings, getCardSettingsKey, activePage, gridColCount]);

  const moveCardInArray = useCallback((cardId, direction) => {
    const newConfig = { ...pagesConfig };
    const pageCards = newConfig[activePage];
    const currentIndex = pageCards.indexOf(cardId);
    if (currentIndex === -1) return;

    const newIndex = direction === 'left' ? currentIndex - 1 : currentIndex + 1;
    if (newIndex < 0 || newIndex >= pageCards.length) return;

    [pageCards[currentIndex], pageCards[newIndex]] = [pageCards[newIndex], pageCards[currentIndex]];
    persistConfig(newConfig);
  }, [pagesConfig, activePage, persistConfig]);

  const gridLayout = useMemo(() => {
    const ids = pagesConfig[activePage] || [];
    const hiddenCtx = { getCardSettingsKey, cardSettings, entities, activePage };
    const visibleIds = editMode
      ? ids
      : ids.filter((id) => {
        if (!isCardVisibleForCurrentRole(id, activePage)) return false;
        return !(hiddenCards.includes(id) || _isCardHiddenByLogic(id, hiddenCtx));
      });
    return _buildGridLayout(visibleIds, gridColCount, getCardGridSize);
  }, [pagesConfig, activePage, gridColCount, hiddenCards, editMode, getCardGridSize, getCardSettingsKey, cardSettings, entities, isCardVisibleForCurrentRole]);

  const dragAndDrop = createDragAndDropHandlers({
    editMode,
    pagesConfig,
    setPagesConfig,
    persistConfig,
    activePage,
    dragSourceRef,
    touchTargetRef,
    touchSwapCooldownRef,
    touchPath,
    setTouchPath,
    touchTargetId,
    setTouchTargetId,
    setDraggingId,
    ignoreTouchRef
  });

  const renderCard = (cardId, index, colIndex) => {
    const hiddenByRole = !isCardVisibleForCurrentRole(cardId);
    const isHidden = hiddenCards.includes(cardId) || isCardHiddenByLogic(cardId) || hiddenByRole;
    if (isHidden && !editMode) return null;
    const isDragging = draggingId === cardId;

    const {
      getDragProps,
      getCardStyle,
      startTouchDrag,
      updateTouchDrag,
      performTouchDrop,
      resetDragState
    } = dragAndDrop;

    const dragProps = getDragProps({ cardId, index, colIndex });
    const baseCardStyle = getCardStyle({ cardId, isHidden, isDragging });
    const cardStyle = baseCardStyle;

    const settingsKey = getCardSettingsKey(cardId);

    const getControls = (targetId) => {
      if (!editMode) return null;
      const editId = targetId || cardId;
      const isHiddenNow = hiddenCards.includes(cardId) || isCardHiddenByLogic(cardId) || !isCardVisibleForCurrentRole(cardId);
      const settings = cardSettings[settingsKey] || cardSettings[editId] || {};

      return (
        <EditOverlay
          cardId={cardId}
          editId={editId}
          settingsKey={settingsKey}
          isHidden={isHiddenNow}
          currentSize={cardSettings[settingsKey]?.size || 'large'}
          currentGridSize={getCardGridSize(cardId)}
          gridColumnCount={gridColCount}
          settings={settings}
          canRemove={isCardRemovable(cardId)}
          onMoveLeft={() => moveCardInArray(cardId, 'left')}
          onMoveRight={() => moveCardInArray(cardId, 'right')}
          onEdit={() => { setShowEditCardModal(editId); setEditCardSettingsKey(settingsKey); }}
          onToggleVisibility={() => toggleCardVisibility(cardId)}
          onSaveSize={(size) => saveCardSetting(settingsKey, 'size', size)}
          onIncreaseGridSize={() => {
            adjustCardGridSize(cardId, 1, 1);
          }}
          onDecreaseGridSize={() => {
            adjustCardGridSize(cardId, -1, -1);
          }}
          onAdjustGridSize={(deltaCol, deltaRow) => {
            adjustCardGridSize(cardId, deltaCol, deltaRow);
          }}
          onRemove={() => removeCard(cardId)}
          dragHandleProps={{
            onContextMenu: (e) => e.preventDefault(),
            onPointerDown: (e) => {
              if (!editMode || e.pointerType !== 'touch') return;
              e.preventDefault();
              e.currentTarget.setPointerCapture(e.pointerId);
              pointerDragRef.current = true;
              ignoreTouchRef.current = true;
              startTouchDrag(cardId, index, colIndex, e.clientX, e.clientY);
            },
            onPointerMove: (e) => {
              if (!editMode || e.pointerType !== 'touch') return;
              if (!pointerDragRef.current) return;
              e.preventDefault();
              updateTouchDrag(e.clientX, e.clientY);
            },
            onPointerUp: (e) => {
              if (!editMode || e.pointerType !== 'touch') return;
              if (!pointerDragRef.current) return;
              e.preventDefault();
              pointerDragRef.current = false;
              ignoreTouchRef.current = false;
              performTouchDrop(e.clientX, e.clientY);
              resetDragState();
            },
            onPointerCancel: (e) => {
              if (!editMode || e.pointerType !== 'touch') return;
              if (!pointerDragRef.current) return;
              e.preventDefault();
              pointerDragRef.current = false;
              ignoreTouchRef.current = false;
              const x = touchPath?.x ?? e.clientX;
              const y = touchPath?.y ?? e.clientY;
              performTouchDrop(x, y);
              resetDragState();
            },
          }}
          t={t}
        />
      );
    };

    const ctx = {
      entities, editMode, conn, cardSettings, customNames, customIcons,
      getA, getS, getEntityImageUrl, callService, isMediaActive,
      saveCardSetting, language, isMobile, activePage, t,
      optimisticLightBrightness, setOptimisticLightBrightness,
      tempHistoryById, isCardHiddenByLogic,
      setShowLightModal, setShowSensorInfoModal, setActiveClimateEntityModal,
      setShowCostModal, setActiveVacuumId, setShowVacuumModal,
      setShowAndroidTVModal, setActiveCarModal, setShowWeatherModal,
      setShowNordpoolModal, setShowCalendarModal, setShowTodoModal,
      setShowRoomModal, setShowEditCardModal, setEditCardSettingsKey,
      setActiveSaunaFieldModal,
      openMediaModal: (mpId, groupKey, groupIds) => {
        setActiveMediaId(mpId);
        setActiveMediaGroupKey(groupKey);
        setActiveMediaGroupIds(groupIds);
        setActiveMediaModal('media');
      },
    };

    return dispatchCardRender(cardId, dragProps, getControls, cardStyle, settingsKey, ctx);
  };

  const mobileGridGapV = Math.max(12, Math.min(24, Number(gridGapV) || 20));
  const mobileGridGapH = Math.max(10, Math.min(20, Number(gridGapH) || 20));
  const mobileGridAutoRow = 96;
  const pullRefreshProgress = Math.min(1, mobilePullDistance / 52);
  const pullRefreshVisible = isMobile && (mobilePullDistance > 0.5 || mobilePullRefreshing);
  const safeAreaTop = 'max(var(--safe-area-top, 0px), var(--safe-area-top-fallback, 0px))';
  const safeAreaBottom = 'max(var(--safe-area-bottom, 0px), var(--safe-area-bottom-fallback, 0px))';

  return (
    <div
      className="font-sans selection:bg-blue-500/30 transition-colors duration-500"
      style={{
        minHeight: `calc(100svh - ${safeAreaTop} - ${safeAreaBottom})`,
        paddingTop: safeAreaTop,
        paddingBottom: safeAreaBottom,
        backgroundColor: 'var(--bg-primary)',
        color: 'var(--text-primary)',
      }}
    >
      {bgMode === 'animated' && !isLightTheme ? (
        <AuroraBackground />
      ) : (
        <div className="fixed inset-0 pointer-events-none z-0">
          <div
            className="absolute inset-0"
            style={{
              background: (isLightTheme && bgMode !== 'custom')
                ? 'linear-gradient(to bottom right, #f8fafc, #ffffff, #f1f5f9)'
                : 'linear-gradient(to bottom right, var(--bg-gradient-from), var(--bg-primary), var(--bg-gradient-to))',
            }}
          />
          <div
            className="absolute top-[-15%] right-[-10%] w-[70%] h-[70%] rounded-full pointer-events-none"
            style={{ background: isLightTheme ? 'rgba(148, 163, 184, 0.14)' : 'rgba(59, 130, 246, 0.08)', filter: 'blur(150px)' }}
          />
          <div
            className="absolute bottom-[-15%] left-[-10%] w-[70%] h-[70%] rounded-full pointer-events-none"
            style={{ background: isLightTheme ? 'rgba(226, 232, 240, 0.26)' : 'rgba(30, 58, 138, 0.1)', filter: 'blur(150px)' }}
          />
        </div>
      )}

      {isMobile && (
        <div
          className="fixed left-0 right-0 pointer-events-none z-20 transition-opacity duration-200"
          style={{
            top: 0,
            height: `calc(${safeAreaTop} + 40px)`,
            opacity: mobileTopFadeActive ? 1 : 0,
            background: isLightTheme
              ? 'linear-gradient(to bottom, rgba(248, 250, 252, 0.94) 0%, rgba(248, 250, 252, 0.76) 50%, rgba(248, 250, 252, 0) 100%)'
              : 'linear-gradient(to bottom, rgba(2, 6, 23, 0.9) 0%, rgba(2, 6, 23, 0.62) 50%, rgba(2, 6, 23, 0) 100%)',
          }}
        />
      )}

      {pullRefreshVisible && (
        <div
          className="fixed pointer-events-none z-30 transition-all duration-150"
          style={{
            left: '50%',
            top: `calc(${safeAreaTop} + 6px)`,
            opacity: mobilePullRefreshing ? 1 : Math.max(0.45, pullRefreshProgress),
            transform: `translateX(-50%) translateY(${mobilePullRefreshing ? 0 : (-14 + (pullRefreshProgress * 14))}px)`,
          }}
        >
          <div
            className="w-10 h-10 rounded-full border flex items-center justify-center shadow-sm backdrop-blur-md"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--card-bg) 86%, transparent)',
              borderColor: 'color-mix(in srgb, var(--accent-color) 32%, var(--glass-border))',
              color: 'var(--text-primary)',
            }}
          >
            <RefreshCw
              className={`w-4 h-4 ${mobilePullRefreshing ? 'animate-spin' : ''}`}
              style={mobilePullRefreshing ? undefined : { transform: `rotate(${Math.round(pullRefreshProgress * 300)}deg)` }}
            />
          </div>
        </div>
      )}

      {editMode && draggingId && touchPath && (
        <svg className="fixed inset-0 pointer-events-none z-40">
          <line
            x1={touchPath.startX}
            y1={touchPath.startY}
            x2={touchPath.x}
            y2={touchPath.y}
            stroke="rgba(59, 130, 246, 0.6)"
            strokeWidth="3"
            strokeDasharray="6 6"
          />
          <circle cx={touchPath.startX} cy={touchPath.startY} r="6" fill="rgba(59, 130, 246, 0.6)" />
          <circle cx={touchPath.x} cy={touchPath.y} r="8" fill="rgba(59, 130, 246, 0.9)" />
        </svg>
      )}

      <div
        className={`relative z-10 w-full max-w-[1600px] mx-auto py-6 md:py-10 ${
          isMobile ? 'px-5 mobile-grid' : (gridColCount === 1 ? 'px-10 sm:px-16 md:px-24' : 'px-6 md:px-20')
        } ${isCompactCards ? 'compact-cards' : ''}`}
      >
        <Header
          now={now}
          headerTitle={resolvedHeaderTitle}
          headerScale={headerScale}
          editMode={editMode}
          headerSettings={effectiveHeaderSettings}
          setShowHeaderEditModal={setShowHeaderEditModal}
          t={t}
          isMobile={isMobile}
          sectionSpacing={sectionSpacing}
          currentTheme={currentTheme}
        >
          <div
            className={`w-full mt-0 font-sans ${isMobile ? 'flex flex-col items-center gap-1.5' : 'flex items-center justify-between'}`}
            style={{ marginTop: `${isMobile ? Math.min(8, sectionSpacing?.headerToStatus ?? 0) : (sectionSpacing?.headerToStatus ?? 0)}px` }}
          >
            <div className={`flex flex-wrap gap-2.5 items-center min-w-0 ${isMobile ? 'justify-center w-full' : ''}`}>
              {(pagesConfig.header || []).map(id => personStatus(id))}
              {editMode && canEditDashboard && (
                <button
                  onClick={() => { setAddCardTargetPage('header'); setShowAddCardModal(true); }}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/20 border border-blue-500/30 text-blue-400 hover:bg-blue-500/30 transition-all text-[10px] font-bold uppercase tracking-[0.2em]"
                >
                  <Plus className="w-3 h-3" /> {t('addCard.type.entity')}
                </button>
              )}
              {(pagesConfig.header || []).length > 0 && !isMobile && <div className="w-px h-8 bg-[var(--glass-border)] mx-2"></div>}
            </div>

            <div className={`min-w-0 ${isMobile ? 'w-full flex justify-center' : 'flex-1'}`}>
              <StatusBar
                entities={entities}
                now={now}
                setActiveMediaId={setActiveMediaId}
                setActiveMediaGroupKey={setActiveMediaGroupKey}
                setActiveMediaGroupIds={setActiveMediaGroupIds}
                setActiveMediaSessionSensorIds={setActiveMediaSessionSensorIds}
                setActiveMediaModal={setActiveMediaModal}
                setShowUpdateModal={() => { setShowConfigModal(true); setConfigTab('updates'); }}
                onOpenEntityPill={(entityId) => {
                  if (!entityId) return;
                  if (entityId.startsWith('person.')) {
                    setShowPersonModal(entityId);
                    return;
                  }
                  if (entityId.startsWith('light.')) {
                    setShowLightModal(entityId);
                    return;
                  }
                  if (entityId.startsWith('climate.')) {
                    setActiveClimateEntityModal(entityId);
                    return;
                  }
                  if (entityId.startsWith('media_player.')) {
                    setActiveMediaId(entityId);
                    setActiveMediaGroupKey(null);
                    setActiveMediaGroupIds([entityId]);
                    setActiveMediaSessionSensorIds(null);
                    setActiveMediaModal('media');
                    return;
                  }
                  if (entityId.startsWith('vacuum.')) {
                    setActiveVacuumId(entityId);
                    setShowVacuumModal(true);
                    return;
                  }
                  setShowSensorInfoModal(entityId);
                }}
                setShowStatusPillsConfig={setShowStatusPillsConfig}
                editMode={editMode}
                t={t}
                isSonosActive={isSonosActive}
                isMediaActive={isMediaActive}
                getA={getA}
                getEntityImageUrl={getEntityImageUrl}
                statusPillsConfig={statusPillsForBar}
                isMobile={isMobile}
              />
            </div>
          </div>
        </Header>

        {haUnavailableVisible && (
          <div className="mb-6 rounded-2xl border border-yellow-500/30 bg-yellow-500/10 text-yellow-100 px-4 sm:px-6 py-4 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-yellow-300" />
            <div className="text-sm font-semibold">
              {oauthExpired ? t('system.oauth.expired') : t('ha.unavailable')}
            </div>
            {oauthExpired && (
              <button
                onClick={() => { setShowConfigModal(true); setConfigTab('connection'); }}
                className="ml-auto px-3 py-1.5 rounded-lg bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-200 text-xs font-bold uppercase tracking-wider transition-colors border border-yellow-500/30"
              >
                {t('system.oauth.loginButton')}
              </button>
            )}
          </div>
        )}

        {isMobile && (
          <div className="flex items-center justify-between mb-2 px-0.5">
            {renderUserChip('max-w-[58%] truncate')}
            <div className="flex items-center gap-2">
              {mobileAlertCount > 0 && (
                <button
                  onClick={() => setShowSensorInfoModal(mobileAlertTargetId)}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                  title="Alerts"
                >
                  <AlertTriangle className={`w-3.5 h-3.5 ${criticalAlertCount > 0 ? 'text-red-400' : 'text-amber-400'}`} />
                  <span className="text-[11px] font-bold leading-none">{mobileAlertCount}</span>
                </button>
              )}
              {renderSettingsControl()}
            </div>
          </div>
        )}

        <div
          style={{
            marginBottom: `${isMobile ? Math.min(14, sectionSpacing?.navToGrid ?? 24) : (sectionSpacing?.navToGrid ?? 24)}px`,
            minHeight: navStickyOnScrollDown && navPinnedMetrics.height > 0 ? `${navPinnedMetrics.height}px` : undefined,
          }}
        >
          <div
            ref={navRowRef}
            className={`${isMobile ? 'flex flex-col items-center gap-1.5' : 'flex flex-nowrap items-center justify-between gap-4'} ${navStickyOnScrollDown ? 'z-30 transition-all duration-200' : ''}`}
            style={{
              ...(navStickyOnScrollDown
                ? {
                  position: 'fixed',
                  top: `${navPinTopPx}px`,
                  left: `${navPinnedMetrics.left}px`,
                  width: `${navPinnedMetrics.width}px`,
                  borderRadius: isMobile ? '1rem' : '1.2rem',
                  backgroundColor: 'color-mix(in srgb, var(--card-bg) 88%, transparent)',
                  backdropFilter: 'blur(10px)',
                  padding: isMobile ? '0.3rem 0.4rem 0.2rem' : '0.35rem 0.6rem',
                }
                : {}),
            }}
          >
            <div className={`${isMobile ? 'w-full' : 'flex-1 min-w-0'}`}>
              <PageNavigation
                pages={pages}
                pagesConfig={pagesConfig}
                persistConfig={persistConfig}
                pageSettings={pageSettings}
                activePage={activePage}
                setActivePage={setActivePage}
                editMode={editMode}
                setEditingPage={setEditingPage}
                setShowAddPageModal={setShowAddPageModal}
                t={t}
              />
            </div>

            <div className={`relative flex items-center flex-shrink-0 overflow-visible ${isMobile ? 'justify-center gap-3 w-full pb-0' : 'gap-6 justify-end pb-2'}`}>
              {editMode && canEditDashboard && (
                <button
                  onClick={() => setShowAddCardModal(true)}
                  className="group flex items-center gap-2 text-xs font-bold uppercase text-blue-400 hover:text-white transition-all whitespace-nowrap"
                >
                  <Plus className="w-4 h-4" /> {t('nav.addCard')}
                </button>
              )}

              {editMode && canEditDashboard && (
                <button
                  onClick={() => {
                    const currentSettings = pageSettings[activePage];
                    if (currentSettings?.hidden) setActivePage('home');
                    setEditMode(false);
                  }}
                  className="group flex items-center gap-2 text-xs font-bold uppercase text-green-400 hover:text-white transition-all whitespace-nowrap"
                >
                  <Check className="w-4 h-4" /> {t('nav.done')}
                </button>
              )}

              {canEditDashboard && dashboardDirty && (
                <button
                  onClick={quickSaveDashboard}
                  disabled={globalStorageBusy}
                  className="group flex items-center gap-2 text-xs font-bold uppercase text-amber-300 hover:text-white transition-all whitespace-nowrap disabled:opacity-60 disabled:cursor-not-allowed"
                  title="Save dashboard changes"
                >
                  <Check className={`w-4 h-4 ${globalStorageBusy ? 'animate-pulse' : ''}`} />
                  {globalStorageBusy ? 'Saving...' : 'Save'}
                </button>
              )}

              {canEditDashboard && (
                <button
                  onClick={() => {
                    const currentSettings = pageSettings[activePage];
                    if (currentSettings?.hidden) setActivePage('home');
                    setEditMode(!editMode);
                  }}
                  className={`p-2 rounded-full group ${editMode ? 'bg-blue-500/20 text-blue-400' : 'text-[var(--text-secondary)]'}`}
                  title={editMode ? t('nav.done') : t('menu.edit')}
                >
                  <Edit2 className="w-5 h-5" />
                </button>
              )}

              {!isMobile && renderUserChip()}
              {!isMobile && renderSettingsControl()}

              {!connected && (
                <div
                  className="flex items-center justify-center h-8 w-8 rounded-full transition-all border flex-shrink-0"
                  style={{ backgroundColor: 'rgba(255,255,255,0.01)', borderColor: 'rgba(239, 68, 68, 0.2)' }}
                >
                  <div className="h-2 w-2 rounded-full" style={{ backgroundColor: '#ef4444' }} />
                </div>
              )}
            </div>
          </div>
        </div>

        {!visiblePageIds.includes(activePage) ? (
          <div key={`${activePage}-restricted`} className="flex flex-col items-center justify-center min-h-[45vh] text-center p-8 opacity-90 animate-in fade-in zoom-in duration-300 font-sans">
            <div className="bg-[var(--glass-bg)] border border-[var(--glass-border)] p-5 rounded-full mb-4 shadow-lg shadow-black/5">
              <Lock className="w-10 h-10 text-[var(--text-secondary)]" />
            </div>
            <h2 className="text-2xl font-light mb-2 text-[var(--text-primary)] uppercase tracking-tight">{t('common.noAccess') || 'Ingen tilgang'}</h2>
            <p className="text-sm text-[var(--text-secondary)] max-w-md">
              {t('form.visibilityHint') || 'Denne siden er ikke synlig for din rolle.'}
            </p>
          </div>
        ) : isMediaPage(activePage) ? (
          <div key={activePage} className="page-transition">
            <MediaPage
              pageId={activePage}
              entities={entities}
              pageSettings={pageSettings}
              editMode={editMode}
              isSonosActive={isSonosActive}
              activeMediaId={activeMediaId}
              setActiveMediaId={setActiveMediaId}
              getA={getA}
              getEntityImageUrl={getEntityImageUrl}
              callService={callService}
              savePageSetting={savePageSetting}
              formatDuration={formatDuration}
              t={t}
            />
          </div>
        ) : activePage === SUPER_ADMIN_OVERVIEW_PAGE_ID && isPlatformAdmin ? (
          <div key={activePage} className="page-transition">
            <SuperAdminOverview
              t={t}
              language={language}
              userAdminApi={userAdminApi}
              isMobile={isMobile}
            />
          </div>
        ) : (pagesConfig[activePage] || []).filter(id => gridLayout[id]).length === 0 ? (
          <div key={`${activePage}-empty`} className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8 opacity-90 animate-in fade-in zoom-in duration-500 font-sans">
            <div className="bg-[var(--glass-bg)] border border-[var(--glass-border)] p-5 rounded-full mb-6 shadow-lg shadow-black/5">
              <LayoutGrid className="w-12 h-12 text-[var(--text-primary)] opacity-80" />
            </div>

            <h2 className="text-3xl font-light mb-3 text-[var(--text-primary)] uppercase tracking-tight">{t('welcome.title')}</h2>
            <p className="text-lg text-[var(--text-secondary)] mb-8 max-w-md leading-relaxed">{t('welcome.subtitle')}</p>

            <div className="flex gap-4">
              <button
                onClick={() => setShowAddCardModal(true)}
                className="flex items-center gap-3 px-8 py-4 bg-blue-500 hover:bg-blue-600 active:scale-95 text-white rounded-2xl shadow-lg shadow-blue-500/20 transition-all duration-200 font-bold uppercase tracking-widest text-sm"
              >
                <Plus className="w-5 h-5" />
                {t('welcome.addCard')}
              </button>
            </div>

            <div className="mt-12 max-w-xs mx-auto p-4 rounded-2xl bg-[var(--glass-bg)] border border-[var(--glass-border)]">
              <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest leading-relaxed">
                {t('welcome.editHint')}
              </p>
            </div>
          </div>
        ) : (
          <div
            key={activePage}
            className="grid font-sans page-transition items-start"
            data-dashboard-grid
            style={{
              gap: isMobile ? `${mobileGridGapV}px ${mobileGridGapH}px` : `${gridGapV}px ${gridGapH}px`,
              gridAutoRows: isMobile ? `${mobileGridAutoRow}px` : '100px',
              gridTemplateColumns: `repeat(${gridColCount}, minmax(0, 1fr))`,
            }}
          >
            {(pagesConfig[activePage] || [])
              .map((id) => ({ id, placement: gridLayout[id] }))
              .filter(({ placement }) => placement)
              .sort((a, b) => {
                if (a.placement.row !== b.placement.row) return a.placement.row - b.placement.row;
                return a.placement.col - b.placement.col;
              })
              .map(({ id }) => {
                const index = (pagesConfig[activePage] || []).indexOf(id);
                const placement = gridLayout[id];
                const settingsKey = getCardSettingsKey(id);
                const settings = cardSettings[settingsKey] || cardSettings[id] || {};
                const defaultLegacyRowSpan = placement?.rowSpan || 1;
                const defaultLegacyColSpan = placement?.colSpan || 1;
                const rowSpan = Number.isFinite(Number(settings.gridRowSpan))
                  ? Math.max(1, Math.round(Number(settings.gridRowSpan)))
                  : defaultLegacyRowSpan;
                const colSpan = Number.isFinite(Number(settings.gridColSpan))
                  ? Math.max(1, Math.min(gridColCount, Math.round(Number(settings.gridColSpan))))
                  : defaultLegacyColSpan;
                const heading = cardSettings[settingsKey]?.heading;

                if (!editMode && (hiddenCards.includes(id) || isCardHiddenByLogic(id) || !isCardVisibleForCurrentRole(id))) return null;

                const cardContent = renderCard(id, index);
                if (!cardContent) return null;

                return (
                  <div
                    key={id}
                    className={`h-full relative ${isCompactCards ? 'card-compact' : ''}`}
                    data-grid-card
                    style={{
                      gridRowStart: placement.row,
                      gridColumnStart: placement.col,
                      gridColumnEnd: `span ${colSpan}`,
                      gridRowEnd: `span ${rowSpan}`,
                    }}
                  >
                    {heading && (
                      <div className="absolute -top-4 left-2 text-[10px] uppercase tracking-[0.2em] font-bold text-[var(--text-secondary)]">
                        {heading}
                      </div>
                    )}
                    <div className="h-full">
                      <CardErrorBoundary cardId={id} t={t}>
                        {cardContent}
                      </CardErrorBoundary>
                    </div>
                  </div>
                );
              })}
          </div>
        )}

        {showProfileModal && (
          <div className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-md flex items-start md:items-center justify-center p-4 overflow-y-auto overscroll-contain">
            <form
              onSubmit={saveProfile}
              className="w-full max-w-2xl rounded-3xl border border-[var(--glass-border)] bg-[var(--modal-bg)] shadow-2xl overflow-hidden flex flex-col max-h-[92dvh] md:max-h-[90vh] my-auto"
              style={{ background: 'linear-gradient(140deg, var(--card-bg) 0%, var(--modal-bg) 100%)' }}
            >
              <div className="px-5 md:px-7 py-4 border-b border-[var(--glass-border)] flex items-center justify-between">
                <h3 className="text-xs md:text-sm font-bold uppercase tracking-[0.2em] text-[var(--text-secondary)]">{t('profile.title')}</h3>
                <button
                  type="button"
                  onClick={() => setShowProfileModal(false)}
                  className="text-xs px-3 py-1.5 rounded-lg border border-[var(--glass-border)] hover:bg-[var(--glass-bg-hover)] transition-colors"
                >
                  {t('common.close')}
                </button>
              </div>

              <div
                className="grid grid-cols-1 md:grid-cols-[250px_1fr] gap-0 overflow-y-auto overscroll-contain"
                style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}
              >
                <div className="p-5 md:p-7 border-b md:border-b-0 md:border-r border-[var(--glass-border)] bg-[var(--glass-bg)]/60">
                  <div className="flex flex-col items-center text-center gap-3">
                    <div className="w-24 h-24 rounded-3xl overflow-hidden border border-[var(--glass-border)] bg-[var(--glass-bg)] flex items-center justify-center">
                      {profileState.avatarUrl ? (
                        <img src={profileState.avatarUrl} alt={profileDisplayName} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-3xl font-bold tracking-wide text-[var(--text-primary)]">
                          {String(profileState.fullName || profileState.username || 'U').trim().slice(0, 2).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div>
                      <p className="text-base font-semibold text-[var(--text-primary)] truncate max-w-[210px]">{profileState.fullName || profileState.username || '-'}</p>
                      <p className="text-xs uppercase tracking-wider text-[var(--text-secondary)] mt-1">@{profileState.username || '-'}</p>
                    </div>
                    <div className="px-3 py-1 rounded-full text-[10px] uppercase font-bold tracking-widest bg-blue-500/15 border border-blue-500/30 text-blue-300">
                      {(currentUser?.role || 'user').toUpperCase()}
                    </div>
                  </div>
                </div>

                <div className="p-5 md:p-7 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="md:col-span-2">
                      <label className="block text-[10px] uppercase tracking-widest font-bold text-[var(--text-secondary)] mb-1.5">{t('profile.username')}</label>
                      <input value={profileState.username} onChange={(e) => setProfileState((prev) => ({ ...prev, username: e.target.value }))} className="w-full px-3 py-2.5 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)] text-sm outline-none focus:border-blue-500/40" />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-[10px] uppercase tracking-widest font-bold text-[var(--text-secondary)] mb-1.5">{t('profile.name')}</label>
                      <input value={profileState.fullName} onChange={(e) => setProfileState((prev) => ({ ...prev, fullName: e.target.value }))} className="w-full px-3 py-2.5 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)] text-sm outline-none focus:border-blue-500/40" />
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase tracking-widest font-bold text-[var(--text-secondary)] mb-1.5">{t('profile.email')}</label>
                      <input value={profileState.email} onChange={(e) => setProfileState((prev) => ({ ...prev, email: e.target.value }))} className="w-full px-3 py-2.5 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)] text-sm outline-none focus:border-blue-500/40" />
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase tracking-widest font-bold text-[var(--text-secondary)] mb-1.5">{t('profile.phone')}</label>
                      <input value={profileState.phone} onChange={(e) => setProfileState((prev) => ({ ...prev, phone: e.target.value }))} className="w-full px-3 py-2.5 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)] text-sm outline-none focus:border-blue-500/40" />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-[10px] uppercase tracking-widest font-bold text-[var(--text-secondary)] mb-1.5">{t('profile.avatarUrl')}</label>
                      <input value={profileState.avatarUrl} onChange={(e) => setProfileState((prev) => ({ ...prev, avatarUrl: e.target.value }))} className="w-full px-3 py-2.5 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)] text-sm outline-none focus:border-blue-500/40" />
                    </div>
                  </div>

                  {profileError && <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{profileError}</div>}

                  <div className="pt-2 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2">
                    <button type="button" onClick={onLogout} className="px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider bg-red-500/10 text-red-300 border border-red-500/25 hover:bg-red-500/15 transition-colors">{t('common.logout')}</button>
                    <button type="submit" disabled={profileSaving} className="px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider bg-blue-500 hover:bg-blue-600 text-white disabled:opacity-60 transition-colors">{profileSaving ? t('common.saving') : t('profile.save')}</button>
                  </div>
                </div>
              </div>
            </form>
          </div>
        )}

        <ModalOrchestrator
          entities={entities} conn={conn} activeUrl={activeUrl}
          connected={connected} authRef={authRef}
          config={config} setConfig={setConfig}
          t={t} language={language} setLanguage={setLanguage}
          modals={{
            ...modals,
            activeVacuumId, setActiveVacuumId,
            showThemeSidebar, setShowThemeSidebar,
            showLayoutSidebar, setShowLayoutSidebar,
            editCardSettingsKey, setEditCardSettingsKey,
            configTab, setConfigTab,
          }}
          appearance={{
            currentTheme, setCurrentTheme,
            bgMode, setBgMode, bgColor, setBgColor,
            bgGradient, setBgGradient, bgImage, setBgImage,
            cardTransparency, setCardTransparency,
            cardBorderOpacity, setCardBorderOpacity,
            inactivityTimeout, setInactivityTimeout,
          }}
          layout={{
            gridGapH, setGridGapH, gridGapV, setGridGapV,
            gridColumns, setGridColumns,
            cardBorderRadius, setCardBorderRadius,
            sectionSpacing, updateSectionSpacing,
            headerTitle: resolvedHeaderTitle, headerScale, headerSettings: effectiveHeaderSettings,
            updateHeaderScale, updateHeaderSettings,
            saveHeaderLogos,
            canEditGlobalBranding,
            canEditClientSubtitle,
          }}
          onboarding={{
            showOnboarding, setShowOnboarding, isOnboardingActive,
            onboardingStep, setOnboardingStep,
            onboardingUrlError, setOnboardingUrlError,
            onboardingTokenError, setOnboardingTokenError,
            testingConnection, testConnection,
            connectionTestResult, setConnectionTestResult,
            startOAuthLogin, handleOAuthLogout, canAdvanceOnboarding,
          }}
          pageManagement={{
            pageDefaults, editingPage, setEditingPage,
            newPageLabel, setNewPageLabel, newPageIcon, setNewPageIcon,
            createPage, createMediaPage, deletePage,
            pageSettings, savePageSetting,
            pagesConfig, persistConfig, activePage,
          }}
          entityHelpers={{
            callService, getEntityImageUrl, getA, getS,
            optimisticLightBrightness, setOptimisticLightBrightness,
            hvacMap, fanMap, swingMap,
            isSonosActive, isMediaActive,
          }}
          addCard={{
            addCardTargetPage, setAddCardTargetPage,
            addCardType, setAddCardType,
            searchTerm, setSearchTerm,
            selectedEntities, setSelectedEntities,
            selectedWeatherId, setSelectedWeatherId,
            selectedTempId, setSelectedTempId,
            selectedAndroidTVMediaId, setSelectedAndroidTVMediaId,
            selectedAndroidTVRemoteId, setSelectedAndroidTVRemoteId,
            selectedCostTodayId, setSelectedCostTodayId,
            selectedCostMonthId, setSelectedCostMonthId,
            costSelectionTarget, setCostSelectionTarget,
            selectedNordpoolId, setSelectedNordpoolId,
            nordpoolDecimals, setNordpoolDecimals,
            onAddSelected,
            getAddCardAvailableLabel, getAddCardNoneLeftLabel,
            setShowAddCardModal,
          }}
          cardConfig={{
            cardSettings, saveCardSetting, persistCardSettings,
            customNames, saveCustomName,
            customIcons, saveCustomIcon,
            hiddenCards, toggleCardVisibility,
            getCardSettingsKey,
            statusPillsConfig, saveStatusPillsConfig,
            globalDashboardProfiles,
            globalStorageBusy,
            globalStorageError,
            refreshGlobalDashboards,
            saveGlobalDashboard,
            loadGlobalDashboard,
            currentUser,
            canEditDashboard,
            canManageAdministration: canManageUsersAndClients,
            onLogout,
            userAdminApi,
          }}
          mediaTick={mediaTick}
        />
      </div>
    </div>
  );
}

export default function App() {
  const [authReady, setAuthReady] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [globalBranding, setGlobalBranding] = useState({});
  const [authError, setAuthError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);
  const [clientId, setClientId] = useState(() => getClientId());
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [haConfigHydrated, setHaConfigHydrated] = useState(false);

  const { config, setConfig, currentTheme } = useConfig();
  const isLightTheme = currentTheme === 'light';
  const refreshGlobalBranding = useCallback(async () => {
    try {
      const branding = await fetchServerGlobalBranding();
      if (branding && typeof branding === 'object') {
        setGlobalBranding(branding);
        return branding;
      }
    } catch {
      // best effort only
    }
    return null;
  }, []);

  const saveGlobalBranding = useCallback(async (nextBranding) => {
    if (!currentUser?.isPlatformAdmin) {
      return { ok: false, branding: null };
    }
    try {
      const saved = await saveServerGlobalBranding(nextBranding || {});
      if (saved && typeof saved === 'object') {
        setGlobalBranding(saved);
        return { ok: true, branding: saved };
      }
      return { ok: false, branding: null };
    } catch {
      return { ok: false, branding: null };
    }
  }, [currentUser?.isPlatformAdmin]);

  const loginLogoUrl = useMemo(() => {
    const fromGlobal = getLogoForTheme(globalBranding, currentTheme);
    const configured = resolveLogoUrl(fromGlobal || getStoredHeaderLogoUrl(currentTheme));
    const globalVersion = Date.parse(String(globalBranding?.updatedAt || '')) || 0;
    const withVersion = appendLogoVersion(configured, globalVersion || getStoredHeaderLogoVersion());
    return withVersion || '/logo.png';
  }, [currentUser, currentTheme, globalBranding]);
  const loginTitle = String(globalBranding?.title || 'Smart Sauna Systems').trim() || 'Smart Sauna Systems';

  const clearHaRuntimeConfig = useCallback(() => {
    clearStoredHaConfig();
    clearAllOAuthTokens({ syncServer: false });
    setConfig((prev) => normalizeHaConfig({
      ...prev,
      url: '',
      fallbackUrl: '',
      authMethod: 'oauth',
      token: '',
      oauthTokens: null,
      connections: [{
        id: 'primary',
        name: '',
        url: '',
        fallbackUrl: '',
        authMethod: 'oauth',
        token: '',
        oauthTokens: null,
        }],
      primaryConnectionId: 'primary',
    }));
  }, [setConfig]);

  const applySharedHaConfig = useCallback((sharedConfig) => {
    if (!sharedConfig) return false;
    const normalized = normalizeHaConfig(sharedConfig);

    setConfig((prev) => normalizeHaConfig({
      ...prev,
      ...normalized,
      updatedAt: sharedConfig.updatedAt || prev.updatedAt || null,
    }));

    writeStoredHaConfig(normalized);

    clearAllOAuthTokens({ syncServer: false });
    normalized.connections.forEach((connection) => {
      if (connection.authMethod === 'oauth' && connection.oauthTokens) {
        saveTokensForConnection(connection.id, connection.oauthTokens, { syncServer: false });
      } else {
        clearOAuthTokens({ syncServer: false, connectionId: connection.id });
      }
    });
    // Keep legacy primary callback cache in sync for existing oauth flows.
    if (normalized.authMethod === 'oauth' && normalized.oauthTokens) {
      saveTokens(normalized.oauthTokens);
    }
    return true;
  }, [setConfig]);

  useEffect(() => {
    let mounted = true;
    const init = async () => {
      try {
        const branding = await fetchServerGlobalBranding().catch(() => null);
        if (mounted && branding && typeof branding === 'object') {
          setGlobalBranding(branding);
        }

        const user = await fetchCurrentUser();
        if (!mounted) return;
        setCurrentUser(user);

        if (user) {
          setStoredClientId(user.clientId || getClientId());
          const shared = await fetchSharedHaConfig().catch(() => null);
          if (!mounted) return;
          const applied = applySharedHaConfig(shared);
          if (!applied) {
          const localScoped = readStoredHaConfig(user.clientId || getClientId());
          const normalizedLocal = normalizeHaConfig(localScoped || {});
          const canUseScopedLocal = Boolean(normalizedLocal.connections?.some((connection) => connection.url));
          if (canUseScopedLocal) {
            setConfig((prev) => normalizeHaConfig({ ...prev, ...normalizedLocal }));
          } else {
            clearHaRuntimeConfig();
          }
          }
        }
      } catch {
        if (mounted) {
          setCurrentUser(null);
          clearHaRuntimeConfig();
        }
      } finally {
        if (mounted) {
          setHaConfigHydrated(true);
          setAuthReady(true);
        }
      }
    };
    init();
    return () => { mounted = false; };
  }, [applySharedHaConfig, clearHaRuntimeConfig, setConfig]);

  const doLogin = async (e) => {
    e.preventDefault();
    setLoggingIn(true);
    setAuthError('');
    try {
      const result = await loginWithPassword(String(clientId || '').trim(), username, password);
      const user = result?.user || null;
      setStoredClientId(user?.clientId || String(clientId || '').trim());

      const shared = await fetchSharedHaConfig().catch(() => null);
      const applied = applySharedHaConfig(shared);
      if (!applied) {
        const localScoped = readStoredHaConfig(user?.clientId || getClientId());
        const normalizedLocal = normalizeHaConfig(localScoped || {});
        const canUseScopedLocal = Boolean(normalizedLocal.connections?.some((connection) => connection.url));
        if (canUseScopedLocal) {
          setConfig((prev) => normalizeHaConfig({ ...prev, ...normalizedLocal }));
        } else {
          clearHaRuntimeConfig();
        }
      }
      await refreshGlobalBranding();

      setCurrentUser(user);
      setHaConfigHydrated(true);
      setShowPassword(false);
    } catch (error) {
      setAuthError(error?.message || 'Login failed');
    } finally {
      setLoggingIn(false);
    }
  };

  const doLogout = async () => {
    await logoutUser();
    clearHaRuntimeConfig();
    setStoredClientId('');
    setClientId('');
    setUsername('');
    setPassword('');
    setShowPassword(false);
    setCurrentUser(null);
  };

  // ✅ Admin sync til server (loadTokens er async)
  useEffect(() => {
    if (!currentUser || currentUser.role !== 'admin' || !haConfigHydrated) return undefined;

    const timer = setTimeout(async () => {
      const normalized = normalizeHaConfig(config || {});
      const connectionsWithTokens = await Promise.all(
        normalized.connections.map(async (connection) => {
          if (connection.authMethod !== 'oauth') return { ...connection, oauthTokens: null };
          const oauthTokens = await loadTokensForConnection(connection.id).catch(() => null);
          return { ...connection, oauthTokens: oauthTokens || null };
        }),
      );
      const prepared = normalizeHaConfig({
        ...normalized,
        connections: connectionsWithTokens,
        primaryConnectionId: normalized.primaryConnectionId,
      });

      saveSharedHaConfig({
        ...prepared,
        connections: prepared.connections,
        primaryConnectionId: prepared.primaryConnectionId,
      }).catch(() => {});
    }, 500);

    return () => clearTimeout(timer);
  }, [currentUser, haConfigHydrated, config]);

  // ✅ showOnboarding styres i AppContent (attempted + !connected)
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Send alltid config inn; HA-provider får forsøke
  const haConfig = config;

  if (!authReady) {
    return <div className="min-h-screen flex items-center justify-center text-[var(--text-secondary)]">Loading…</div>;
  }

  if (!currentUser) {
    return (
      <div
        className="min-h-screen flex items-center justify-center px-4 py-6 relative overflow-hidden"
        style={{
          color: 'var(--text-primary)',
          background: isLightTheme
            ? 'linear-gradient(155deg, #f8fafc 0%, #ffffff 42%, #f1f5f9 100%)'
            : 'radial-gradient(880px 320px at 50% -6%, color-mix(in srgb, var(--accent-color) 24%, transparent), transparent 62%), linear-gradient(145deg, var(--bg-gradient-from), var(--bg-primary), var(--bg-gradient-to))',
        }}
      >
        <div
          className="pointer-events-none absolute -top-24 -left-10 w-64 h-64 rounded-full blur-3xl opacity-35"
          style={{ background: isLightTheme ? 'rgba(148, 163, 184, 0.20)' : 'color-mix(in srgb, var(--accent-color) 42%, transparent)' }}
        />
        <div
          className="pointer-events-none absolute -bottom-28 -right-8 w-72 h-72 rounded-full blur-3xl opacity-30"
          style={{ background: isLightTheme ? 'rgba(148, 163, 184, 0.16)' : 'color-mix(in srgb, var(--accent-color) 28%, transparent)' }}
        />
        <form
          onSubmit={doLogin}
          className="relative w-full max-w-[28rem] rounded-[2rem] border p-7 md:p-8 space-y-5 shadow-2xl backdrop-blur-2xl overflow-hidden"
          style={{
            background: isLightTheme
              ? 'linear-gradient(160deg, rgba(255,255,255,0.98), rgba(248,250,252,0.96))'
              : 'linear-gradient(158deg, color-mix(in srgb, var(--card-bg) 95%, transparent), color-mix(in srgb, var(--modal-bg) 98%, transparent) 68%, color-mix(in srgb, var(--accent-color) 7%, var(--modal-bg)))',
            borderColor: 'var(--glass-border)',
            boxShadow: isLightTheme ? '0 22px 60px rgba(15, 23, 42, 0.16)' : '0 32px 90px rgba(2, 6, 23, 0.34)',
          }}
        >
          <div
            className="pointer-events-none absolute top-0 inset-x-0 h-14"
            style={{ background: 'linear-gradient(180deg, color-mix(in srgb, var(--accent-color) 20%, transparent), transparent)' }}
          />
          <div
            className="absolute inset-0 rounded-3xl pointer-events-none"
            style={{
              border: '1px solid color-mix(in srgb, var(--accent-color) 24%, transparent)',
              maskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.9), rgba(0,0,0,0.3) 55%, transparent)',
            }}
          />
          <div className="relative flex flex-col items-center gap-4 pb-1">
            <div
              className="w-16 h-16 rounded-[1.15rem] flex items-center justify-center border relative overflow-hidden"
              style={{
                background: 'linear-gradient(145deg, color-mix(in srgb, var(--accent-color) 18%, transparent), color-mix(in srgb, var(--accent-color) 8%, transparent))',
                borderColor: 'color-mix(in srgb, var(--accent-color) 35%, transparent)',
              }}
            >
              <img
                key={loginLogoUrl}
                src={loginLogoUrl}
                alt="App logo"
                className="w-16 h-16 object-contain select-none"
                loading="eager"
                decoding="async"
              />
            </div>
            <h1
              className="text-[1.2rem] md:text-[1.38rem] font-light text-center tracking-[0.22em] uppercase"
              style={{ fontFamily: "'Roboto', 'Helvetica Neue', Arial, sans-serif", lineHeight: 1.2 }}
            >
              {loginTitle}
            </h1>
            <div className="w-24 h-px opacity-60" style={{ background: 'color-mix(in srgb, var(--accent-color) 36%, var(--glass-border))' }} />
            <p className="text-center text-[12px] leading-relaxed max-w-[24rem]" style={{ color: 'var(--text-secondary)' }}>
              Sign in to manage your sauna systems, monitor activity, and keep everything running smoothly in one place.
            </p>
          </div>

          <div className="space-y-1.5 pt-1">
            <label className="block text-[11px] uppercase tracking-[0.18em] text-[var(--text-secondary)]">Client ID</label>
            <input
              className="w-full px-4 py-3 rounded-xl border outline-none transition-colors focus:ring-2"
              style={{
                background: 'linear-gradient(145deg, color-mix(in srgb, var(--glass-bg) 90%, transparent), color-mix(in srgb, var(--glass-bg) 72%, transparent))',
                borderColor: 'var(--glass-border)',
              }}
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              autoComplete="organization"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-[11px] uppercase tracking-[0.18em] text-[var(--text-secondary)]">Username</label>
            <input
              className="w-full px-4 py-3 rounded-xl border outline-none transition-colors focus:ring-2"
              style={{
                background: 'linear-gradient(145deg, color-mix(in srgb, var(--glass-bg) 90%, transparent), color-mix(in srgb, var(--glass-bg) 72%, transparent))',
                borderColor: 'var(--glass-border)',
              }}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-[11px] uppercase tracking-[0.18em] text-[var(--text-secondary)]">Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                className="w-full px-4 pr-12 py-3 rounded-xl border outline-none transition-colors focus:ring-2"
                style={{
                  background: 'linear-gradient(145deg, color-mix(in srgb, var(--glass-bg) 90%, transparent), color-mix(in srgb, var(--glass-bg) 72%, transparent))',
                  borderColor: 'var(--glass-border)',
                }}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute inset-y-0 right-0 px-3 rounded-r-xl flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                title={showPassword ? 'Hide password' : 'Show password'}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {authError && <div className="text-sm text-red-300 bg-red-500/15 border border-red-500/30 rounded-xl px-3 py-2">{authError}</div>}

          <button
            disabled={loggingIn}
            className="w-full py-3.5 rounded-xl text-white font-medium uppercase tracking-[0.18em] disabled:opacity-60 transition-colors shadow-lg"
            style={{
              background: 'linear-gradient(135deg, color-mix(in srgb, var(--accent-color) 92%, #1d4ed8), var(--accent-color))',
              boxShadow: '0 10px 28px color-mix(in srgb, var(--accent-color) 40%, transparent)',
            }}
          >
            {loggingIn ? <span className="inline-block w-4 h-4 mr-2 border-2 border-white/30 border-t-white rounded-full animate-spin align-[-2px]" /> : <Lock className="w-4 h-4 inline mr-2" />}
            {loggingIn ? 'Signing in…' : 'Sign in'}
          </button>

          <p className="text-center text-[11px] leading-relaxed px-2" style={{ color: 'var(--text-secondary)' }}>
            If you do not have an account yet, please contact us at <a className="underline underline-offset-2" href="mailto:contact@smarti.dev">contact@smarti.dev</a>.
          </p>
        </form>
      </div>
    );
  }

  if (!haConfigHydrated) {
    return <div className="min-h-screen flex items-center justify-center text-[var(--text-secondary)]">Loading shared connection…</div>;
  }

  const userAdminApi = {
    listUsers: listServerUsers,
    createUser: createServerUser,
    updateUser: async (id, user) => {
      const updated = await updateServerUser(id, user);
      if (updated?.id && currentUser?.id && updated.id === currentUser.id) {
        try {
          const me = await fetchCurrentUser();
          setCurrentUser(me || null);
        } catch {
          setCurrentUser(null);
        }
      }
      return updated;
    },
    deleteUser: deleteServerUser,
    listClients: listServerClients,
    createClient: createServerClient,
    createClientAdmin: createServerClientAdmin,
    updateClient: updateServerClient,
    deleteClient: deleteServerClient,
    fetchClientHaConfig: fetchServerClientHaConfig,
    saveClientHaConfig: saveServerClientHaConfig,
    listClientDashboards: listServerClientDashboards,
    fetchClientDashboard: fetchServerClientDashboard,
    saveClientDashboard: saveServerClientDashboard,
    listClientDashboardVersions: listServerClientDashboardVersions,
    restoreClientDashboardVersion: restoreServerClientDashboardVersion,
    fetchPlatformOverview: fetchServerPlatformOverview,
  };

  return (
    <HomeAssistantProvider config={haConfig}>
      <AppContent
        showOnboarding={showOnboarding}
        setShowOnboarding={setShowOnboarding}
        currentUser={currentUser}
        globalBranding={globalBranding}
        onLogout={doLogout}
        onProfileUpdated={setCurrentUser}
        onSaveGlobalBranding={saveGlobalBranding}
        userAdminApi={userAdminApi}
      />
    </HomeAssistantProvider>
  );
}
