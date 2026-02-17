// src/App.jsx

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { en, nn, nb } from './i18n';
import {
  AlertTriangle,
  Check,
  Edit2,
  Flame,
  LayoutGrid,
  Plus,
  Lock,
  User,
} from './icons';

import SettingsDropdown from './components/ui/SettingsDropdown';
import { Header, StatusBar } from './layouts';

import {
  MediaPage,
  PageNavigation,
  PersonStatus,
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

import { clearOAuthTokens, loadTokens, saveTokens } from './services/oauthStorage';
import {
  fetchCurrentUser,
  loginWithPassword,
  logoutUser,
  updateProfile as updateCurrentProfile,
  listUsers as listServerUsers,
  createUser as createServerUser,
  updateUser as updateServerUser,
  deleteUser as deleteServerUser,
  fetchSharedHaConfig,
  saveSharedHaConfig,
} from './services/appAuth';

import { isCardRemovable as _isCardRemovable, isCardHiddenByLogic as _isCardHiddenByLogic, isMediaPage as _isMediaPage } from './utils/cardUtils';
import { getCardGridSize as _getCardGridSize, buildGridLayout as _buildGridLayout } from './utils/gridLayout';
import { createDragAndDropHandlers } from './utils/dragAndDrop';
import { dispatchCardRender } from './rendering/cardRenderers';
import ModalOrchestrator from './rendering/ModalOrchestrator';
import CardErrorBoundary from './components/ui/CardErrorBoundary';
import EditOverlay from './components/ui/EditOverlay';
import AuroraBackground from './components/effects/AuroraBackground';

function AppContent({
  showOnboarding,
  setShowOnboarding,
  currentUser,
  onLogout,
  onProfileUpdated,
  userAdminApi,
  haConfigHydrated,
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

  const {
    pagesConfig,
    setPagesConfig,
    persistConfig,
    cardSettings,
    saveCardSetting,
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
    updateHeaderTitle,
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

  const resolvedHeaderTitle = headerTitle || t('page.home');

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
  const canEditDashboard = currentUser?.role === 'admin';
  const WARNING_SENSOR_ID = 'sensor.system_warning_details';
  const CRITICAL_SENSOR_ID = 'sensor.system_critical_details';

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

  // ── Responsive grid ────────────────────────────────────────────────────
  const { gridColCount, isCompactCards, isMobile } = useResponsiveGrid(gridColumns);

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

  // ✅ Onboarding skal kun vises når vi faktisk ser at HA ikke er tilgjengelig
  // (dvs. HA-provider har forsøkt å koble og meldt unavailable/expired).
  useEffect(() => {
    if (!haConfigHydrated) return;

    const attempted = Boolean(haUnavailableVisible || oauthExpired);
    const desiredShow = attempted && !connected;

    setShowOnboarding((prev) => (prev === desiredShow ? prev : desiredShow));
  }, [haConfigHydrated, haUnavailableVisible, oauthExpired, connected, setShowOnboarding]);

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
  useEffect(() => {
    const pages = pagesConfig.pages || [];
    if (activePage !== 'home' && !pages.includes(activePage)) {
      setActivePage('home');
    }
  }, [pagesConfig.pages]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Entity accessor helpers ────────────────────────────────────────────
  const {
    getS, getA, getEntityImageUrl, callService: rawCallService,
    isSonosActive, isMediaActive,
    hvacMap, fanMap, swingMap,
  } = useEntityHelpers({ entities, conn, activeUrl, language, now, t });

  const canControlDevices = currentUser?.role !== 'inspector';
  const isAdminUser = currentUser?.role === 'admin';
  const profileDisplayName = String(currentUser?.fullName || currentUser?.username || t('profile.userFallback')).trim();
  const [dashboardDirty, setDashboardDirty] = useState(false);
  const dashboardDirtyReadyRef = useRef(false);
  const quickSaveBusyRef = useRef(false);
  const callService = useCallback((domain, service, payload, target) => {
    if (!canControlDevices) return false;
    return rawCallService(domain, service, payload, target);
  }, [canControlDevices, rawCallService]);

  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState('');
  const loadedAssignedDashboardRef = useRef('');
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
    const target = String(currentUser?.assignedDashboardId || 'default');
    try {
      const ok = await saveGlobalDashboard(target);
      if (ok) setDashboardDirty(false);
    } finally {
      quickSaveBusyRef.current = false;
    }
  }, [isAdminUser, currentUser?.assignedDashboardId, saveGlobalDashboard]);

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
    home: { label: t('page.home'), icon: LayoutGrid }
  };

  const pages = (pagesConfig.pages || []).map(id => ({
    id,
    label: pageDefaults[id]?.label || id,
    icon: pageDefaults[id]?.icon || LayoutGrid
  }));

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
    const visibleIds = editMode ? ids : ids.filter(id => !(hiddenCards.includes(id) || _isCardHiddenByLogic(id, hiddenCtx)));
    return _buildGridLayout(visibleIds, gridColCount, getCardGridSize);
  }, [pagesConfig, activePage, gridColCount, hiddenCards, editMode, getCardGridSize, getCardSettingsKey, cardSettings, entities]);

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
    const isHidden = hiddenCards.includes(cardId) || isCardHiddenByLogic(cardId);
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
      const isHiddenNow = hiddenCards.includes(cardId) || isCardHiddenByLogic(cardId);
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

  return (
    <div
      className="min-h-screen font-sans selection:bg-blue-500/30 overflow-x-hidden transition-colors duration-500"
      style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
    >
      {bgMode === 'animated' ? (
        <AuroraBackground />
      ) : (
        <div className="fixed inset-0 pointer-events-none z-0">
          <div
            className="absolute inset-0"
            style={{
              background: 'linear-gradient(to bottom right, var(--bg-gradient-from), var(--bg-primary), var(--bg-gradient-to))',
            }}
          />
          <div
            className="absolute top-[-15%] right-[-10%] w-[70%] h-[70%] rounded-full pointer-events-none"
            style={{ background: 'rgba(59, 130, 246, 0.08)', filter: 'blur(150px)' }}
          />
          <div
            className="absolute bottom-[-15%] left-[-10%] w-[70%] h-[70%] rounded-full pointer-events-none"
            style={{ background: 'rgba(30, 58, 138, 0.1)', filter: 'blur(150px)' }}
          />
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
          headerSettings={headerSettings}
          setShowHeaderEditModal={setShowHeaderEditModal}
          t={t}
          isMobile={isMobile}
          sectionSpacing={sectionSpacing}
        >
          <div
            className={`w-full mt-0 font-sans ${isMobile ? 'flex flex-col items-start gap-3' : 'flex items-center justify-between'}`}
            style={{ marginTop: `${sectionSpacing?.headerToStatus ?? 0}px` }}
          >
            <div className={`flex flex-wrap gap-2.5 items-center min-w-0 ${isMobile ? 'scale-90 origin-left w-full' : ''}`}>
              {(pagesConfig.header || []).map(id => personStatus(id))}
              {editMode && canEditDashboard && (
                <button
                  onClick={() => { setAddCardTargetPage('header'); setShowAddCardModal(true); }}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/20 border border-blue-500/30 text-blue-400 hover:bg-blue-500/30 transition-all text-[10px] font-bold uppercase tracking-[0.2em]"
                >
                  <Plus className="w-3 h-3" /> {t('addCard.type.entity')}
                </button>
              )}
              {(pagesConfig.header || []).length > 0 && <div className="w-px h-8 bg-[var(--glass-border)] mx-2"></div>}
            </div>

            <div className={`min-w-0 ${isMobile ? 'w-full' : 'flex-1'}`}>
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
                statusPillsConfig={statusPillsConfig}
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

        <div
          className="flex flex-nowrap items-center justify-between gap-4"
          style={{ marginBottom: `${sectionSpacing?.navToGrid ?? 24}px` }}
        >
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

          <div className="relative flex items-center gap-6 flex-shrink-0 overflow-visible pb-2 justify-end">
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

            <button
              onClick={() => {
                if (!canEditDashboard) return;
                const currentSettings = pageSettings[activePage];
                if (currentSettings?.hidden) setActivePage('home');
                setEditMode(!editMode);
              }}
              className={`p-2 rounded-full group ${editMode ? 'bg-blue-500/20 text-blue-400' : 'text-[var(--text-secondary)]'}`}
              title={canEditDashboard ? (editMode ? t('nav.done') : t('menu.edit')) : 'Admin only'}
            >
              <Edit2 className="w-5 h-5" />
            </button>

            {currentUser && (
              <button
                onClick={() => setShowProfileModal(true)}
                className="px-2 py-1 rounded-full border border-[var(--glass-border)] text-[10px] uppercase tracking-wider text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                title={t('profile.title')}
              >
                <User className="w-3 h-3 inline mr-1" />
                {profileDisplayName} ({currentUser.role})
              </button>
            )}

            <div className="relative">
              <SettingsDropdown
                onOpenSettings={() => { setShowConfigModal(true); setConfigTab('connection'); }}
                onOpenTheme={() => setShowThemeSidebar(true)}
                onOpenLayout={() => setShowLayoutSidebar(true)}
                onOpenHeader={() => setShowHeaderEditModal(true)}
                showLayout={isAdminUser}
                showHeader={isAdminUser}
                showConnection={isAdminUser}
                t={t}
              />
              {updateCount > 0 && (
                <div className="absolute -top-1 -right-1 w-5 h-5 bg-gray-600 rounded-full flex items-center justify-center border-2 border-[var(--card-bg)] pointer-events-none shadow-sm">
                  <span className="text-[11px] font-bold text-white leading-none pt-[1px]">{updateCount}</span>
                </div>
              )}
            </div>

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

        {isMediaPage(activePage) ? (
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
              gap: isMobile ? '12px' : `${gridGapV}px ${gridGapH}px`,
              gridAutoRows: isMobile ? '82px' : '100px',
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

                if (!editMode && (hiddenCards.includes(id) || isCardHiddenByLogic(id))) return null;

                const cardContent = renderCard(id, index);
                if (!cardContent) return null;

                return (
                  <div
                    key={id}
                    className={`h-full relative ${(isCompactCards || isMobile) ? 'card-compact' : ''}`}
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
          <div className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <form onSubmit={saveProfile} className="w-full max-w-lg rounded-2xl border border-white/10 bg-[var(--card-bg)] p-5 space-y-4 shadow-2xl">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold uppercase tracking-wider">{t('profile.title')}</h3>
                <button type="button" onClick={() => setShowProfileModal(false)} className="text-xs px-2 py-1 rounded-lg border border-[var(--glass-border)]">{t('common.close')}</button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input value={profileState.username} onChange={(e) => setProfileState((prev) => ({ ...prev, username: e.target.value }))} placeholder={t('profile.username')} className="px-3 py-2 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)] text-sm md:col-span-2" />
                <input value={profileState.fullName} onChange={(e) => setProfileState((prev) => ({ ...prev, fullName: e.target.value }))} placeholder={t('profile.name')} className="px-3 py-2 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)] text-sm md:col-span-2" />
                <input value={profileState.email} onChange={(e) => setProfileState((prev) => ({ ...prev, email: e.target.value }))} placeholder={t('profile.email')} className="px-3 py-2 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)] text-sm" />
                <input value={profileState.phone} onChange={(e) => setProfileState((prev) => ({ ...prev, phone: e.target.value }))} placeholder={t('profile.phone')} className="px-3 py-2 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)] text-sm" />
                <input value={profileState.avatarUrl} onChange={(e) => setProfileState((prev) => ({ ...prev, avatarUrl: e.target.value }))} placeholder={t('profile.avatarUrl')} className="px-3 py-2 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)] text-sm md:col-span-2" />
                <input value={currentUser?.role || ''} disabled className="px-3 py-2 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)] text-sm opacity-70 md:col-span-2" />
              </div>
              {profileError && <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{profileError}</div>}
              <div className="flex items-center justify-between">
                <button type="button" onClick={onLogout} className="px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider bg-red-500/10 text-red-300 border border-red-500/25">{t('common.logout')}</button>
                <button type="submit" disabled={profileSaving} className="px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider bg-blue-500 hover:bg-blue-600 text-white disabled:opacity-60">{profileSaving ? t('common.saving') : t('profile.save')}</button>
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
            headerTitle, headerScale, headerSettings,
            updateHeaderTitle, updateHeaderScale, updateHeaderSettings,
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
  const [authError, setAuthError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [haConfigHydrated, setHaConfigHydrated] = useState(false);

  const { config, setConfig } = useConfig();

  const applySharedHaConfig = useCallback((sharedConfig) => {
    if (!sharedConfig) return;
    const resolvedAuthMethod = sharedConfig.authMethod === 'token'
      ? 'token'
      : (sharedConfig.oauthTokens ? 'oauth' : (sharedConfig.token ? 'token' : 'oauth'));

    setConfig((prev) => ({
      ...prev,
      url: sharedConfig.url || '',
      fallbackUrl: sharedConfig.fallbackUrl || '',
      authMethod: resolvedAuthMethod,
      token: sharedConfig.token || '',
    }));

    try {
      localStorage.setItem('ha_url', sharedConfig.url || '');
      localStorage.setItem('ha_fallback_url', sharedConfig.fallbackUrl || '');
      localStorage.setItem('ha_auth_method', resolvedAuthMethod);
      localStorage.setItem('ha_token', sharedConfig.token || '');
    } catch {}

    if (resolvedAuthMethod === 'oauth' && sharedConfig.oauthTokens) {
      saveTokens(sharedConfig.oauthTokens);
    } else {
      clearOAuthTokens({ syncServer: false });
    }
  }, [setConfig]);

  useEffect(() => {
    let mounted = true;
    const init = async () => {
      try {
        const user = await fetchCurrentUser();
        if (!mounted) return;
        setCurrentUser(user);

        if (user) {
          const shared = await fetchSharedHaConfig().catch(() => null);
          if (!mounted) return;
          applySharedHaConfig(shared);
        }
      } catch {
        if (mounted) setCurrentUser(null);
      } finally {
        if (mounted) {
          setHaConfigHydrated(true);
          setAuthReady(true);
        }
      }
    };
    init();
    return () => { mounted = false; };
  }, [applySharedHaConfig]);

  const doLogin = async (e) => {
    e.preventDefault();
    setLoggingIn(true);
    setAuthError('');
    try {
      const result = await loginWithPassword(username, password);
      const user = result?.user || null;

      const shared = await fetchSharedHaConfig().catch(() => null);
      applySharedHaConfig(shared);

      setCurrentUser(user);
      setHaConfigHydrated(true);
    } catch (error) {
      setAuthError(error?.message || 'Login failed');
    } finally {
      setLoggingIn(false);
    }
  };

  const doLogout = async () => {
    await logoutUser();
    setCurrentUser(null);
  };

  // ✅ Admin sync til server (loadTokens er async)
  useEffect(() => {
    if (!currentUser || currentUser.role !== 'admin' || !haConfigHydrated) return undefined;

    const timer = setTimeout(async () => {
      const authMethod = config.authMethod === 'token' ? 'token' : 'oauth';
      const oauthTokens = authMethod === 'oauth' ? (await loadTokens() || null) : null;

      saveSharedHaConfig({
        url: config.url || '',
        fallbackUrl: config.fallbackUrl || '',
        authMethod,
        token: authMethod === 'token' ? (config.token || '') : '',
        oauthTokens,
      }).catch(() => {});
    }, 500);

    return () => clearTimeout(timer);
  }, [currentUser, haConfigHydrated, config.url, config.fallbackUrl, config.authMethod, config.token]);

  // ✅ showOnboarding styres i AppContent (attempted + !connected)
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Send alltid config inn; HA-provider får forsøke
  const haConfig = config;

  if (!authReady) {
    return <div className="min-h-screen flex items-center justify-center text-[var(--text-secondary)]">Loading…</div>;
  }

  if (!currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-[radial-gradient(circle_at_top,#1f2937_0%,#0b1220_45%,#05070d_100%)]" style={{ color: 'var(--text-primary)' }}>
        <form onSubmit={doLogin} className="w-full max-w-md rounded-3xl border border-white/10 bg-black/40 backdrop-blur-xl p-8 space-y-5 shadow-2xl shadow-black/40">
          <div className="flex flex-col items-center gap-3 pb-2">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-orange-500/20 border border-orange-400/30">
              <Flame className="w-8 h-8 text-orange-300" />
            </div>
            <h1 className="text-lg font-black uppercase tracking-[0.28em] text-center">SMART SAUNA SYSTEMS</h1>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-300">Secure Dashboard Access</p>
          </div>

          <div className="space-y-1.5">
            <label className="block text-[11px] uppercase tracking-[0.18em] text-slate-300">Username</label>
            <input
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/15 focus:border-blue-400/70 outline-none transition-colors"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-[11px] uppercase tracking-[0.18em] text-slate-300">Password</label>
            <input
              type="password"
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/15 focus:border-blue-400/70 outline-none transition-colors"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>

          {authError && <div className="text-sm text-red-300 bg-red-500/15 border border-red-500/30 rounded-xl px-3 py-2">{authError}</div>}

          <button
            disabled={loggingIn}
            className="w-full py-3 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-bold uppercase tracking-[0.16em] disabled:opacity-60"
          >
            {loggingIn ? <span className="inline-block w-4 h-4 mr-2 border-2 border-white/30 border-t-white rounded-full animate-spin align-[-2px]" /> : <Lock className="w-4 h-4 inline mr-2" />}
            {loggingIn ? 'Signing in…' : 'Sign in'}
          </button>
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
    updateUser: updateServerUser,
    deleteUser: deleteServerUser,
  };

  return (
    <HomeAssistantProvider config={haConfig}>
      <AppContent
        showOnboarding={showOnboarding}
        setShowOnboarding={setShowOnboarding}
        currentUser={currentUser}
        onLogout={doLogout}
        onProfileUpdated={setCurrentUser}
        userAdminApi={userAdminApi}
        haConfigHydrated={haConfigHydrated}
      />
    </HomeAssistantProvider>
  );
}
