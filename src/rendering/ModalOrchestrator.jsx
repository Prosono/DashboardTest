/**
 * ModalOrchestrator – renders every modal / sidebar for the dashboard.
 *
 * Extracted from the bottom of App.jsx's return block so that the main
 * component only deals with layout and grid rendering.
 *
 * Each modal is lazy-loaded and wrapped in <ModalSuspense> just like before.
 */
import { lazy, useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { ModalSuspense, getServerInfo } from '../components';
import { themes } from '../config/themes';
import { formatDuration } from '../utils';
import { buildOnboardingSteps, validateUrl } from '../config/onboarding';
import { prepareNordpoolData } from '../services';
import { dispatchCardRender } from './cardRenderers';

// Lazy load all modals
const AddPageModal = lazy(() => import('../modals/AddPageModal'));
const AddCardContent = lazy(() => import('../modals/AddCardContent'));
const CalendarModal = lazy(() => import('../modals/CalendarModal'));
const ConfigModal = lazy(() => import('../modals/ConfigModal'));
const CostModal = lazy(() => import('../modals/CostModal'));
const EditCardModal = lazy(() => import('../modals/EditCardModal'));
const EditPageModal = lazy(() => import('../modals/EditPageModal'));
const GenericAndroidTVModal = lazy(() => import('../modals/GenericAndroidTVModal'));
const GenericClimateModal = lazy(() => import('../modals/GenericClimateModal'));
const CoverModal = lazy(() => import('../modals/CoverModal'));
const WeatherModal = lazy(() => import('../modals/WeatherModal'));
const LeafModal = lazy(() => import('../modals/LeafModal'));
const LightModal = lazy(() => import('../modals/LightModal'));
const MediaModal = lazy(() => import('../modals/MediaModal'));
const NordpoolModal = lazy(() => import('../modals/NordpoolModal'));
const PersonModal = lazy(() => import('../modals/PersonModal'));
const SensorModal = lazy(() => import('../modals/SensorModal'));
const StatusPillsConfigModal = lazy(() => import('../modals/StatusPillsConfigModal'));
const TodoModal = lazy(() => import('../modals/TodoModal'));
const RoomModal = lazy(() => import('../modals/RoomModal'));
const VacuumModal = lazy(() => import('../modals/VacuumModal'));
const SaunaFieldModal = lazy(() => import('../modals/SaunaFieldModal'));
const SaunaDebugModal = lazy(() => import('../modals/SaunaDebugModal'));

const ThemeSidebar = lazy(() => import('../components/sidebars/ThemeSidebar'));
const LayoutSidebar = lazy(() => import('../components/sidebars/LayoutSidebar'));
const HeaderSidebar = lazy(() => import('../components/sidebars/HeaderSidebar'));

function PopupCardFitFrame({
  fitToViewport = false,
  isMobile = false,
  liftPx = 0,
  viewportHeightOffsetPx = 68,
  scaleFloor = 0.45,
  children,
}) {
  const viewportRef = useRef(null);
  const contentRef = useRef(null);
  const [scale, setScale] = useState(1);
  const [scaledHeight, setScaledHeight] = useState(null);

  const recalcScale = useCallback(() => {
    if (!fitToViewport) {
      setScale(1);
      setScaledHeight(null);
      return;
    }

    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!viewport || !content) return;

    const viewportWidth = viewport.clientWidth;
    const viewportHeight = viewport.clientHeight;
    if (viewportWidth <= 0 || viewportHeight <= 0) return;

    const rawWidth = content.scrollWidth;
    const rawHeight = content.scrollHeight;
    if (rawWidth <= 0 || rawHeight <= 0) return;

    const nextScale = Math.min(1, viewportWidth / rawWidth, viewportHeight / rawHeight);
    const boundedScale = Number.isFinite(nextScale) ? Math.max(scaleFloor, nextScale) : 1;
    setScale((prev) => (Math.abs(prev - boundedScale) > 0.005 ? boundedScale : prev));
    setScaledHeight((rawHeight * boundedScale) + 2);
  }, [fitToViewport, scaleFloor]);

  useEffect(() => {
    const raf = requestAnimationFrame(recalcScale);
    return () => cancelAnimationFrame(raf);
  }, [recalcScale, children]);

  useEffect(() => {
    if (!fitToViewport) return undefined;

    const handleResize = () => {
      requestAnimationFrame(recalcScale);
    };
    window.addEventListener('resize', handleResize, { passive: true });

    let observer = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => requestAnimationFrame(recalcScale));
      if (viewportRef.current) observer.observe(viewportRef.current);
      if (contentRef.current) observer.observe(contentRef.current);
    }

    const timeoutA = setTimeout(recalcScale, 80);
    const timeoutB = setTimeout(recalcScale, 240);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (observer) observer.disconnect();
      clearTimeout(timeoutA);
      clearTimeout(timeoutB);
    };
  }, [fitToViewport, recalcScale]);

  if (!fitToViewport) {
    return (
      <div className="max-h-[calc(92vh-72px)] overflow-y-auto custom-scrollbar pr-1" data-disable-pull-refresh="true">
        {children}
      </div>
    );
  }

  return (
    <div
      ref={viewportRef}
      className="overflow-hidden"
      style={{
        height: isMobile
          ? `calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - ${Math.max(24, Number(viewportHeightOffsetPx) || 68)}px)`
          : 'calc(95dvh - 68px)',
        transform: liftPx > 0 ? `translateY(-${liftPx}px)` : undefined,
      }}
      data-disable-pull-refresh="true"
    >
      <div className="w-full h-full flex justify-center overflow-hidden">
        <div className="w-full" style={{ height: scaledHeight ? `${scaledHeight}px` : '100%' }}>
          <div
            ref={contentRef}
            className="w-full"
            style={{
              transform: `scale(${scale})`,
              transformOrigin: 'top center',
              willChange: 'transform',
            }}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ModalOrchestrator({
  entities, conn, activeUrl, connected, authRef,
  tempHistoryById,
  config, setConfig,
  t, language, setLanguage,
  modals, appearance, layout, onboarding,
  pageManagement, entityHelpers, addCard, cardConfig,
  mediaTick,
}) {
  // ── Destructure grouped props ──────────────────────────────────────────
  const {
    showNordpoolModal, setShowNordpoolModal,
    showCostModal, setShowCostModal,
    activeClimateEntityModal, setActiveClimateEntityModal,
    showLightModal, setShowLightModal,
    activeCarModal, setActiveCarModal,
    showPersonModal, setShowPersonModal,
    showAndroidTVModal, setShowAndroidTVModal,
    showVacuumModal, setShowVacuumModal,
    showSensorInfoModal, setShowSensorInfoModal,
    showCalendarModal, setShowCalendarModal,
    showTodoModal, setShowTodoModal,
    showRoomModal, setShowRoomModal,
    showCoverModal, setShowCoverModal,
    showWeatherModal, setShowWeatherModal,
    activeSaunaFieldModal, setActiveSaunaFieldModal,
    showSaunaDebugModal, setShowSaunaDebugModal,
    showPopupCardModal, setShowPopupCardModal,
    activeMediaModal, setActiveMediaModal,
    activeMediaGroupKey, setActiveMediaGroupKey,
    activeMediaGroupIds, setActiveMediaGroupIds,
    activeMediaSessionSensorIds, setActiveMediaSessionSensorIds,
    activeMediaId, setActiveMediaId,
    showAddCardModal, setShowAddCardModal,
    showConfigModal, setShowConfigModal,
    showAddPageModal, setShowAddPageModal,
    showHeaderEditModal, setShowHeaderEditModal,
    showEditCardModal, setShowEditCardModal,
    showStatusPillsConfig, setShowStatusPillsConfig,
    activeVacuumId, setActiveVacuumId,
    showThemeSidebar, setShowThemeSidebar,
    showLayoutSidebar, setShowLayoutSidebar,
    editCardSettingsKey, setEditCardSettingsKey,
    configTab, setConfigTab,
  } = modals;

  const {
    currentTheme, setCurrentTheme,
    bgMode, setBgMode, bgColor, setBgColor,
    bgGradient, setBgGradient, bgImage, setBgImage,
    cardTransparency, setCardTransparency,
    cardBorderOpacity, setCardBorderOpacity,
    inactivityTimeout, setInactivityTimeout,
  } = appearance;

  const {
    gridGapH, setGridGapH, gridGapV, setGridGapV,
    gridColumns, setGridColumns,
    cardBorderRadius, setCardBorderRadius,
    sectionSpacing, updateSectionSpacing,
    headerTitle, headerScale, headerSettings,
    updateHeaderScale, updateHeaderSettings,
    saveHeaderLogos,
    canEditGlobalBranding,
    canEditClientSubtitle,
  } = layout;
  const canAccessHeaderSettings = Boolean(canEditGlobalBranding || canEditClientSubtitle);

  const {
    showOnboarding, setShowOnboarding, isOnboardingActive,
    onboardingStep, setOnboardingStep,
    onboardingUrlError, setOnboardingUrlError,
    onboardingTokenError, setOnboardingTokenError,
    testingConnection, testConnection,
    connectionTestResult, setConnectionTestResult,
    startOAuthLogin, handleOAuthLogout, canAdvanceOnboarding,
  } = onboarding;

  const {
    pageDefaults, editingPage, setEditingPage,
    newPageLabel, setNewPageLabel, newPageIcon, setNewPageIcon,
    createPage, createMediaPage, deletePage,
    pageSettings, savePageSetting,
    pagesConfig, persistConfig, activePage,
  } = pageManagement;

  const {
    callService, getEntityImageUrl, getA, getS,
    optimisticLightBrightness, setOptimisticLightBrightness,
    hvacMap, fanMap, swingMap,
    isSonosActive, isMediaActive,
  } = entityHelpers;

  const {
    addCardTargetPage, addCardType, setAddCardType,
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
  } = addCard;

  const {
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
    canManageAdministration,
    canManageNotifications,
    notificationConfig,
    notificationConfigLoading,
    notificationConfigSaving,
    notificationConfigMessage,
    onSaveNotificationConfig,
    onLogout,
    userAdminApi,
  } = cardConfig;

  // ── Edit modal props (computed here, not passed from App) ──────────────
  const resolveCarSettings = (_cardId, settings = {}) => settings;
  const editSettingsKey = showEditCardModal
    ? (editCardSettingsKey || getCardSettingsKey(showEditCardModal))
    : null;
  const editModalProps = useMemo(() => {
    if (!showEditCardModal) return {};
    const rawEditSettings = editSettingsKey
      ? (cardSettings[editSettingsKey] || cardSettings[showEditCardModal] || {})
      : {};
    const editId = showEditCardModal;
    const editEntity = editId ? entities[editId] : null;
    const isEditLight = !!editId && (editId.startsWith('light_') || editId.startsWith('light.'));
    const isEditCalendar = !!editId && editId.startsWith('calendar_card_');
    const isEditCalendarBooking = !!editId && editId.startsWith('calendar_booking_card_');
    const isEditTodo = !!editId && editId.startsWith('todo_card_');
    const isEditCost = !!editId && editId.startsWith('cost_card_');
    const isEditAndroidTV = !!editId && editId.startsWith('androidtv_card_');
    const isEditVacuum = !!editId && editId.startsWith('vacuum.');
    const isEditAutomation = !!editId && editId.startsWith('automation.');
    const isEditCar = !!editId && (editId === 'car' || editId.startsWith('car_card_'));
    const isEditRoom = !!editId && editId.startsWith('room_card_');
    const isEditSauna = !!editId && editId.startsWith('sauna_card_');
    const isEditSaunaBookingTemp = !!editId && editId.startsWith('sauna_booking_temp_card_');
    const isEditPopupLauncher = !!editId && editId.startsWith('popup_launcher_card_');
    const isEditDivider = !!editId && editId.startsWith('divider_card_');
    const isEditEmpty = !!editId && editId.startsWith('empty_card_');
    const isEditCover = !!editId && editId.startsWith('cover_card_');
    const editSettings = isEditCar ? resolveCarSettings(editId, rawEditSettings) : rawEditSettings;
    const isEditGenericType = (!!editSettings?.type && (editSettings.type === 'entity' || editSettings.type === 'toggle' || editSettings.type === 'sensor' || editSettings.type === 'divider' || editSettings.type === 'empty' || editSettings.type === 'calendar_booking' || editSettings.type === 'popup_launcher' || editSettings.type === 'notification_timeline')) || isEditVacuum || isEditAutomation || isEditCar || isEditAndroidTV || isEditRoom || isEditSauna || isEditSaunaBookingTemp || isEditPopupLauncher || isEditDivider || isEditEmpty || isEditCalendarBooking;
    const isEditSensor = !!editSettings?.type && editSettings.type === 'sensor';
    const isEditWeatherTemp = !!editId && editId.startsWith('weather_temp_');
    const canEditName = !!editId && !isEditWeatherTemp && !isEditDivider && !isEditEmpty && editId !== 'media_player' && editId !== 'sonos';
    const canEditIcon = !!editId && (
      isEditLight || isEditCalendar || isEditCalendarBooking || isEditTodo || isEditRoom || isEditSauna || isEditSaunaBookingTemp || isEditCover || isEditDivider
      || editId.startsWith('automation.') || editId.startsWith('vacuum.')
      || editId.startsWith('climate_card_') || editId.startsWith('cost_card_')
      || editId.startsWith('fan_card_') || editId.startsWith('door_card_') || editId.startsWith('motion_card_')
      || editId.startsWith('lock_card_') || editId.startsWith('switch_card_') || editId.startsWith('number_card_')
      || editId.startsWith('camera_card_') || editId.startsWith('alarm_card_') || editId.startsWith('timer_card_')
      || editId.startsWith('select_card_') || editId.startsWith('button_card_') || editId.startsWith('script_card_')
      || !!editEntity || editId === 'car' || editId.startsWith('car_card_')
    );
    const canEditStatus = !!editEntity && !!editSettingsKey && editSettingsKey.startsWith('settings::');
    return {
      canEditName, canEditIcon, canEditStatus,
      isEditLight, isEditCalendar, isEditCalendarBooking, isEditTodo, isEditCost, isEditGenericType,
      isEditAndroidTV, isEditCar, isEditRoom, isEditSauna, isEditSaunaBookingTemp, isEditPopupLauncher, isEditDivider, isEditEmpty, isEditSensor, isEditWeatherTemp,
      editSettingsKey, editSettings,
    };
  }, [showEditCardModal, editSettingsKey, cardSettings, entities]);

  const onboardingSteps = buildOnboardingSteps(t);

  return (
    <>
      {/* ── Config / Onboarding ─────────────────────────────────────────── */}
      {(showConfigModal || showOnboarding) && (
        <ModalSuspense>
          <ConfigModal
            open={showConfigModal || showOnboarding}
            isOnboardingActive={isOnboardingActive}
            t={t}
            configTab={configTab}
            setConfigTab={setConfigTab}
            onboardingSteps={onboardingSteps}
            onboardingStep={onboardingStep}
            setOnboardingStep={setOnboardingStep}
            canAdvanceOnboarding={canAdvanceOnboarding}
            connected={connected}
            activeUrl={activeUrl}
            config={config}
            setConfig={setConfig}
            onboardingUrlError={onboardingUrlError}
            setOnboardingUrlError={setOnboardingUrlError}
            onboardingTokenError={onboardingTokenError}
            setOnboardingTokenError={setOnboardingTokenError}
            setConnectionTestResult={setConnectionTestResult}
            connectionTestResult={connectionTestResult}
            validateUrl={validateUrl}
            testConnection={testConnection}
            testingConnection={testingConnection}
            startOAuthLogin={startOAuthLogin}
            handleOAuthLogout={handleOAuthLogout}
            themes={themes}
            currentTheme={currentTheme}
            setCurrentTheme={setCurrentTheme}
            language={language}
            setLanguage={setLanguage}
            inactivityTimeout={inactivityTimeout}
            setInactivityTimeout={setInactivityTimeout}
            gridGapH={gridGapH}
            setGridGapH={setGridGapH}
            gridGapV={gridGapV}
            setGridGapV={setGridGapV}
            gridColumns={gridColumns}
            setGridColumns={setGridColumns}
            cardBorderRadius={cardBorderRadius}
            setCardBorderRadius={setCardBorderRadius}
            bgMode={bgMode}
            setBgMode={setBgMode}
            bgColor={bgColor}
            setBgColor={setBgColor}
            bgGradient={bgGradient}
            setBgGradient={setBgGradient}
            bgImage={bgImage}
            setBgImage={setBgImage}
            cardTransparency={cardTransparency}
            setCardTransparency={setCardTransparency}
            cardBorderOpacity={cardBorderOpacity}
            setCardBorderOpacity={setCardBorderOpacity}
            sectionSpacing={sectionSpacing}
            updateSectionSpacing={updateSectionSpacing}
            entities={entities}
            getEntityImageUrl={getEntityImageUrl}
            callService={callService}
            globalDashboardProfiles={globalDashboardProfiles}
            globalStorageBusy={globalStorageBusy}
            globalStorageError={globalStorageError}
            refreshGlobalDashboards={refreshGlobalDashboards}
            saveGlobalDashboard={saveGlobalDashboard}
            loadGlobalDashboard={loadGlobalDashboard}
            currentUser={currentUser}
            canEditDashboard={canEditDashboard}
            canManageAdministration={canManageAdministration}
            canManageNotifications={canManageNotifications}
            notificationConfig={notificationConfig}
            notificationConfigLoading={notificationConfigLoading}
            notificationConfigSaving={notificationConfigSaving}
            notificationConfigMessage={notificationConfigMessage}
            onSaveNotificationConfig={onSaveNotificationConfig}
            onLogout={onLogout}
            userAdminApi={userAdminApi}
            onClose={() => setShowConfigModal(false)}
            onFinishOnboarding={() => { setShowOnboarding(false); setShowConfigModal(false); }}
          />
        </ModalSuspense>
      )}

      {/* ── Sidebars ────────────────────────────────────────────────────── */}
      <ModalSuspense>
        <ThemeSidebar
          open={showThemeSidebar}
          onClose={() => setShowThemeSidebar(false)}
          onSwitchToLayout={() => { setShowThemeSidebar(false); setShowLayoutSidebar(true); }}
          onSwitchToHeader={() => { setShowThemeSidebar(false); setShowHeaderEditModal(true); }}
          canAccessHeader={canAccessHeaderSettings}
          t={t}
          themes={themes}
          currentTheme={currentTheme}
          setCurrentTheme={setCurrentTheme}
          language={language}
          setLanguage={setLanguage}
          bgMode={bgMode}
          setBgMode={setBgMode}
          bgColor={bgColor}
          setBgColor={setBgColor}
          bgGradient={bgGradient}
          setBgGradient={setBgGradient}
          bgImage={bgImage}
          setBgImage={setBgImage}
          inactivityTimeout={inactivityTimeout}
          setInactivityTimeout={setInactivityTimeout}
        />
      </ModalSuspense>

      <ModalSuspense>
        <LayoutSidebar
          open={showLayoutSidebar}
          onClose={() => setShowLayoutSidebar(false)}
          onSwitchToTheme={() => { setShowLayoutSidebar(false); setShowThemeSidebar(true); }}
          onSwitchToHeader={() => { setShowLayoutSidebar(false); setShowHeaderEditModal(true); }}
          canAccessHeader={canAccessHeaderSettings}
          t={t}
          gridGapH={gridGapH}
          setGridGapH={setGridGapH}
          gridGapV={gridGapV}
          setGridGapV={setGridGapV}
          gridColumns={gridColumns}
          setGridColumns={setGridColumns}
          cardBorderRadius={cardBorderRadius}
          setCardBorderRadius={setCardBorderRadius}
          cardTransparency={cardTransparency}
          setCardTransparency={setCardTransparency}
          cardBorderOpacity={cardBorderOpacity}
          setCardBorderOpacity={setCardBorderOpacity}
          sectionSpacing={sectionSpacing}
          updateSectionSpacing={updateSectionSpacing}
        />
      </ModalSuspense>

      <ModalSuspense>
        <HeaderSidebar
          open={showHeaderEditModal}
          onClose={() => setShowHeaderEditModal(false)}
          headerTitle={headerTitle}
          headerScale={headerScale}
          headerSettings={headerSettings}
          updateHeaderScale={updateHeaderScale}
          updateHeaderSettings={updateHeaderSettings}
          onSaveLogos={saveHeaderLogos}
          canEditGlobalBranding={canEditGlobalBranding}
          canEditClientSubtitle={canEditClientSubtitle}
          onSwitchToTheme={() => { setShowHeaderEditModal(false); setShowThemeSidebar(true); }}
          onSwitchToLayout={() => { setShowHeaderEditModal(false); setShowLayoutSidebar(true); }}
          t={t}
        />
      </ModalSuspense>

      {/* ── Card-specific modals ────────────────────────────────────────── */}
      {showNordpoolModal && (() => {
        const data = prepareNordpoolData(showNordpoolModal, { getCardSettingsKey, cardSettings, entities, customNames });
        if (!data) return null;
        return (
          <ModalSuspense>
            <NordpoolModal
              show={true}
              onClose={() => setShowNordpoolModal(null)}
              entity={data.entity}
              fullPriceData={data.fullPriceData}
              currentPriceIndex={data.currentPriceIndex}
              priceStats={data.priceStats}
              name={data.name}
              t={t}
              language={language}
              saveCardSetting={saveCardSetting}
              cardId={showNordpoolModal}
              settings={data.settings}
            />
          </ModalSuspense>
        );
      })()}

      {showCostModal && (() => {
        const settingsKey = getCardSettingsKey(showCostModal);
        const settings = cardSettings[settingsKey] || cardSettings[showCostModal] || {};
        const name = customNames?.[showCostModal] || t('energyCost.title');
        const iconName = customIcons?.[showCostModal] || null;
        return (
          <ModalSuspense>
            <CostModal
              show={true}
              onClose={() => setShowCostModal(null)}
              conn={conn}
              entities={entities}
              todayEntityId={settings.todayId}
              monthEntityId={settings.monthId}
              name={name}
              iconName={iconName}
              t={t}
            />
          </ModalSuspense>
        );
      })()}

      {activeClimateEntityModal && entities[activeClimateEntityModal] && (
        <ModalSuspense>
          <GenericClimateModal
            entityId={activeClimateEntityModal}
            entity={entities[activeClimateEntityModal]}
            onClose={() => setActiveClimateEntityModal(null)}
            onShowHistory={(entityId) => {
              setActiveClimateEntityModal(null);
              setShowSensorInfoModal(entityId);
            }}
            callService={callService}
            hvacMap={hvacMap}
            fanMap={fanMap}
            swingMap={swingMap}
            t={t}
          />
        </ModalSuspense>
      )}

      {showLightModal && (
        <ModalSuspense>
          {(() => {
            const lightPayload = (typeof showLightModal === 'string')
              ? { lightId: showLightModal, lightIds: [showLightModal] }
              : (showLightModal || {});
            const activeLightId = lightPayload.lightId || lightPayload.entityId || null;
            const activeLightIds = Array.isArray(lightPayload.lightIds) ? lightPayload.lightIds : (activeLightId ? [activeLightId] : []);
            if (!activeLightId) return null;
            return (
          <LightModal
            show={!!showLightModal}
            onClose={() => setShowLightModal(null)}
            onShowHistory={(entityId) => {
              setShowLightModal(null);
              setShowSensorInfoModal(entityId);
            }}
            lightId={activeLightId}
            lightIds={activeLightIds}
            entities={entities}
            callService={callService}
            getA={getA}
            optimisticLightBrightness={optimisticLightBrightness}
            setOptimisticLightBrightness={setOptimisticLightBrightness}
            customIcons={customIcons}
            t={t}
          />
            );
          })()}
        </ModalSuspense>
      )}

      {showAndroidTVModal && (() => {
        const settings = cardSettings[getCardSettingsKey(showAndroidTVModal)] || {};
        return (
          <ModalSuspense>
            <GenericAndroidTVModal
              show={true}
              onClose={() => setShowAndroidTVModal(null)}
              entities={entities}
              mediaPlayerId={settings.mediaPlayerId}
              remoteId={settings.remoteId}
              linkedMediaPlayers={settings.linkedMediaPlayers}
              callService={callService}
              getA={getA}
              getEntityImageUrl={getEntityImageUrl}
              customNames={customNames}
              t={t}
            />
          </ModalSuspense>
        );
      })()}

      {showVacuumModal && (
        <ModalSuspense>
          <VacuumModal
            show={showVacuumModal}
            onClose={() => { setShowVacuumModal(false); setActiveVacuumId(null); }}
            entities={entities}
            callService={callService}
            getA={getA}
            t={t}
            vacuumId={activeVacuumId}
          />
        </ModalSuspense>
      )}

      {activeCarModal && (() => {
        const settingsKey = getCardSettingsKey(activeCarModal);
        const settings = resolveCarSettings(activeCarModal, cardSettings[settingsKey] || cardSettings[activeCarModal] || {});
        const name = customNames[activeCarModal] || t('car.defaultName');
        return (
          <ModalSuspense>
            <LeafModal
              show={true}
              onClose={() => setActiveCarModal(null)}
              entities={entities}
              callService={callService}
              getS={getS}
              getA={getA}
              t={t}
              car={{ name, ...settings }}
            />
          </ModalSuspense>
        );
      })()}

      {showWeatherModal && (() => {
        const settingsKey = getCardSettingsKey(showWeatherModal);
        const settings = cardSettings[settingsKey] || cardSettings[showWeatherModal] || {};
        const weatherEntity = settings.weatherId ? entities[settings.weatherId] : null;
        const tempEntity = settings.tempId ? entities[settings.tempId] : null;
        if (!weatherEntity) return null;
        return (
          <ModalSuspense>
            <WeatherModal
              show={true}
              onClose={() => setShowWeatherModal(null)}
              conn={conn}
              weatherEntity={weatherEntity}
              tempEntity={tempEntity}
              t={t}
            />
          </ModalSuspense>
        );
      })()}

      {showCalendarModal && (
        <ModalSuspense>
          <CalendarModal
            show={showCalendarModal}
            onClose={() => setShowCalendarModal(false)}
            conn={conn}
            entities={entities}
            t={t}
          />
        </ModalSuspense>
      )}

      {showTodoModal && (() => {
        const todoSettingsKey = getCardSettingsKey(showTodoModal);
        const todoSettings = cardSettings[todoSettingsKey] || cardSettings[showTodoModal] || {};
        return (
          <ModalSuspense>
            <TodoModal
              show={true}
              onClose={() => setShowTodoModal(null)}
              conn={conn}
              entities={entities}
              settings={todoSettings}
              t={t}
            />
          </ModalSuspense>
        );
      })()}

      {showRoomModal && (() => {
        const roomSettingsKey = getCardSettingsKey(showRoomModal);
        const roomSettings = cardSettings[roomSettingsKey] || cardSettings[showRoomModal] || {};
        return (
          <ModalSuspense>
            <RoomModal
              show={true}
              onClose={() => setShowRoomModal(null)}
              settings={roomSettings}
              entities={entities}
              conn={conn}
              callService={(domain, service, data) => callService(domain, service, data)}
              t={t}
            />
          </ModalSuspense>
        );
      })()}

      {showCoverModal && (() => {
        const coverSettingsKey = getCardSettingsKey(showCoverModal);
        const coverSettings = cardSettings[coverSettingsKey] || cardSettings[showCoverModal] || {};
        const coverEntityId = coverSettings.coverId;
        const coverEntity = coverEntityId ? entities[coverEntityId] : null;
        if (!coverEntityId || !coverEntity) return null;
        return (
          <ModalSuspense>
            <CoverModal
              show={true}
              onClose={() => setShowCoverModal(null)}
              entityId={coverEntityId}
              entity={coverEntity}
              callService={callService}
              customIcons={customIcons}
              t={t}
            />
          </ModalSuspense>
        );
      })()}

      {activeSaunaFieldModal && (
        <ModalSuspense>
          <SaunaFieldModal
            show={!!activeSaunaFieldModal}
            title={activeSaunaFieldModal.title}
            fieldType={activeSaunaFieldModal.fieldType}
            numberMode={activeSaunaFieldModal.numberMode}
            numberMaxDigits={activeSaunaFieldModal.numberMaxDigits}
            entityIds={activeSaunaFieldModal.entityIds}
            entities={entities}
            callService={callService}
            onClose={() => setActiveSaunaFieldModal(null)}
            t={t}
            setShowLightModal={setShowLightModal}
            setActiveClimateEntityModal={setActiveClimateEntityModal}
            setShowSensorInfoModal={setShowSensorInfoModal}
            hvacMap={hvacMap}
            fanMap={fanMap}
            swingMap={swingMap}
          />
        </ModalSuspense>
      )}

      {showSaunaDebugModal && (
        <ModalSuspense>
          <SaunaDebugModal
            show={!!showSaunaDebugModal}
            payload={typeof showSaunaDebugModal === 'object' ? showSaunaDebugModal : {}}
            entities={entities}
            conn={conn}
            onClose={() => setShowSaunaDebugModal(null)}
            t={t}
          />
        </ModalSuspense>
      )}

      {showPopupCardModal && (() => {
        const payload = typeof showPopupCardModal === 'string'
          ? { targetCardId: showPopupCardModal }
          : (showPopupCardModal || {});
        const targetCardId = String(payload.targetCardId || '').trim();
        const sourceCardId = String(payload.sourceCardId || '').trim();
        if (!targetCardId || targetCardId === sourceCardId) return null;

        const pageCandidates = [];
        const explicitPageId = String(payload.targetPageId || '').trim();
        if (explicitPageId) pageCandidates.push(explicitPageId);
        if (activePage && !pageCandidates.includes(activePage)) pageCandidates.push(activePage);

        const configuredPages = Array.isArray(pagesConfig?.pages) ? pagesConfig.pages : [];
        configuredPages.forEach((pageId) => {
          const pageCards = Array.isArray(pagesConfig?.[pageId]) ? pagesConfig[pageId] : [];
          if (pageCards.includes(targetCardId) && !pageCandidates.includes(pageId)) {
            pageCandidates.push(pageId);
          }
        });

        const resolvedTargetPage = pageCandidates[0] || activePage || 'home';
        const targetSettingsKey = getCardSettingsKey(targetCardId, resolvedTargetPage);
        const popupIsMobile = typeof window !== 'undefined'
          && typeof window.matchMedia === 'function'
          && window.matchMedia('(max-width: 767px)').matches;

        const popupCtx = {
          entities,
          editMode: false,
          conn,
          cardSettings,
          customNames,
          customIcons,
          getA,
          getS,
          getEntityImageUrl,
          callService,
          isMediaActive,
          saveCardSetting,
          language,
          isMobile: popupIsMobile,
          activePage: resolvedTargetPage,
          t,
          optimisticLightBrightness,
          setOptimisticLightBrightness,
          tempHistoryById,
          isCardHiddenByLogic: () => false,
          setShowLightModal: (value) => {
            setShowPopupCardModal(null);
            setShowLightModal(value);
          },
          setShowSensorInfoModal: (value) => {
            setShowPopupCardModal(null);
            setShowSensorInfoModal(value);
          },
          setActiveClimateEntityModal: (value) => {
            setShowPopupCardModal(null);
            setActiveClimateEntityModal(value);
          },
          setShowCostModal: (value) => {
            setShowPopupCardModal(null);
            setShowCostModal(value);
          },
          setActiveVacuumId: (value) => {
            setShowPopupCardModal(null);
            setActiveVacuumId(value);
          },
          setShowVacuumModal: (value) => {
            setShowPopupCardModal(null);
            setShowVacuumModal(value);
          },
          setShowAndroidTVModal: (value) => {
            setShowPopupCardModal(null);
            setShowAndroidTVModal(value);
          },
          setActiveCarModal: (value) => {
            setShowPopupCardModal(null);
            setActiveCarModal(value);
          },
          setShowWeatherModal: (value) => {
            setShowPopupCardModal(null);
            setShowWeatherModal(value);
          },
          setShowNordpoolModal: (value) => {
            setShowPopupCardModal(null);
            setShowNordpoolModal(value);
          },
          setShowCalendarModal: (value) => {
            setShowPopupCardModal(null);
            setShowCalendarModal(value);
          },
          setShowTodoModal: (value) => {
            setShowPopupCardModal(null);
            setShowTodoModal(value);
          },
          setShowRoomModal: (value) => {
            setShowPopupCardModal(null);
            setShowRoomModal(value);
          },
          setShowCoverModal: (value) => {
            setShowPopupCardModal(null);
            setShowCoverModal(value);
          },
          setShowEditCardModal: (value) => {
            setShowPopupCardModal(null);
            setShowEditCardModal(value);
          },
          setEditCardSettingsKey: (value) => {
            setShowPopupCardModal(null);
            setEditCardSettingsKey(value);
          },
          setActiveSaunaFieldModal: (value) => {
            setShowPopupCardModal(null);
            setActiveSaunaFieldModal(value);
          },
          setShowSaunaDebugModal: (value) => {
            setShowPopupCardModal(null);
            setShowSaunaDebugModal(value);
          },
          setShowPopupCardModal,
          openMediaModal: (mpId, groupKey, groupIds) => {
            setShowPopupCardModal(null);
            setActiveMediaId(mpId);
            setActiveMediaGroupKey(groupKey);
            setActiveMediaGroupIds(groupIds);
            setActiveMediaModal('media');
          },
        };

        const popupCard = dispatchCardRender(
          targetCardId,
          {},
          () => null,
          {},
          targetSettingsKey,
          popupCtx,
        );
        const popupTitle = String(payload.buttonLabel || '').trim()
          || customNames?.[targetCardId]
          || entities?.[targetCardId]?.attributes?.friendly_name
          || targetCardId;
        const isSaunaPopupCard = targetCardId.startsWith('sauna_card_');
        const isMobileSaunaPopup = popupIsMobile && isSaunaPopupCard;
        const popupOverlayClass = `fixed inset-0 z-[140] flex justify-center popup-card-backdrop-enter ${
          isMobileSaunaPopup
            ? 'items-start'
            : 'items-center p-3 sm:p-6'
        }`;
        const popupOverlayStyle = {
          backdropFilter: 'blur(16px)',
          backgroundColor: 'rgba(0, 0, 0, 0.45)',
          paddingTop: popupIsMobile ? 'calc(env(safe-area-inset-top, 0px) + 32px)' : undefined,
          paddingBottom: popupIsMobile ? 'calc(env(safe-area-inset-bottom, 0px) + 4px)' : undefined,
        };
        const popupPanelStyle = {
          background: 'linear-gradient(135deg, var(--card-bg) 0%, var(--modal-bg) 100%)',
          borderColor: 'var(--glass-border)',
          width: isMobileSaunaPopup ? 'calc(100vw - 2px)' : undefined,
          maxWidth: isMobileSaunaPopup ? 'none' : undefined,
          maxHeight: isMobileSaunaPopup
            ? 'calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 24px)'
            : undefined,
        };

        return (
          <div
            className={popupOverlayClass}
            style={popupOverlayStyle}
            onClick={() => setShowPopupCardModal(null)}
            data-disable-pull-refresh="true"
          >
            <div
              className={`w-full rounded-3xl border overflow-hidden flex flex-col popup-card-panel-enter ${
                isSaunaPopupCard
                  ? `${isMobileSaunaPopup ? 'p-1' : 'max-w-6xl max-h-[95dvh] p-2 sm:p-3'}`
                  : 'max-w-6xl max-h-[92vh] p-3 sm:p-4'
              }`}
              style={popupPanelStyle}
              onClick={(event) => event.stopPropagation()}
              data-disable-pull-refresh="true"
            >
              <div className={`flex items-center justify-between gap-3 mb-3 px-1 ${popupIsMobile ? 'pt-1' : ''}`}>
                <p className="text-[11px] uppercase tracking-[0.24em] font-bold text-[var(--text-secondary)] truncate">
                  {popupTitle}
                </p>
                <button
                  type="button"
                  onClick={() => setShowPopupCardModal(null)}
                  className={`rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors ${
                    popupIsMobile ? 'w-12 h-12 text-xl' : 'w-10 h-10 text-lg'
                  }`}
                  aria-label={t('common.close') || 'Close'}
                >
                  ×
                </button>
              </div>

              <PopupCardFitFrame
                fitToViewport={isSaunaPopupCard}
                isMobile={isMobileSaunaPopup}
                liftPx={0}
                viewportHeightOffsetPx={isMobileSaunaPopup ? 62 : 68}
                scaleFloor={isMobileSaunaPopup ? 0.52 : 0.45}
              >
                {popupCard || (
                  <div className="rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-5 text-sm text-[var(--text-secondary)]">
                    {t('popupLauncher.targetUnavailable') || 'Target card is unavailable.'}
                  </div>
                )}
              </PopupCardFitFrame>
            </div>
          </div>
        );
      })()}

      {/* ── Edit / Add modals ───────────────────────────────────────────── */}
      {showAddCardModal && (
        <ModalSuspense>
          <AddCardContent
            onClose={() => setShowAddCardModal(false)}
            addCardTargetPage={addCardTargetPage}
            addCardType={addCardType}
            setAddCardType={setAddCardType}
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            entities={entities}
            pagesConfig={pagesConfig}
            selectedEntities={selectedEntities}
            setSelectedEntities={setSelectedEntities}
            selectedWeatherId={selectedWeatherId}
            setSelectedWeatherId={setSelectedWeatherId}
            selectedTempId={selectedTempId}
            setSelectedTempId={setSelectedTempId}
            selectedAndroidTVMediaId={selectedAndroidTVMediaId}
            setSelectedAndroidTVMediaId={setSelectedAndroidTVMediaId}
            selectedAndroidTVRemoteId={selectedAndroidTVRemoteId}
            setSelectedAndroidTVRemoteId={setSelectedAndroidTVRemoteId}
            selectedCostTodayId={selectedCostTodayId}
            setSelectedCostTodayId={setSelectedCostTodayId}
            selectedCostMonthId={selectedCostMonthId}
            setSelectedCostMonthId={setSelectedCostMonthId}
            costSelectionTarget={costSelectionTarget}
            setCostSelectionTarget={setCostSelectionTarget}
            selectedNordpoolId={selectedNordpoolId}
            setSelectedNordpoolId={setSelectedNordpoolId}
            nordpoolDecimals={nordpoolDecimals}
            setNordpoolDecimals={setNordpoolDecimals}
            onAddSelected={onAddSelected}
            onAddRoom={(area, areaEntityIds) => {
              const cardId = `room_card_${Date.now()}`;
              const newConfig = { ...pagesConfig };
              newConfig[addCardTargetPage] = [...(newConfig[addCardTargetPage] || []), cardId];
              persistConfig(newConfig);
              const settingsKey = getCardSettingsKey(cardId, addCardTargetPage);
              const newSettings = {
                ...cardSettings,
                [settingsKey]: {
                  areaId: area.area_id,
                  areaName: area.name || area.area_id,
                  entityIds: areaEntityIds,
                  showLights: true,
                  showTemp: true,
                  showMotion: true,
                  showHumidity: false,
                  showClimate: false,
                  size: 'large',
                }
              };
              persistCardSettings(newSettings);
              saveCustomName(cardId, area.name || area.area_id);
              setShowAddCardModal(false);
              setShowEditCardModal(cardId);
              setEditCardSettingsKey(settingsKey);
            }}
            conn={conn}
            getAddCardAvailableLabel={getAddCardAvailableLabel}
            getAddCardNoneLeftLabel={getAddCardNoneLeftLabel}
            t={t}
          />
        </ModalSuspense>
      )}

      {editingPage && (
        <ModalSuspense>
          <EditPageModal
            isOpen={!!editingPage}
            onClose={() => setEditingPage(null)}
            t={t}
            editingPage={editingPage}
            pageSettings={pageSettings}
            savePageSetting={savePageSetting}
            pageDefaults={pageDefaults}
            onDelete={deletePage}
          />
        </ModalSuspense>
      )}

      {showAddPageModal && (
        <ModalSuspense>
          <AddPageModal
            isOpen={showAddPageModal}
            onClose={() => setShowAddPageModal(false)}
            t={t}
            newPageLabel={newPageLabel}
            setNewPageLabel={setNewPageLabel}
            newPageIcon={newPageIcon}
            setNewPageIcon={setNewPageIcon}
            onCreate={createPage}
            onCreateMedia={createMediaPage}
          />
        </ModalSuspense>
      )}

      {showEditCardModal && (
        <ModalSuspense>
          <EditCardModal
            isOpen={!!showEditCardModal}
            onClose={() => { setShowEditCardModal(null); setEditCardSettingsKey(null); }}
            t={t}
            entityId={showEditCardModal}
            entities={entities}
            conn={conn}
            customNames={customNames}
            saveCustomName={saveCustomName}
            customIcons={customIcons}
            saveCustomIcon={saveCustomIcon}
            saveCardSetting={saveCardSetting}
            gridColumns={gridColumns}
            pagesConfig={pagesConfig}
            hiddenCards={hiddenCards}
            toggleCardVisibility={toggleCardVisibility}
            {...editModalProps}
          />
        </ModalSuspense>
      )}

      {showSensorInfoModal && (
        (() => {
          const sensorPayload = typeof showSensorInfoModal === 'string'
            ? { entityId: showSensorInfoModal }
            : (showSensorInfoModal || {});
          const sensorEntityId = sensorPayload?.entityId;
          if (!sensorEntityId) return null;
          return (
        <ModalSuspense>
          <SensorModal
            isOpen={!!showSensorInfoModal}
            onClose={() => setShowSensorInfoModal(null)}
            entityId={sensorEntityId}
            entity={entities[sensorEntityId]}
            customName={sensorPayload.customName || customNames[sensorEntityId]}
            overlayEntities={Array.isArray(sensorPayload.overlayEntities) ? sensorPayload.overlayEntities : []}
            conn={conn}
            haUrl={activeUrl}
            haToken={config.authMethod === 'oauth' ? (authRef?.current?.accessToken || '') : config.token}
            t={t}
          />
        </ModalSuspense>
          );
        })()
      )}

      {showPersonModal && (
        <ModalSuspense>
          <PersonModal
            show={!!showPersonModal}
            onClose={() => setShowPersonModal(null)}
            personId={showPersonModal}
            entity={showPersonModal ? entities[showPersonModal] : null}
            entities={entities}
            customName={showPersonModal ? customNames[showPersonModal] : null}
            getEntityImageUrl={getEntityImageUrl}
            conn={conn}
            t={t}
            settings={showPersonModal ? (cardSettings[getCardSettingsKey(showPersonModal, 'header')] || cardSettings[showPersonModal] || {}) : {}}
          />
        </ModalSuspense>
      )}

      {/* ── Media modal ─────────────────────────────────────────────────── */}
      {activeMediaModal && (
        <ModalSuspense>
          <MediaModal
            show={!!activeMediaModal}
            onClose={() => {
              setActiveMediaModal(null);
              setActiveMediaGroupKey(null);
              setActiveMediaGroupIds(null);
              setActiveMediaSessionSensorIds(null);
            }}
            activeMediaModal={activeMediaModal}
            activeMediaGroupKey={activeMediaGroupKey}
            activeMediaGroupIds={activeMediaGroupIds}
            activeMediaSessionSensorIds={activeMediaSessionSensorIds}
            activeMediaId={activeMediaId}
            setActiveMediaId={setActiveMediaId}
            entities={entities}
            cardSettings={cardSettings}
            customNames={customNames}
            mediaTick={mediaTick}
            callService={callService}
            getA={getA}
            getEntityImageUrl={getEntityImageUrl}
            isMediaActive={isMediaActive}
            isSonosActive={isSonosActive}
            t={t}
            formatDuration={formatDuration}
            getServerInfo={getServerInfo}
          />
        </ModalSuspense>
      )}

      {showStatusPillsConfig && (
        <ModalSuspense>
          <StatusPillsConfigModal
            show={showStatusPillsConfig}
            onClose={() => setShowStatusPillsConfig(false)}
            statusPillsConfig={statusPillsConfig}
            onSave={saveStatusPillsConfig}
            entities={entities}
            t={t}
          />
        </ModalSuspense>
      )}
    </>
  );
}
