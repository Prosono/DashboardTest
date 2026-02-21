/**
 * Handles adding selected entities/cards to the dashboard configuration.
 * Extracted from App.jsx to keep the main component lean.
 *
 * @param {Object} ctx - Context object with all required state & setters
 */
export const handleAddSelected = (ctx) => {
  const {
    pagesConfig,
    persistConfig,
    addCardTargetPage,
    addCardType,
    selectedEntities,
    selectedWeatherId,
    selectedTempId,
    selectedAndroidTVMediaId,
    selectedAndroidTVRemoteId,
    selectedCostTodayId,
    selectedCostMonthId,
    selectedNordpoolId,
    nordpoolDecimals,
    cardSettings,
    persistCardSettings,
    getCardSettingsKey,
    setSelectedEntities,
    setShowAddCardModal,
    setSelectedWeatherId,
    setSelectedTempId,
    setSelectedAndroidTVMediaId,
    setSelectedAndroidTVRemoteId,
    setSelectedCostTodayId,
    setSelectedCostMonthId,
    setCostSelectionTarget,
    setSelectedNordpoolId,
    setNordpoolDecimals,
    setShowEditCardModal,
    setEditCardSettingsKey,
  } = ctx;

  const newConfig = { ...pagesConfig };

  // -- Helpers ---------------------------------------------------------------

  /** Append card(s) to page, persist config, and close the add-card modal. */
  const commitCards = (cardIds) => {
    newConfig[addCardTargetPage] = [...(newConfig[addCardTargetPage] || []), ...cardIds];
    persistConfig(newConfig);
    setShowAddCardModal(false);
  };

  /** Save card settings for a single card and commit it to the page. */
  const commitSingleCard = (cardId, settingsPayload, { openEdit = false } = {}) => {
    const settingsKey = getCardSettingsKey(cardId, addCardTargetPage);
    const newSettings = {
      ...cardSettings,
      [settingsKey]: { ...(cardSettings[settingsKey] || {}), ...settingsPayload },
    };
    persistCardSettings(newSettings);
    commitCards([cardId]);
    if (openEdit) {
      setShowEditCardModal(cardId);
      setEditCardSettingsKey(settingsKey);
    }
  };

  // -- Header (special case: plain entities) ---------------------------------

  if (addCardTargetPage === 'header') {
    newConfig.header = [...(newConfig.header || []), ...selectedEntities];
    persistConfig(newConfig);
    setSelectedEntities([]);
    setShowAddCardModal(false);
    return;
  }

  // -- Card-type handlers ----------------------------------------------------

  switch (addCardType) {
    case 'weather': {
      if (!selectedWeatherId) return;
      const cardId = `weather_temp_${Date.now()}`;
      commitSingleCard(cardId, { weatherId: selectedWeatherId, tempId: selectedTempId || null });
      setSelectedWeatherId(null);
      setSelectedTempId(null);
      return;
    }

    case 'calendar': {
      const cardId = selectedEntities.length === 1 && selectedEntities[0].startsWith('calendar_card_')
        ? selectedEntities[0]
        : `calendar_card_${Date.now()}`;
      commitCards([cardId]);
      return;
    }

    case 'todo': {
      const cardId = `todo_card_${Date.now()}`;
      commitSingleCard(cardId, { size: 'large' }, { openEdit: true });
      return;
    }

    case 'media': {
      if (selectedEntities.length === 0) return;
      const cardId = `media_group_${Date.now()}`;
      commitSingleCard(cardId, { mediaIds: selectedEntities });
      setSelectedEntities([]);
      return;
    }

    case 'climate': {
      if (selectedEntities.length === 0) return;
      const newSettings = { ...cardSettings };
      const newCardIds = selectedEntities.map((entityId) => {
        const cardId = `climate_card_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const settingsKey = getCardSettingsKey(cardId, addCardTargetPage);
        newSettings[settingsKey] = { ...(newSettings[settingsKey] || {}), climateId: entityId };
        return cardId;
      });
      persistCardSettings(newSettings);
      commitCards(newCardIds);
      setSelectedEntities([]);
      return;
    }

    case 'cover': {
      if (selectedEntities.length === 0) return;
      const newSettings = { ...cardSettings };
      const newCardIds = selectedEntities.map((entityId) => {
        const cardId = `cover_card_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const settingsKey = getCardSettingsKey(cardId, addCardTargetPage);
        newSettings[settingsKey] = { ...(newSettings[settingsKey] || {}), coverId: entityId };
        return cardId;
      });
      persistCardSettings(newSettings);
      commitCards(newCardIds);
      setSelectedEntities([]);
      return;
    }

    case 'androidtv': {
      if (!selectedAndroidTVMediaId) return;
      const cardId = `androidtv_card_${Date.now()}`;
      commitSingleCard(cardId, {
        mediaPlayerId: selectedAndroidTVMediaId,
        remoteId: selectedAndroidTVRemoteId || null,
      });
      setSelectedAndroidTVMediaId(null);
      setSelectedAndroidTVRemoteId(null);
      return;
    }

    case 'cost': {
      if (!selectedCostTodayId || !selectedCostMonthId) return;
      const cardId = `cost_card_${Date.now()}`;
      commitSingleCard(cardId, { todayId: selectedCostTodayId, monthId: selectedCostMonthId });
      setSelectedCostTodayId(null);
      setSelectedCostMonthId(null);
      setCostSelectionTarget('today');
      return;
    }

    case 'nordpool': {
      if (!selectedNordpoolId) return;
      const cardId = `nordpool_card_${Date.now()}`;
      commitSingleCard(cardId, { nordpoolId: selectedNordpoolId, decimals: nordpoolDecimals });
      setSelectedNordpoolId(null);
      setNordpoolDecimals(2);
      return;
    }


    case 'sauna': {
      const cardId = `sauna_card_${Date.now()}`;
      commitSingleCard(cardId, {
        type: 'sauna',
        showFlame: true,
        showThermostat: true,
        showMotion: true,
        showLights: true,
        showLocks: true,
        showDoors: true,
        showFans: true,
        showThermostatOverview: true,
        showActiveCodes: true,
        showTempOverview: true,
        showAutoLock: true,
      }, { openEdit: true });
      return;
    }

    case 'saunaBookingTemp': {
      const cardId = `sauna_booking_temp_card_${Date.now()}`;
      commitSingleCard(cardId, {
        type: 'sauna_booking_temp',
        summaryHours: 24,
        keepDays: 120,
        maxEntries: 500,
        recentRows: 6,
        targetToleranceC: 0,
        activeOnStates: ['on', 'true', '1', 'yes', 'active', 'booked', 'occupied', 'aktiv'],
        serviceOnStates: ['ja', 'yes', 'service', 'on', 'true', '1', 'active', 'aktiv'],
        bookingSnapshots: [],
      }, { openEdit: true });
      return;
    }

    case 'divider': {
      const cardId = `divider_card_${Date.now()}`;
      commitSingleCard(cardId, {
        type: 'divider',
        orientation: 'horizontal',
        showHeader: false,
        header: '',
        gridColSpan: 4,
        gridRowSpan: 1,
      }, { openEdit: true });
      return;
    }

    case 'empty': {
      const cardId = `empty_card_${Date.now()}`;
      commitSingleCard(cardId, {
        type: 'empty',
        gridColSpan: 1,
        gridRowSpan: 1,
      }, { openEdit: true });
      return;
    }

    case 'car': {
      const cardId = `car_card_${Date.now()}`;
      commitSingleCard(cardId, { type: 'car', size: 'large' }, { openEdit: true });
      return;
    }

    case 'fanCard': {
      if (selectedEntities.length === 0) return;
      const cardId = `fan_card_${Date.now()}`;
      commitSingleCard(cardId, { type: 'group_control', fieldType: 'fan', title: 'Vifter', entityIds: selectedEntities });
      setSelectedEntities([]);
      return;
    }

    case 'doorCard': {
      if (selectedEntities.length === 0) return;
      const cardId = `door_card_${Date.now()}`;
      commitSingleCard(cardId, { type: 'group_control', fieldType: 'door', title: 'Dorer', entityIds: selectedEntities });
      setSelectedEntities([]);
      return;
    }

    case 'motionCard': {
      if (selectedEntities.length === 0) return;
      const cardId = `motion_card_${Date.now()}`;
      commitSingleCard(cardId, { type: 'group_control', fieldType: 'motion', title: 'Bevegelse', entityIds: selectedEntities });
      setSelectedEntities([]);
      return;
    }

    case 'lockCard': {
      if (selectedEntities.length === 0) return;
      const cardId = `lock_card_${Date.now()}`;
      commitSingleCard(cardId, { type: 'group_control', fieldType: 'lock', title: 'Laser', entityIds: selectedEntities });
      setSelectedEntities([]);
      return;
    }

    case 'switchCard': {
      if (selectedEntities.length === 0) return;
      const cardId = `switch_card_${Date.now()}`;
      commitSingleCard(cardId, { type: 'group_control', fieldType: 'switch', title: 'Brytere', entityIds: selectedEntities });
      setSelectedEntities([]);
      return;
    }

    case 'numberCard': {
      if (selectedEntities.length === 0) return;
      const cardId = `number_card_${Date.now()}`;
      commitSingleCard(cardId, { type: 'group_control', fieldType: 'number', title: 'Nummer', entityIds: selectedEntities });
      setSelectedEntities([]);
      return;
    }

    case 'cameraCard': {
      if (selectedEntities.length === 0) return;
      const cardId = `camera_card_${Date.now()}`;
      commitSingleCard(cardId, { type: 'group_control', fieldType: 'camera', title: 'Kamera', entityIds: selectedEntities });
      setSelectedEntities([]);
      return;
    }

    case 'alarmCard': {
      if (selectedEntities.length === 0) return;
      const cardId = `alarm_card_${Date.now()}`;
      commitSingleCard(cardId, { type: 'group_control', fieldType: 'alarm', title: 'Alarm', entityIds: selectedEntities });
      setSelectedEntities([]);
      return;
    }

    case 'timerCard': {
      if (selectedEntities.length === 0) return;
      const cardId = `timer_card_${Date.now()}`;
      commitSingleCard(cardId, { type: 'group_control', fieldType: 'timer', title: 'Timer', entityIds: selectedEntities });
      setSelectedEntities([]);
      return;
    }

    case 'selectCard': {
      if (selectedEntities.length === 0) return;
      const cardId = `select_card_${Date.now()}`;
      commitSingleCard(cardId, { type: 'group_control', fieldType: 'select', title: 'Valg', entityIds: selectedEntities });
      setSelectedEntities([]);
      return;
    }

    case 'buttonCard': {
      if (selectedEntities.length === 0) return;
      const cardId = `button_card_${Date.now()}`;
      commitSingleCard(cardId, { type: 'group_control', fieldType: 'button', title: 'Knapper', entityIds: selectedEntities });
      setSelectedEntities([]);
      return;
    }

    case 'scriptCard': {
      if (selectedEntities.length === 0) return;
      const cardId = `script_card_${Date.now()}`;
      commitSingleCard(cardId, { type: 'group_control', fieldType: 'script', title: 'Scener', entityIds: selectedEntities });
      setSelectedEntities([]);
      return;
    }

    // entity / toggle / sensor — default path for plain HA entities
    default: {
      if (addCardType === 'entity' || addCardType === 'toggle' || addCardType === 'sensor') {
        const newSettings = { ...cardSettings };
        selectedEntities.forEach((id) => {
          const settingsKey = getCardSettingsKey(id, addCardTargetPage);
          newSettings[settingsKey] = {
            ...(newSettings[settingsKey] || {}),
            type: addCardType,
            size: newSettings[settingsKey]?.size || 'large',
          };
        });
        persistCardSettings(newSettings);
      }

      commitCards(selectedEntities);
      setSelectedEntities([]);
    }
  }
};
