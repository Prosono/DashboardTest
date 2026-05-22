import React from 'react';
import { ArrowRight, LayoutGrid, Thermometer, User, getIconComponent } from '../../icons';

const clampColumns = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 2;
  return Math.max(1, Math.min(4, Math.round(numeric)));
};

const normalizeButtons = (buttons) => {
  if (!Array.isArray(buttons)) return [];
  return buttons
    .filter(Boolean)
    .map((button, index) => ({
      id: button.id || `btn_${index}`,
      label: String(button.label || '').trim(),
      icon: String(button.icon || '').trim(),
      targetCardId: String(button.targetCardId || '').trim(),
      targetPageId: String(button.targetPageId || '').trim() || null,
    }));
};

const tr = (t, key, fallback) => {
  const value = typeof t === 'function' ? t(key) : '';
  if (!value || value === key) return fallback;
  return value;
};

const norm = (value) => String(value ?? '').trim().toLowerCase();
const isUnavailable = (value) => ['', 'unknown', 'unavailable', 'none', 'null'].includes(norm(value));
const isOn = (value) => ['on', 'true', '1', 'yes', 'ja'].includes(norm(value));
const isOnish = (value) => ['on', 'open', 'detected', 'motion', 'occupancy', 'present', 'home', 'true', '1', 'yes', 'ja'].includes(norm(value));
const isAbsoluteImageUrl = (value) => /^(https?:|data:|blob:)/i.test(String(value || '').trim());
const shouldResolveWithHaBase = (value) => /^\/(?:api|local|media)\//i.test(String(value || '').trim());
const normalizeMatchText = (value) => String(value ?? '')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[_-]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase();
const tokenize = (value) => normalizeMatchText(value)
  .split(/[^a-z0-9]+/)
  .map((token) => token.trim())
  .filter((token) => token.length >= 2);
const extractCardId = (settingsKey) => {
  const parts = String(settingsKey || '').split('::');
  return parts[parts.length - 1] || String(settingsKey || '');
};
const getSettingsPageId = (settingsKey) => {
  const parts = String(settingsKey || '').split('::');
  return parts.length > 1 ? parts[0] : '';
};
const toNum = (value) => {
  const parsed = Number.parseFloat(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
};
const roundToOne = (value) => Math.round(Number(value) * 10) / 10;
const SCORE_MISS_PENALTY = 10;
const SCORE_HITRATE_WEIGHT = 0.25;
const BOOKING_TYPES = ['felles', 'aufguss', 'private', 'service'];
const GENERIC_BOOKING_STATES = new Set([
  'ja',
  'yes',
  'on',
  'true',
  '1',
  'nei',
  'no',
  'off',
  'false',
  '0',
  'active',
  'aktiv',
  'booked',
  'occupied',
  'heat',
  'heating',
]);
const POSITIVE_SERVICE_STATES = new Set(['ja', 'yes', 'on', 'true', '1', 'service']);

const normalizeScoreValue = (value) => {
  const parsed = toNum(value);
  if (parsed === null) return null;
  const score = parsed > 0 && parsed < 1 ? parsed * 100 : parsed;
  return Math.max(0, Math.min(100, Math.round(score)));
};

const calcDeviationPct = (temp, target) => {
  const tempNum = toNum(temp);
  const targetNum = toNum(target);
  if (tempNum === null || targetNum === null || Math.abs(targetNum) < 0.001) return null;
  return roundToOne(((tempNum - targetNum) / targetNum) * 100);
};

const calcScoreFromDeviationPct = (deviationPct, options = {}) => {
  const { hit = null, missPenalty = SCORE_MISS_PENALTY } = options;
  const parsed = toNum(deviationPct);
  if (parsed === null) return null;
  const baseScore = Math.max(0, Math.min(100, Math.round(100 - Math.abs(parsed))));
  if (hit === false) {
    return Math.max(0, baseScore - Math.max(0, Number(missPenalty) || 0));
  }
  return baseScore;
};

const isTargetReached = (startTemp, targetTemp, toleranceC = 0) => {
  const start = toNum(startTemp);
  const target = toNum(targetTemp);
  if (start === null || target === null) return null;
  const safeTolerance = Number.isFinite(Number(toleranceC)) ? Math.max(0, Number(toleranceC)) : 0;
  return start >= (target - safeTolerance);
};

const normalizeBookingType = (value, fallback = 'felles') => {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '');
  if (!normalized) return fallback;
  if (normalized.includes('aufguss')) return 'aufguss';
  if (normalized.includes('service') || normalized.includes('vedlikehold') || normalized.includes('maintenance')) return 'service';
  if (normalized.includes('privat') || normalized.includes('private')) return 'private';
  if (normalized.includes('felles') || normalized.includes('shared') || normalized.includes('regular') || normalized.includes('vanlig')) return 'felles';
  if (POSITIVE_SERVICE_STATES.has(normalized)) return 'service';
  if (BOOKING_TYPES.includes(normalized)) return normalized;
  return fallback;
};

const normalizeBookingStateType = (value) => {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '');
  if (!normalized || GENERIC_BOOKING_STATES.has(normalized)) return null;
  const bookingType = normalizeBookingType(normalized, '');
  return BOOKING_TYPES.includes(bookingType) ? bookingType : null;
};

const getBookingTypeColor = (type) => {
  const normalized = normalizeBookingType(type);
  if (normalized === 'service') return '#ffbf2f';
  if (normalized === 'aufguss') return '#9c71ff';
  if (normalized === 'private') return '#ff5cae';
  return '#63a4ff';
};

const getBookingTypeLabel = (type, t) => {
  const normalized = normalizeBookingType(type);
  if (normalized === 'service') return tr(t, 'calendarBooking.type.service', 'Service');
  if (normalized === 'aufguss') return tr(t, 'calendarBooking.type.aufguss', 'Aufguss');
  if (normalized === 'private') return tr(t, 'calendarBooking.type.private', 'Privat');
  return tr(t, 'calendarBooking.type.felles', 'Felles');
};

const resolveImageValue = (value, getEntityImageUrl, { forceHaBase = false } = {}) => {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  if (isAbsoluteImageUrl(raw)) return raw;
  if (typeof getEntityImageUrl === 'function' && (forceHaBase || shouldResolveWithHaBase(raw))) {
    return getEntityImageUrl(raw);
  }
  return raw;
};

const resolveSaunaImageUrl = (settings, entities, getEntityImageUrl) => {
  const raw = String(settings?.imageUrl ?? '').trim();
  if (raw) return resolveImageValue(raw, getEntityImageUrl);

  const imageEntityId = String(settings?.imageEntityId || '').trim();
  if (!imageEntityId) return null;

  const imageEntity = entities?.[imageEntityId];
  const picture = imageEntity?.attributes?.entity_picture;
  if (picture) return resolveImageValue(picture, getEntityImageUrl, { forceHaBase: true });

  const state = String(imageEntity?.state ?? '').trim();
  if (isAbsoluteImageUrl(state) || state.startsWith('/')) {
    return resolveImageValue(state, getEntityImageUrl, { forceHaBase: state.startsWith('/') });
  }

  return null;
};

const resolveTargetSettings = ({ cardSettings, getCardSettingsKey, targetCardId, targetPageId, activePage }) => {
  const settings = cardSettings || {};
  const candidates = [];

  if (typeof getCardSettingsKey === 'function') {
    if (targetPageId) candidates.push(getCardSettingsKey(targetCardId, targetPageId));
    if (activePage && activePage !== targetPageId) candidates.push(getCardSettingsKey(targetCardId, activePage));
    candidates.push(getCardSettingsKey(targetCardId));
  }

  candidates.push(targetCardId);

  const uniqueCandidates = Array.from(new Set(candidates.filter(Boolean)));
  for (const key of uniqueCandidates) {
    if (settings[key]) return settings[key];
  }

  const fallbackKey = Object.keys(settings).find((key) => key.endsWith(`::${targetCardId}`));
  return fallbackKey ? settings[fallbackKey] : {};
};

const formatTemperature = (entity) => {
  if (!entity || isUnavailable(entity.state)) return { value: '--', unit: '' };
  const numeric = toNum(entity.state);
  const unit = String(entity.attributes?.unit_of_measurement || 'deg C').replace('deg C', '°C');
  if (Number.isFinite(numeric)) return { value: numeric.toFixed(1), unit };
  return { value: String(entity.state), unit: '' };
};

const getDirectScore = (settings, entities) => {
  const scoreEntityId = String(settings?.healthScoreEntityId || settings?.scoreEntityId || '').trim();
  const scoreEntity = scoreEntityId ? entities?.[scoreEntityId] : null;
  const scoreFromEntity = normalizeScoreValue(
    scoreEntity?.state
      ?? scoreEntity?.attributes?.healthScore
      ?? scoreEntity?.attributes?.health_score
      ?? scoreEntity?.attributes?.score
  );
  if (scoreFromEntity !== null) return scoreFromEntity;

  const directScore = normalizeScoreValue(settings?.healthScore ?? settings?.score);
  if (directScore !== null) return directScore;

  return null;
};

const normalizeHealthSamples = (rawValue) => {
  if (!Array.isArray(rawValue)) return [];
  return rawValue
    .map((entry, index) => {
      const timestamp = String(entry?.timestamp || entry?.time || '').trim();
      const timestampMs = Date.parse(timestamp);
      const startTemp = toNum(entry?.startTemp ?? entry?.temperature ?? entry?.temp);
      if (!Number.isFinite(timestampMs) || startTemp === null) return null;
      const targetTemp = toNum(entry?.targetTemp);
      const deviationPct = toNum(entry?.deviationPct ?? entry?.deviationPercent);
      return {
        id: String(entry?.id || `${timestamp}_${index}`),
        timestampMs,
        targetTemp,
        deviationPct: deviationPct !== null ? roundToOne(deviationPct) : calcDeviationPct(startTemp, targetTemp),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.timestampMs - b.timestampMs);
};

const normalizeBookingSamples = (rawValue) => {
  if (!Array.isArray(rawValue)) return [];
  return rawValue
    .map((entry, index) => {
      const timestamp = String(entry?.timestamp || entry?.time || '').trim();
      const timestampMs = Date.parse(timestamp);
      const startTemp = toNum(entry?.startTemp ?? entry?.temperature ?? entry?.temp);
      if (!Number.isFinite(timestampMs) || startTemp === null) return null;
      const targetTemp = toNum(entry?.targetTemp);
      const deviationPct = toNum(entry?.deviationPct ?? entry?.deviationPercent);
      return {
        id: String(entry?.id || `${timestamp}_${index}`),
        timestampMs,
        startTemp,
        targetTemp,
        deviationPct: deviationPct !== null ? roundToOne(deviationPct) : calcDeviationPct(startTemp, targetTemp),
        bookingType: norm(entry?.bookingType ?? entry?.type),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.timestampMs - b.timestampMs);
};

const clampSummaryHours = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 48;
  return Math.max(6, Math.min(168, Math.round(parsed)));
};

const computeHealthScore = (settings) => {
  const samples = normalizeHealthSamples(settings?.healthSnapshots);
  if (!samples.length) return null;

  const windowStart = Date.now() - (clampSummaryHours(settings?.summaryHours) * 60 * 60 * 1000);
  const recentTargetSamples = samples
    .filter((entry) => entry.timestampMs >= windowStart && entry.targetTemp !== null && entry.deviationPct !== null);
  const targetSamples = recentTargetSamples.length
    ? recentTargetSamples
    : samples.filter((entry) => entry.targetTemp !== null && entry.deviationPct !== null);
  if (!targetSamples.length) return null;

  const avgDeviationPct = roundToOne(
    targetSamples.reduce((sum, entry) => sum + (entry.deviationPct ?? 0), 0) / targetSamples.length,
  );
  return calcScoreFromDeviationPct(avgDeviationPct);
};

const computeBookingScore = (settings) => {
  const samples = normalizeBookingSamples(settings?.bookingSnapshots)
    .filter((entry) => entry.bookingType !== 'service');
  if (!samples.length) return null;

  const windowStart = Date.now() - (clampSummaryHours(settings?.summaryHours) * 60 * 60 * 1000);
  const recentSamples = samples.filter((entry) => entry.timestampMs >= windowStart);
  const scoreFromSamples = (candidateSamples) => {
    const targetSamples = candidateSamples.filter((entry) => entry.targetTemp !== null);
    const targetSamplesWithPct = targetSamples.filter((entry) => entry.deviationPct !== null);
    if (!targetSamplesWithPct.length) return null;

    const targetToleranceC = Number.isFinite(Number(settings?.targetToleranceC)) ? Number(settings.targetToleranceC) : 0;
    const scoreSamples = targetSamplesWithPct
      .map((entry) => ({
        score: calcScoreFromDeviationPct(entry.deviationPct, {
          hit: isTargetReached(entry.startTemp, entry.targetTemp, targetToleranceC),
        }),
      }))
      .filter((entry) => entry.score !== null);
    if (!scoreSamples.length) return null;

    const avgScore = scoreSamples.reduce((sum, entry) => sum + (entry.score ?? 0), 0) / scoreSamples.length;
    const reachedCount = targetSamples
      .filter((entry) => entry.startTemp >= (entry.targetTemp - targetToleranceC))
      .length;
    const reachedRate = targetSamples.length ? Math.round((reachedCount / targetSamples.length) * 100) : null;
    return reachedRate !== null
      ? Math.max(0, Math.min(100, Math.round((avgScore * (1 - SCORE_HITRATE_WEIGHT)) + (reachedRate * SCORE_HITRATE_WEIGHT))))
      : Math.max(0, Math.min(100, Math.round(avgScore)));
  };

  return scoreFromSamples(recentSamples) ?? scoreFromSamples(samples);
};

const computeScoreFromSettings = (settings) => (
  computeHealthScore(settings) ?? computeBookingScore(settings)
);

const getScoreTone = (score) => {
  const normalizedScore = normalizeScoreValue(score);
  if (normalizedScore === null) {
    return {
      score: null,
      border: 'rgba(255, 255, 255, 0.18)',
      shadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.05)',
    };
  }
  if (normalizedScore > 90) {
    return {
      score: normalizedScore,
      border: 'rgba(16, 185, 129, 0.95)',
      shadow: '0 0 0 1px rgba(16, 185, 129, 0.18), 0 18px 36px rgba(6, 95, 70, 0.28)',
    };
  }
  if (normalizedScore >= 70) {
    return {
      score: normalizedScore,
      border: 'rgba(245, 158, 11, 0.95)',
      shadow: '0 0 0 1px rgba(245, 158, 11, 0.2), 0 18px 36px rgba(146, 64, 14, 0.28)',
    };
  }
  return {
    score: normalizedScore,
    border: 'rgba(244, 63, 94, 0.95)',
    shadow: '0 0 0 1px rgba(244, 63, 94, 0.2), 0 18px 36px rgba(136, 19, 55, 0.3)',
  };
};

const getEntityName = (entities, entityId) => {
  if (!entityId) return '';
  return entities?.[entityId]?.attributes?.friendly_name || entityId;
};

const buildTextScore = (baseTexts, sourceTexts) => {
  const baseTokens = new Set((baseTexts || []).flatMap(tokenize));
  const sourceTokens = new Set((sourceTexts || []).flatMap(tokenize));
  const baseCompact = (baseTexts || []).map((value) => normalizeMatchText(value).replace(/\s+/g, '')).filter(Boolean);
  const sourceCompact = (sourceTexts || []).map((value) => normalizeMatchText(value).replace(/\s+/g, '')).filter(Boolean);
  let score = 0;

  baseTokens.forEach((token) => {
    if (sourceTokens.has(token)) score += token.length >= 4 ? 3 : 2;
  });

  baseCompact.forEach((baseValue) => {
    sourceCompact.forEach((sourceValue) => {
      if (!baseValue || !sourceValue) return;
      if (baseValue === sourceValue) score += 8;
      else if (baseValue.length >= 4 && sourceValue.includes(baseValue)) score += 5;
      else if (sourceValue.length >= 4 && baseValue.includes(sourceValue)) score += 4;
    });
  });

  return score;
};

const getMergedCardSettings = (cardSettings) => {
  const byCardId = new Map();
  Object.entries(cardSettings || {}).forEach(([settingsKey, value]) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return;
    const cardId = extractCardId(settingsKey);
    const existing = byCardId.get(cardId);
    const isScopedKey = String(settingsKey || '').includes('::');
    const existingIsScoped = String(existing?.settingsKey || '').includes('::');
    const settings = isScopedKey || !existingIsScoped
      ? { ...(existing?.settings || {}), ...value }
      : { ...value, ...(existing?.settings || {}) };
    byCardId.set(cardId, {
      cardId,
      settingsKey: isScopedKey ? settingsKey : (existing?.settingsKey || settingsKey),
      pageId: isScopedKey ? getSettingsPageId(settingsKey) : (existing?.pageId || getSettingsPageId(settingsKey)),
      settings,
    });
  });
  return Array.from(byCardId.values());
};

const resolveScoreSource = ({
  targetCardId,
  targetPageId,
  buttonLabel,
  targetSettings,
  cardSettings,
  customNames,
  entities,
}) => {
  const directTargetScore = getDirectScore(targetSettings, entities);

  const healthCards = getMergedCardSettings(cardSettings)
    .map((candidate) => {
      const settings = candidate.settings || {};
      const healthScore = getDirectScore(settings, entities);
      const isBookingTempScoreSource = Boolean(
        settings?.type === 'sauna_booking_temp'
        || String(candidate.cardId).startsWith('sauna_booking_temp_card_')
        || String(candidate.settingsKey).includes('sauna_booking_temp_card_')
        || Array.isArray(settings?.bookingSnapshots)
      );
      return {
        ...candidate,
        settings,
        healthScore: healthScore !== null
          ? healthScore
          : (isBookingTempScoreSource ? computeBookingScore(settings) : computeScoreFromSettings(settings)),
        hasDirectScore: healthScore !== null,
        isBookingTempScoreSource,
      };
    })
    .filter(({ cardId, settingsKey, settings }) => (
      settings?.type === 'sauna_health_score'
      || settings?.type === 'sauna_booking_temp'
      || String(cardId).startsWith('sauna_health_score_card_')
      || String(cardId).startsWith('sauna_booking_temp_card_')
      || String(settingsKey).includes('sauna_health_score_card_')
      || String(settingsKey).includes('sauna_booking_temp_card_')
      || String(settings?.type || '').includes('health_score')
      || Array.isArray(settings?.healthSnapshots)
      || Array.isArray(settings?.bookingSnapshots)
    ));

  const saunaTempEntityId = String(targetSettings?.tempEntityId || '').trim();
  const saunaActiveEntityId = String(targetSettings?.saunaActiveBooleanEntityId || '').trim();
  const saunaZoneEntityId = String(targetSettings?.zoneEntityId || '').trim();
  const saunaMatchTexts = [
    targetCardId,
    customNames?.[targetCardId],
    buttonLabel,
    targetSettings?.name,
    targetSettings?.heading,
    targetSettings?.title,
    saunaTempEntityId,
    saunaActiveEntityId,
    saunaZoneEntityId,
    getEntityName(entities, saunaTempEntityId),
    getEntityName(entities, saunaActiveEntityId),
    getEntityName(entities, saunaZoneEntityId),
  ].filter(Boolean);

  const ranked = healthCards
    .map((candidate) => {
      const settings = candidate.settings;
      let matchScore = 0;
      const candidateTempEntityId = String(settings?.tempEntityId || '').trim();
      const candidateActiveEntityId = String(settings?.bookingActiveEntityId || settings?.activeEntityId || settings?.saunaActiveBooleanEntityId || '').trim();
      const candidateZoneEntityId = String(settings?.zoneEntityId || '').trim();
      const candidateMatchTexts = [
        candidate.cardId,
        candidate.settingsKey,
        customNames?.[candidate.cardId],
        settings?.name,
        settings?.heading,
        settings?.title,
        candidateTempEntityId,
        candidateActiveEntityId,
        candidateZoneEntityId,
        getEntityName(entities, candidateTempEntityId),
        getEntityName(entities, candidateActiveEntityId),
        getEntityName(entities, candidateZoneEntityId),
      ].filter(Boolean);
      const exactMatch = Boolean(
        (saunaZoneEntityId && candidateZoneEntityId && candidateZoneEntityId === saunaZoneEntityId)
        || (saunaTempEntityId && candidateTempEntityId && candidateTempEntityId === saunaTempEntityId)
        || (saunaActiveEntityId && candidateActiveEntityId && candidateActiveEntityId === saunaActiveEntityId)
      );
      if (saunaZoneEntityId && candidateZoneEntityId && candidateZoneEntityId === saunaZoneEntityId) matchScore += 140;
      if (saunaTempEntityId && candidateTempEntityId && candidateTempEntityId === saunaTempEntityId) matchScore += 130;
      if (saunaActiveEntityId && candidateActiveEntityId && candidateActiveEntityId === saunaActiveEntityId) matchScore += 120;
      if (targetPageId && candidate.pageId && candidate.pageId === targetPageId) matchScore += 12;
      if (candidate.isBookingTempScoreSource) matchScore += 10;
      if (candidate.hasDirectScore) matchScore += 8;
      matchScore += buildTextScore(saunaMatchTexts, candidateMatchTexts);
      return { ...candidate, exactMatch, matchScore };
    })
    .filter((candidate) => candidate.matchScore > 0 && candidate.healthScore !== null)
    .sort((a, b) => b.matchScore - a.matchScore);

  const exactRanked = ranked.filter((candidate) => candidate.exactMatch);
  const bestBookingTemp = (exactRanked.find((candidate) => candidate.isBookingTempScoreSource)
    || ranked.find((candidate) => candidate.isBookingTempScoreSource));
  const best = bestBookingTemp || exactRanked[0] || ranked[0] || null;
  if (best && best.matchScore >= 3) {
    return {
      score: best.healthScore,
      settings: best.settings,
      sourceType: best.isBookingTempScoreSource ? 'sauna_booking_temp' : (best.settings?.type || ''),
    };
  }

  if (directTargetScore !== null) {
    return { score: directTargetScore, settings: targetSettings, sourceType: 'target' };
  }

  return { score: null, settings: null, sourceType: '' };
};

const getLatestSnapshotBookingType = (settings) => {
  const samples = normalizeBookingSamples(settings?.bookingSnapshots);
  if (!samples.length) return null;
  const windowStart = Date.now() - (clampSummaryHours(settings?.summaryHours) * 60 * 60 * 1000);
  const recentSamples = samples.filter((entry) => entry.timestampMs >= windowStart);
  const scopedSamples = recentSamples.length ? recentSamples : samples;
  const latest = scopedSamples[scopedSamples.length - 1];
  return latest?.bookingType ? normalizeBookingType(latest.bookingType, '') : null;
};

const getBookingTypeFromEntity = (entity, { positiveStateAsService = false } = {}) => {
  if (!entity) return null;
  const attrs = entity.attributes || {};
  const candidates = [
    attrs.current_booking_type,
    attrs.currentBookingType,
    attrs.booking_type,
    attrs.bookingType,
    attrs.next_booking_type,
    attrs.nextBookingType,
    attrs.type,
    entity.state,
  ];
  for (const candidate of candidates) {
    const bookingType = normalizeBookingStateType(candidate);
    if (bookingType) return bookingType;
  }
  const normalizedState = norm(entity.state);
  if (positiveStateAsService && POSITIVE_SERVICE_STATES.has(normalizedState)) return 'service';
  return null;
};

const resolveBookingType = (targetSettings, entities, scoreSourceSettings) => {
  const serviceEntity = targetSettings?.serviceEntityId ? entities?.[targetSettings.serviceEntityId] : null;
  const activeEntity = targetSettings?.saunaActiveBooleanEntityId ? entities?.[targetSettings.saunaActiveBooleanEntityId] : null;
  const nextBookingEntity = targetSettings?.nextBookingInMinutesEntityId ? entities?.[targetSettings.nextBookingInMinutesEntityId] : null;

  const explicitType = [
    targetSettings?.currentBookingType,
    targetSettings?.bookingType,
    getBookingTypeFromEntity(serviceEntity, { positiveStateAsService: true }),
    getBookingTypeFromEntity(activeEntity),
    getBookingTypeFromEntity(nextBookingEntity),
  ].find(Boolean);
  if (explicitType) return explicitType;

  if (serviceEntity && POSITIVE_SERVICE_STATES.has(norm(serviceEntity.state))) return 'service';
  if (activeEntity && isOnish(activeEntity.state)) return 'felles';

  return getLatestSnapshotBookingType(scoreSourceSettings);
};

export default function PopupLauncherCard({
  cardId,
  settings = {},
  dragProps,
  controls,
  cardStyle,
  editMode,
  customNames = {},
  cardSettings = {},
  entities = {},
  getCardSettingsKey,
  getEntityImageUrl,
  activePage,
  isMobile = false,
  onOpenTarget,
  t,
}) {
  const heading = customNames[cardId] || settings.heading || tr(t, 'popupLauncher.defaultTitle', 'Quick access');
  const buttons = normalizeButtons(settings.buttons);
  const columns = clampColumns(settings.columns);
  const hasSaunaButtons = buttons.some((button) => button.targetCardId.startsWith('sauna_card_'));
  const explicitMobileSpan = Number(settings.gridColSpan);
  const maxMobileColumns = Number.isFinite(explicitMobileSpan)
    ? Math.max(1, Math.min(2, Math.round(explicitMobileSpan)))
    : 2;
  const displayColumns = hasSaunaButtons
    ? Math.max(1, Math.min(buttons.length || 1, isMobile ? 2 : 3))
    : (isMobile ? Math.min(columns, maxMobileColumns) : columns);
  const getSaunaSummary = (button) => {
    const targetSettings = resolveTargetSettings({
      cardSettings,
      getCardSettingsKey,
      targetCardId: button.targetCardId,
      targetPageId: button.targetPageId,
      activePage,
    });

    const tempEntity = targetSettings?.tempEntityId ? entities?.[targetSettings.tempEntityId] : null;
    const peopleEntity = targetSettings?.peopleNowEntityId ? entities?.[targetSettings.peopleNowEntityId] : null;
    const motionEntity = targetSettings?.motionEntityId ? entities?.[targetSettings.motionEntityId] : null;
    const modeEntity = targetSettings?.manualModeEntityId ? entities?.[targetSettings.manualModeEntityId] : null;
    const modeStateKnown = modeEntity && !isUnavailable(modeEntity.state);
    const autoModeOn = modeStateKnown && isOn(modeEntity.state);
    const temp = formatTemperature(tempEntity);
    const scoreSource = resolveScoreSource({
      targetCardId: button.targetCardId,
      targetPageId: button.targetPageId,
      buttonLabel: button.label,
      targetSettings,
      cardSettings,
      customNames,
      entities,
    });
    const bookingType = resolveBookingType(targetSettings, entities, scoreSource?.settings);

    return {
      imageUrl: resolveSaunaImageUrl(targetSettings, entities, getEntityImageUrl),
      temp,
      people: peopleEntity && !isUnavailable(peopleEntity.state) ? String(peopleEntity.state) : '--',
      motionConfigured: Boolean(targetSettings?.motionEntityId),
      motionOn: motionEntity ? isOnish(motionEntity.state) : false,
      showManual: Boolean(modeStateKnown && !autoModeOn),
      scoreTone: getScoreTone(scoreSource?.score),
      bookingType,
      bookingTypeColor: bookingType ? getBookingTypeColor(bookingType) : null,
      bookingTypeLabel: bookingType ? getBookingTypeLabel(bookingType, t) : null,
    };
  };

  const openButtonTarget = (event, button, label, hasTarget) => {
    event.stopPropagation();
    if (editMode || !hasTarget || typeof onOpenTarget !== 'function') return;
    onOpenTarget({
      sourceCardId: cardId,
      buttonId: button.id,
      buttonLabel: label,
      targetCardId: button.targetCardId,
      targetPageId: button.targetPageId,
    });
  };

  return (
    <div
      {...dragProps}
      className={`touch-feedback h-full w-full rounded-3xl border relative overflow-hidden p-4 sm:p-5 font-sans break-inside-avoid ${
        editMode ? 'cursor-move' : ''
      }`}
      style={{
        ...cardStyle,
        background: 'linear-gradient(135deg, var(--card-bg) 0%, var(--modal-bg) 100%)',
        borderColor: 'var(--glass-border)',
      }}
    >
      {controls}

      <div className="mb-3">
        <p className="text-[10px] uppercase tracking-[0.26em] font-bold text-[var(--text-secondary)]">
          {heading}
        </p>
      </div>

      {buttons.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--glass-border)] bg-[var(--glass-bg)] px-4 py-6 text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-[var(--text-secondary)]">
            {tr(t, 'popupLauncher.emptyTitle', 'No launcher buttons yet')}
          </p>
          <p className="text-[11px] mt-1 text-[var(--text-muted)]">
            {tr(t, 'popupLauncher.emptyHint', 'Open card settings and add buttons.')}
          </p>
        </div>
      ) : (
        <div
          className="grid gap-2.5"
          style={{ gridTemplateColumns: `repeat(${displayColumns}, minmax(0, 1fr))` }}
        >
          {buttons.map((button) => {
            const Icon = getIconComponent(button.icon) || LayoutGrid;
            const hasTarget = Boolean(button.targetCardId);
            const label = button.label || tr(t, 'popupLauncher.openCard', 'Open card');
            const isSaunaButton = hasTarget && button.targetCardId.startsWith('sauna_card_');

            if (isSaunaButton) {
              const sauna = getSaunaSummary(button);
              const motionLabel = sauna.motionOn
                ? tr(t, 'sauna.motionDetected', 'Motion')
                : tr(t, 'sauna.noMotion', 'No motion');

              return (
                <button
                  key={button.id}
                  type="button"
                  disabled={editMode || !hasTarget}
                  onClick={(event) => openButtonTarget(event, button, label, hasTarget)}
                  className={`relative aspect-[1.16/1] min-h-[7rem] max-h-[13rem] overflow-hidden rounded-2xl border-[4px] text-left transition-all sm:aspect-[1.55/1] sm:min-h-[10rem] sm:max-h-[16rem] lg:aspect-[1.85/1] lg:min-h-[11.5rem] ${
                    editMode || !hasTarget
                      ? 'opacity-70 cursor-default border-[var(--glass-border)] bg-[var(--glass-bg)]'
                      : 'bg-slate-950/70 active:scale-[0.98]'
                  }`}
                  style={{
                    borderColor: sauna.scoreTone.border,
                    boxShadow: sauna.scoreTone.shadow,
                  }}
                  aria-label={`${label}: ${sauna.temp.value}${sauna.temp.unit ? ` ${sauna.temp.unit}` : ''}, ${sauna.people} ${tr(t, 'sauna.peopleNow', 'people')}`}
                >
                  {sauna.imageUrl ? (
                    <img
                      src={sauna.imageUrl}
                      alt=""
                      className="absolute inset-0 h-full w-full object-cover"
                      draggable={false}
                    />
                  ) : (
                    <div className="absolute inset-0 bg-gradient-to-br from-emerald-950 via-slate-950 to-orange-950" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/88 via-black/38 to-black/18" />
                  <div className="relative z-10 flex h-full min-h-[7rem] flex-col justify-between p-2.5 sm:min-h-[10rem] sm:p-4 lg:min-h-[11.5rem]">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-1.5">
                        {sauna.bookingTypeColor && (
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full border border-white/40 shadow-[0_0_14px_rgba(255,255,255,0.18)]"
                            style={{ backgroundColor: sauna.bookingTypeColor }}
                            title={sauna.bookingTypeLabel}
                            aria-label={sauna.bookingTypeLabel}
                          />
                        )}
                        {sauna.showManual && (
                          <span className="rounded-full border border-orange-300/35 bg-orange-500/20 px-2 py-1 text-[9px] font-extrabold uppercase tracking-widest text-orange-100 shadow-[0_8px_16px_rgba(0,0,0,0.24)]">
                            {tr(t, 'sauna.manualMode', 'Manual')}
                          </span>
                        )}
                      </div>
                      {sauna.motionConfigured && (
                        <span
                          className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full border ${
                            sauna.motionOn
                              ? 'border-emerald-200/80 bg-emerald-300 shadow-[0_0_14px_rgba(110,231,183,0.75)]'
                              : 'border-white/30 bg-white/25'
                          }`}
                          title={motionLabel}
                          aria-label={motionLabel}
                        />
                      )}
                    </div>

                    <div className="min-w-0">
                      <p className="truncate text-[11px] font-extrabold uppercase tracking-[0.16em] text-white/88">
                        {label}
                      </p>
                      <div className="mt-2 flex items-end justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-end gap-1.5 whitespace-nowrap">
                            <Thermometer className="mb-1 h-3.5 w-3.5 shrink-0 text-orange-200/85" />
                            <span className="text-[1.35rem] font-semibold leading-none tabular-nums text-white sm:text-[1.65rem]">
                              {sauna.temp.value}
                            </span>
                            {sauna.temp.unit && (
                              <span className="mb-0.5 text-[11px] font-bold text-white/72">
                                {sauna.temp.unit}
                              </span>
                            )}
                          </div>
                        </div>
                        <div
                          className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-extrabold tabular-nums text-white ${
                            sauna.motionOn
                              ? 'border-emerald-200/55 bg-emerald-400/25 shadow-[0_0_14px_rgba(110,231,183,0.34)]'
                              : 'border-white/14 bg-black/32'
                          }`}
                        >
                          <User className="h-3 w-3 text-white/85" />
                          <span>{sauna.people}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </button>
              );
            }

            return (
              <button
                key={button.id}
                type="button"
                disabled={editMode || !hasTarget}
                onClick={(event) => openButtonTarget(event, button, label, hasTarget)}
                className={`rounded-2xl border p-3 text-left transition-all ${
                  editMode || !hasTarget
                    ? 'opacity-70 cursor-default border-[var(--glass-border)] bg-[var(--glass-bg)]'
                    : 'border-emerald-400/20 bg-emerald-500/10 hover:bg-emerald-500/15 active:scale-[0.98]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="w-8 h-8 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] flex items-center justify-center text-[var(--text-secondary)]">
                    <Icon className="w-4 h-4" />
                  </div>
                  <ArrowRight className="w-4 h-4 text-[var(--text-muted)]" />
                </div>
                <p className="mt-2 text-[11px] leading-tight font-bold uppercase tracking-wide text-[var(--text-primary)]">
                  {label}
                </p>
                {!hasTarget && (
                  <p className="mt-1 text-[10px] text-[var(--text-muted)]">
                    {tr(t, 'popupLauncher.notConfigured', 'No target selected')}
                  </p>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
