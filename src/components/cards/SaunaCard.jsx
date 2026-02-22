import React, { useMemo } from 'react';
import { Flame, Thermometer, Lock, DoorOpen, Activity, Lightbulb, Shield, Fan, Hash, ToggleRight, Wrench, Power } from '../../icons';
import { getIconComponent } from '../../icons';
import SparkLine from '../charts/SparkLine';

const asArray = (v) => (Array.isArray(v) ? v.filter(Boolean) : []);
const norm = (s) => String(s ?? '').toLowerCase();
const STATUS_GRAPH_WINDOW_MS = 12 * 60 * 60 * 1000;

const isOn = (state) => ['on', 'true', '1', 'yes'].includes(norm(state));
const isOnish = (state) => ['on', 'open', 'unlocked', 'heat', 'heating', 'true', '1', 'yes'].includes(norm(state));
const countOn = (ids, entities) => ids.filter((id) => isOnish(entities?.[id]?.state)).length;

const toNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const cx = (...p) => p.filter(Boolean).join(' ');

function parseHistoryTimestamp(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 1e12 ? value : value * 1000;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return NaN;
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) {
      return numeric > 1e12 ? numeric : numeric * 1000;
    }
    return Date.parse(trimmed);
  }

  return Date.parse(String(value ?? ''));
}

function unwrapHistoryArray(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];

  if (Array.isArray(value.result)) return unwrapHistoryArray(value.result);
  if (value.result && typeof value.result === 'object') return unwrapHistoryArray(value.result);
  if (Array.isArray(value.history)) return unwrapHistoryArray(value.history);
  if (Array.isArray(value.states)) return unwrapHistoryArray(value.states);

  const nestedArray = Object.values(value).find((v) => Array.isArray(v));
  return nestedArray ? unwrapHistoryArray(nestedArray) : [];
}

function makeTr(t) {
  return (key, fallback) => {
    const out = typeof t === 'function' ? t(key) : undefined;
    const s = String(out ?? '');
    const looksLikeKey = !s || s === key || s.toLowerCase() === key.toLowerCase() || s === s.toUpperCase() || (s.includes('.') && (s.toLowerCase().includes('sauna.') || s.toLowerCase().includes('common.') || s.toLowerCase().includes('binary.')));
    return looksLikeKey ? fallback : s;
  };
}

const FlameAnimated = ({ className, isLightTheme = false }) => (
  <div className={cx('relative', className)}>
    <div className={cx(
      'absolute inset-0 rounded-full blur-md animate-pulse',
      isLightTheme ? 'opacity-90 bg-orange-500/40' : 'opacity-70 bg-orange-400/30'
    )} />
    <Flame className={cx(
      'relative w-full h-full animate-[flameWiggle_1.2s_ease-in-out_infinite]',
      isLightTheme ? 'text-orange-600 drop-shadow-[0_0_10px_rgba(249,115,22,0.6)]' : 'text-orange-300'
    )} />
    <style>{`
      @keyframes flameWiggle {
        0%   { transform: translateY(0) rotate(-2deg) scale(1.00); }
        35%  { transform: translateY(-1px) rotate(2deg) scale(1.04); }
        70%  { transform: translateY(0.5px) rotate(-1deg) scale(0.99); }
        100% { transform: translateY(0) rotate(-2deg) scale(1.00); }
      }
    `}</style>
  </div>
);

function resolveImageUrl(settings, entities) {
  const raw = String(settings?.imageUrl ?? '').trim();
  if (raw) return raw;
  if (settings?.imageEntityId) {
    const ent = entities?.[settings.imageEntityId];
    const pic = ent?.attributes?.entity_picture;
    if (pic) return pic;
    const state = String(ent?.state ?? '');
    if (state.startsWith('http://') || state.startsWith('https://') || state.startsWith('/')) return state;
  }
  return null;
}

function extractHistorySeries(raw) {
  if (!raw) return [];

  const arr = unwrapHistoryArray(raw);
  const flat = Array.isArray(arr?.[0]) ? arr[0] : arr;
  if (!Array.isArray(flat)) return [];

  return flat
    .map((entry) => {
      const tRaw = entry?.last_updated
        || entry?.last_changed
        || entry?.last_reported
        || entry?.start
        || entry?.end
        || entry?.timestamp
        || entry?.time
        || entry?.t
        || entry?.l
        || entry?.lu
        || entry?.lc
        || entry?.lr
        || '';
      const vRaw = entry?.state ?? entry?.s ?? entry?.mean ?? entry?.value ?? entry?.v;
      const numericValue = typeof vRaw === 'string' ? Number(vRaw.replace(',', '.')) : Number(vRaw);
      return {
        t: parseHistoryTimestamp(tRaw),
        v: numericValue,
      };
    })
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v))
    .sort((a, b) => a.t - b.t);
}

function extractStateSeries(raw, activeStates = []) {
  if (!raw) return [];
  const activeSet = new Set(activeStates.map((state) => norm(state)));
  const arr = unwrapHistoryArray(raw);
  const flat = Array.isArray(arr?.[0]) ? arr[0] : arr;
  if (!Array.isArray(flat)) return [];

  return flat
    .map((entry) => {
      const tRaw = entry?.last_updated
        || entry?.last_changed
        || entry?.last_reported
        || entry?.start
        || entry?.end
        || entry?.timestamp
        || entry?.time
        || entry?.t
        || entry?.l
        || entry?.lu
        || entry?.lc
        || entry?.lr
        || '';

      const stateRaw = entry?.state ?? entry?.s ?? entry?.mean ?? entry?.value ?? entry?.v;
      const normalized = norm(stateRaw);
      const numericState = Number(stateRaw);

      let active = false;
      if (activeSet.has(normalized)) active = true;
      else if (Number.isFinite(numericState)) active = numericState > 0.5;

      return {
        t: parseHistoryTimestamp(tRaw),
        v: active ? 1 : 0,
      };
    })
    .filter((point) => Number.isFinite(point.t))
    .sort((a, b) => a.t - b.t);
}

function buildOverlaySegments(stateSeries, startMs, endMs) {
  if (!Array.isArray(stateSeries) || stateSeries.length === 0) return [];
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return [];

  const sorted = [...stateSeries]
    .filter((point) => Number.isFinite(point.t) && Number.isFinite(point.v))
    .sort((a, b) => a.t - b.t);
  if (!sorted.length) return [];

  let activeAtStart = 0;
  let hasPointBeforeStart = false;
  for (const point of sorted) {
    if (point.t <= startMs) {
      activeAtStart = point.v > 0 ? 1 : 0;
      hasPointBeforeStart = true;
    } else {
      break;
    }
  }
  if (!hasPointBeforeStart) activeAtStart = sorted[0].v > 0 ? 1 : 0;

  const rawSegments = [];
  let cursor = startMs;
  let current = activeAtStart;

  for (const point of sorted) {
    if (point.t <= startMs) continue;
    if (point.t >= endMs) break;
    if (current > 0 && point.t > cursor) {
      rawSegments.push({ start: cursor, end: point.t });
    }
    cursor = point.t;
    current = point.v > 0 ? 1 : 0;
  }

  if (current > 0 && endMs > cursor) {
    rawSegments.push({ start: cursor, end: endMs });
  }

  const span = endMs - startMs;
  return rawSegments
    .map((segment) => {
      const start = Math.max(startMs, Math.min(segment.start, endMs));
      const end = Math.max(startMs, Math.min(segment.end, endMs));
      const leftPct = ((start - startMs) / span) * 100;
      const widthPct = ((end - start) / span) * 100;
      return { leftPct, widthPct };
    })
    .filter((segment) => segment.widthPct > 0.05);
}

export default function SaunaCard({
  cardId,
  settings,
  entities,
  dragProps,
  controls,
  cardStyle,
  editMode,
  customNames,
  customIcons,
  t,
  modals,
  tempHistoryById,
}) {
  const tr = useMemo(() => makeTr(t), [t]);
  const isLightTheme = typeof document !== 'undefined' && document.documentElement.dataset.theme === 'light';

  const saunaName = customNames?.[cardId] || settings?.name || tr('sauna.name', 'Badstue');
  const iconName = customIcons?.[cardId] || settings?.icon;
  const SaunaIcon = iconName ? (getIconComponent(iconName) || Flame) : Flame;

  const tempEntity = settings?.tempEntityId ? entities?.[settings.tempEntityId] : null;
  const thermostatEntity = settings?.thermostatEntityId ? entities?.[settings.thermostatEntityId] : null;
  const motionEntity = settings?.motionEntityId ? entities?.[settings.motionEntityId] : null;
  const flameEntity = settings?.flameEntityId ? entities?.[settings.flameEntityId] : null;

  const preheatMinutesEntity = settings?.preheatMinutesEntityId ? entities?.[settings.preheatMinutesEntityId] : null;
  const preheatMinutes = toNum(preheatMinutesEntity?.state);

  const manualModeEntity = settings?.manualModeEntityId ? entities?.[settings.manualModeEntityId] : null;
  const autoModeOn = isOn(manualModeEntity?.state);

  const saunaActiveBoolEntity = settings?.saunaActiveBooleanEntityId ? entities?.[settings.saunaActiveBooleanEntityId] : null;
  const saunaIsActive = isOn(saunaActiveBoolEntity?.state);

  const serviceEntity = settings?.serviceEntityId ? entities?.[settings.serviceEntityId] : null;
  const nextBookingEntity = settings?.nextBookingInMinutesEntityId ? entities?.[settings.nextBookingInMinutesEntityId] : null;
  const peopleNowEntity = settings?.peopleNowEntityId ? entities?.[settings.peopleNowEntityId] : null;
  const preheatWindowEntity = settings?.preheatWindowEntityId ? entities?.[settings.preheatWindowEntityId] : null;

  const lightIds = useMemo(() => asArray(settings?.lightEntityIds), [settings?.lightEntityIds]);
  const lockIds = useMemo(() => asArray(settings?.lockEntityIds), [settings?.lockEntityIds]);
  const doorIds = useMemo(() => asArray(settings?.doorEntityIds), [settings?.doorEntityIds]);
  const fanIds = useMemo(() => asArray(settings?.fanEntityIds), [settings?.fanEntityIds]);
  const thermostatIds = useMemo(() => asArray(settings?.thermostatEntityIds), [settings?.thermostatEntityIds]);
  const codeIds = useMemo(() => asArray(settings?.codeEntityIds), [settings?.codeEntityIds]);
  const tempOverviewIds = useMemo(() => asArray(settings?.tempOverviewEntityIds), [settings?.tempOverviewEntityIds]);
  const autoLockEntity = settings?.autoLockEntityId ? entities?.[settings.autoLockEntityId] : null;

  const currentTemp = tempEntity ? Number.parseFloat(tempEntity.state) : null;
  const tempIsValid = Number.isFinite(currentTemp);

  const thermostatOn = isOnish(thermostatEntity?.state);
  const motionOn = isOnish(motionEntity?.state);
  const flameOn = isOnish(flameEntity?.state);
  const peopleNow = peopleNowEntity?.state ?? '0';

  const lightsOn = countOn(lightIds, entities);
  const unlockedDoors = lockIds.filter((id) => norm(entities?.[id]?.state) === 'unlocked').length;
  const openDoors = countOn(doorIds, entities);
  const activeFans = countOn(fanIds, entities);
  const activeThermostats = countOn(thermostatIds, entities);
  const autoLockOn = isOn(autoLockEntity?.state);

  const warmTempC = Number.isFinite(Number(settings?.warmTempC)) ? Number(settings.warmTempC) : 35;
  const isWarmByTemp = tempIsValid && currentTemp >= warmTempC;

  const serviceState = serviceEntity?.state ?? '';
  const serviceNorm = norm(serviceState);
  const serviceYes = ['ja', 'yes', 'on', 'true', '1', 'service', 'active'].includes(serviceNorm);
  const serviceNo = ['nei', 'no', 'off', 'false', '0', 'inactive'].includes(serviceNorm);
  const nextMinutes = toNum(nextBookingEntity?.state);
  const hasNext = nextMinutes != null && nextMinutes >= 0;
  const preheatOn = isOn(preheatWindowEntity?.state);

  const imageUrl = useMemo(() => resolveImageUrl(settings, entities), [settings, entities]);

  const statusGraphEntityId = settings?.statusGraphEntityId || settings?.tempEntityId;

  const tempSeries = useMemo(() => {
    if (!statusGraphEntityId) return [];
    const windowEnd = Date.now();
    const windowStart = windowEnd - STATUS_GRAPH_WINDOW_MS;
    const raw = tempHistoryById?.[statusGraphEntityId];
    const extracted = extractHistorySeries(raw)
      .filter((point) => point.t >= windowStart && point.t <= windowEnd);
    if (extracted.length > 1) return extracted;
    if (extracted.length === 1) {
      const value = extracted[0].v;
      return [
        { t: windowStart, v: value },
        { t: windowEnd, v: value },
      ];
    }

    if (tempIsValid) {
      return [
        { t: windowStart, v: currentTemp },
        { t: windowEnd, v: currentTemp },
      ];
    }

    return [];
  }, [statusGraphEntityId, tempHistoryById, tempIsValid, currentTemp]);
  const statusWindow = useMemo(() => {
    const end = tempSeries.length > 0
      ? Math.max(tempSeries[tempSeries.length - 1]?.t || 0, tempSeries[0]?.t || 0)
      : Date.now();
    const start = end - STATUS_GRAPH_WINDOW_MS;
    return { start, end };
  }, [tempSeries]);
  const statusHistory = useMemo(
    () => tempSeries.map((p) => ({ value: p.v, time: new Date(p.t) })),
    [tempSeries]
  );
  const bookingStateSeries = useMemo(() => {
    const bookingEntityId = settings?.saunaActiveBooleanEntityId;
    if (!bookingEntityId) return [];
    const raw = tempHistoryById?.[bookingEntityId];
    return extractStateSeries(raw, ['on', 'true', '1', 'yes']);
  }, [settings?.saunaActiveBooleanEntityId, tempHistoryById]);
  const serviceStateSeries = useMemo(() => {
    const serviceEntityId = settings?.serviceEntityId;
    if (!serviceEntityId) return [];
    const raw = tempHistoryById?.[serviceEntityId];
    return extractStateSeries(raw, ['ja', 'yes', 'on', 'true', '1', 'service', 'active']);
  }, [settings?.serviceEntityId, tempHistoryById]);
  const statusOverlaySegments = useMemo(() => {
    const start = statusWindow.start;
    const end = statusWindow.end;
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];

    const bookingSegments = buildOverlaySegments(bookingStateSeries, start, end)
      .map((segment, index) => ({
        id: `booking-${index}`,
        ...segment,
        className: isLightTheme
          ? 'bg-sky-500/16 border border-sky-600/25'
          : 'bg-sky-400/12 border border-sky-300/20',
      }));
    const serviceSegments = buildOverlaySegments(serviceStateSeries, start, end)
      .map((segment, index) => ({
        id: `service-${index}`,
        ...segment,
        className: isLightTheme
          ? 'bg-rose-500/12 border border-rose-600/25'
          : 'bg-rose-400/10 border border-rose-300/20',
      }));
    return [...bookingSegments, ...serviceSegments];
  }, [statusWindow, bookingStateSeries, serviceStateSeries, isLightTheme]);
  const statusTimeLabels = useMemo(() => {
    const first = statusWindow.start;
    const last = statusWindow.end;
    if (!Number.isFinite(first) || !Number.isFinite(last)) return null;
    const mid = first + ((last - first) / 2);
    const fmt = (ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return { left: fmt(first), mid: fmt(mid), right: fmt(last) };
  }, [statusWindow]);
  const openFieldModal = (title, entityIds, options = {}) => {
    if (editMode) return;
    const ids = asArray(entityIds);
    if (!ids.length) return;
    modals?.setActiveSaunaFieldModal?.({ title, entityIds: ids, cardId, ...options });
  };

  const openGlobalLightModal = () => {
    if (editMode) return;
    const target = settings?.lightsModalEntityId || lightIds?.[0];
    if (!target) return;
    if (modals?.setShowLightModal) {
      modals.setShowLightModal({
        lightId: target,
        lightIds: lightIds.length ? lightIds : [target],
      });
    }
    else openFieldModal(tr('sauna.lights', 'Lys'), lightIds);
  };
  const canOpenStatusGraph = Boolean(
    !editMode
    && statusGraphEntityId
    && entities?.[statusGraphEntityId]
    && modals?.setShowSensorInfoModal
  );
  const openStatusGraphModal = () => {
    if (!canOpenStatusGraph) return;
    const bookingEntityId = settings?.saunaActiveBooleanEntityId;
    const serviceEntityId = settings?.serviceEntityId;
    const overlayEntities = [
      bookingEntityId && {
        entityId: bookingEntityId,
        label: tr('sauna.active', 'Aktiv'),
        color: '#38bdf8',
        activeStates: ['on', 'true', '1', 'yes'],
        initialState: entities?.[bookingEntityId]?.state,
      },
      serviceEntityId && {
        entityId: serviceEntityId,
        label: tr('sauna.service', 'Service'),
        color: '#ef4444',
        activeStates: ['ja', 'yes', 'on', 'true', '1', 'service', 'active'],
        initialState: entities?.[serviceEntityId]?.state,
      },
    ].filter(Boolean);
    modals.setShowSensorInfoModal({
      entityId: statusGraphEntityId,
      customName: `${saunaName} - ${tr('sauna.tempOverview', 'Temperaturoversikt')}`,
      overlayEntities,
    });
  };
  const openTemperatureGraph = () => {
    if (editMode) return;
    if (canOpenStatusGraph) {
      openStatusGraphModal();
      return;
    }
    if (statusGraphEntityId) {
      openFieldModal(tr('sauna.currentTempNow', 'Temp i badstuen nå'), [statusGraphEntityId]);
    }
  };
  const openPreheatQuickAction = () => {
    if (editMode) return;
    if (canOpenStatusGraph || statusGraphEntityId) {
      openTemperatureGraph();
      return;
    }
    if (settings?.preheatMinutesEntityId) {
      openFieldModal(tr('sauna.preheatTime', 'Oppvarmingstid'), [settings.preheatMinutesEntityId]);
    }
  };

  const modePill = {
    label: autoModeOn ? tr('sauna.autoMode', 'Auto') : tr('sauna.manualMode', 'Manuell'),
    cls: autoModeOn ? 'bg-emerald-500/16 border-emerald-400/22 text-emerald-200' : 'bg-orange-500/18 border-orange-400/25 text-orange-200',
  };
  const lightModePillClass = autoModeOn
    ? 'bg-emerald-100 border-emerald-500 text-emerald-900 shadow-[0_0_0_1px_rgba(16,185,129,0.2)]'
    : 'bg-orange-100 border-orange-400 text-orange-900';
  const lightTonePill = {
    hot: 'bg-orange-100 border-orange-400 text-orange-900',
    warm: 'bg-amber-100 border-amber-400 text-amber-900',
    ok: 'bg-emerald-100 border-emerald-500 text-emerald-900 shadow-[0_0_0_1px_rgba(16,185,129,0.2)]',
    info: 'bg-blue-100 border-blue-400 text-blue-900',
    warn: 'bg-orange-100 border-orange-400 text-orange-900',
    danger: 'bg-rose-100 border-rose-400 text-rose-900',
    muted: 'bg-white/80 border-slate-300 text-slate-700',
  };

  const primaryState = (() => {
    if (saunaIsActive && serviceYes) return { label: tr('sauna.service', 'Service'), desc: tr('sauna.serviceOngoing', 'Pågår nå'), tone: 'warn' };
    if (saunaIsActive) return { label: tr('sauna.active', 'Aktiv'), desc: tr('sauna.bookingNow', 'Pågående økt'), tone: 'ok' };
    if (preheatOn) return { label: tr('sauna.preheat', 'Forvarmer'), desc: hasNext ? `${tr('sauna.next', 'Neste')}: ${Math.round(nextMinutes)}m` : tr('sauna.beforeBooking', 'Før booking'), tone: 'warm' };
    if (isWarmByTemp) return { label: tr('sauna.warm', 'Varm'), desc: tr('sauna.readySoon', 'Snart klar'), tone: 'warm' };
    if (thermostatOn) return { label: tr('common.on', 'På'), desc: tr('sauna.standby', 'Standby'), tone: 'info' };
    return { label: tr('common.off', 'Av'), desc: hasNext ? `${tr('sauna.next', 'Neste')}: ${Math.round(nextMinutes)}m` : tr('sauna.inactive', 'Inaktiv'), tone: 'muted' };
  })();

  const tone = ({
    hot: { pill: 'bg-orange-500/18 border-orange-400/25 text-orange-200', icon: 'text-orange-300' },
    warm: { pill: 'bg-amber-500/14 border-amber-400/20 text-amber-200', icon: 'text-amber-300' },
    ok: { pill: 'bg-emerald-500/20 border-emerald-500/40 text-emerald-700 dark:text-emerald-200', icon: 'text-emerald-600 dark:text-emerald-300' },
    info: { pill: 'bg-blue-500/14 border-blue-400/20 text-blue-200', icon: 'text-blue-300' },
    warn: { pill: 'bg-orange-500/14 border-orange-400/20 text-orange-200', icon: 'text-orange-300' },
    danger: { pill: 'bg-rose-500/14 border-rose-400/20 text-rose-200', icon: 'text-rose-300' },
    muted: { pill: 'bg-[var(--glass-bg-hover)] border-[var(--glass-border)] text-[var(--text-secondary)]', icon: 'text-[var(--text-secondary)]' },
  }[primaryState.tone] || { pill: 'bg-[var(--glass-bg-hover)] border-[var(--glass-border)] text-[var(--text-secondary)]', icon: 'text-[var(--text-secondary)]' });
  const statusPillClass = isLightTheme
    ? (lightTonePill[primaryState.tone] || lightTonePill.muted)
    : tone.pill;
  const heatingPillClass = isLightTheme
    ? 'bg-orange-100/95 border-orange-500/65 text-orange-900 shadow-[0_6px_14px_rgba(15,23,42,0.18)] backdrop-blur-sm'
    : 'bg-orange-500/18 border-orange-400/25 text-orange-200';

  const minutesShort = tr('sauna.minutesShort', 'min');
  const bookingLine = (() => {
    const hasAny =
      settings?.nextBookingInMinutesEntityId ||
      settings?.serviceEntityId ||
      settings?.preheatWindowEntityId;

    if (!hasAny || settings?.showBookingOverview === false) return null;

    const next = Number.isFinite(nextMinutes) ? Math.round(nextMinutes) : -1;

    if (serviceYes) return tr('sauna.service', 'Service');
    if (serviceNo) return tr('sauna.normalBooking', 'Vanlig booking');
    if (next >= 0) return `${tr('sauna.nextBookingIn', 'Neste booking om')} ${next} ${minutesShort}`;
    return tr('sauna.noUpcomingBookingsToday', 'Ingen kommende bookinger i dag');
  })();

  const statusVisual = (() => {
    const next = Number.isFinite(nextMinutes) ? Math.round(nextMinutes) : -1;
    if (saunaIsActive && serviceYes) return { icon: Wrench, color: preheatOn ? 'text-orange-300' : 'text-emerald-300' };
    if (saunaIsActive) return { icon: SaunaIcon, color: 'text-emerald-300' };
    if (preheatOn) return { icon: Flame, color: 'text-orange-300' };
    return { icon: Power, color: next === -1 ? 'text-[var(--text-muted)]' : 'text-violet-300' };
  })();

  const iconFor = (customIcon, fallback) => (customIcon ? (getIconComponent(customIcon) || fallback) : fallback);
  const statItems = [
    settings?.showThermostat !== false && { key: 'thermostat', icon: iconFor(settings?.thermostatIcon, Shield), title: tr('sauna.thermostat', 'Termostat'), value: thermostatOn ? tr('common.on', 'På') : tr('common.off', 'Av'), active: thermostatOn, onClick: () => openFieldModal(tr('sauna.thermostat', 'Termostat'), [settings?.thermostatEntityId]), clickable: Boolean(settings?.thermostatEntityId), category: 'control' },
    settings?.showLights !== false && { key: 'lights', icon: iconFor(settings?.lightsIcon, Lightbulb), title: tr('sauna.lights', 'Lys'), value: lightIds.length ? `${lightsOn}/${lightIds.length} ${tr('common.on', 'på')}` : '--', active: lightsOn > 0, onClick: openGlobalLightModal, clickable: Boolean(settings?.lightsModalEntityId || lightIds?.length), category: 'control' },
    settings?.showFans !== false && { key: 'fans', icon: iconFor(settings?.fansIcon, Fan), title: tr('sauna.fans', 'Vifter'), value: fanIds.length ? `${activeFans}/${fanIds.length} ${tr('common.on', 'på')}` : '--', active: activeFans > 0, onClick: () => openFieldModal(tr('sauna.fans', 'Vifter'), fanIds, { fieldType: 'fan' }), clickable: fanIds.length > 0, category: 'control' },
    settings?.showThermostatOverview !== false && { key: 'thermostatGroup', icon: iconFor(settings?.thermostatsIcon, Shield), title: tr('sauna.thermostats', 'Termostater'), value: thermostatIds.length ? `${activeThermostats}/${thermostatIds.length} ${tr('common.on', 'på')}` : '--', active: activeThermostats > 0, onClick: () => openFieldModal(tr('sauna.thermostats', 'Termostater'), thermostatIds), clickable: thermostatIds.length > 0, category: 'control' },
    settings?.showActiveCodes !== false && { key: 'codes', icon: iconFor(settings?.codesIcon, Hash), title: tr('sauna.activeCodes', 'Aktive koder'), value: codeIds.length ? `${codeIds.length}` : '--', active: codeIds.length > 0, onClick: () => openFieldModal(tr('sauna.activeCodes', 'Aktive koder'), codeIds, { fieldType: 'number', numberMode: 'code', numberMaxDigits: 4 }), clickable: codeIds.length > 0, category: 'safety' },
    settings?.showAutoLock !== false && { key: 'autoLock', icon: iconFor(settings?.autoLockIcon, ToggleRight), title: tr('sauna.autoLock', 'Autolåsing'), value: autoLockOn ? tr('common.on', 'På') : tr('common.off', 'Av'), active: autoLockOn, onClick: () => openFieldModal(tr('sauna.autoLock', 'Autolåsing'), [settings?.autoLockEntityId], { fieldType: 'switch' }), clickable: Boolean(settings?.autoLockEntityId), category: 'safety' },
    settings?.showDoors !== false && { key: 'doors', icon: iconFor(settings?.doorsIcon, DoorOpen), title: tr('sauna.doors', 'Dør'), value: `${openDoors} ${openDoors === 1 ? tr('sauna.openShort', 'åpen') : tr('sauna.openShortPlural', 'åpne')}`, active: openDoors > 0, onClick: () => openFieldModal(tr('sauna.doors', 'Dører'), doorIds, { fieldType: 'door' }), clickable: doorIds.length > 0, category: 'safety' },
    settings?.showLocks !== false && { key: 'locks', icon: iconFor(settings?.locksIcon, Lock), title: tr('sauna.locks', 'Lås'), value: `${unlockedDoors} ${unlockedDoors === 1 ? tr('sauna.unlockedShort', 'ulåst') : tr('sauna.unlockedShortPlural', 'ulåste')}`, active: unlockedDoors > 0, onClick: () => openFieldModal(tr('sauna.locks', 'Låser'), lockIds, { fieldType: 'lock' }), clickable: lockIds.length > 0, category: 'safety' },
    settings?.showMotion !== false && { key: 'motion', icon: iconFor(settings?.motionIcon, Activity), title: tr('sauna.motion', 'Bevegelse'), value: motionOn ? tr('sauna.motionDetected', 'Registrert') : tr('sauna.noMotion', 'Ingen'), active: motionOn, onClick: () => openFieldModal(tr('sauna.motion', 'Bevegelse'), [settings?.motionEntityId], { fieldType: 'motion' }), clickable: Boolean(settings?.motionEntityId), category: 'safety' },
  ].filter(Boolean);

  const controlStats = statItems.filter((item) => item.category === 'control');
  const safetyStats = statItems.filter((item) => item.category === 'safety');

  const tempOverview = settings?.showTempOverview !== false
    ? tempOverviewIds.map((id) => ({ id, ent: entities?.[id] })).filter(({ ent }) => ent).slice(0, 4)
    : [];

  const tempValues = tempOverview.map(({ ent }) => Number(ent?.state)).filter((v) => Number.isFinite(v));
  const tempMin = tempValues.length ? Math.min(...tempValues) : null;
  const tempMax = tempValues.length ? Math.max(...tempValues) : null;
  const tempAvg = tempValues.length ? (tempValues.reduce((a, b) => a + b, 0) / tempValues.length) : null;
  const tempStatLabels = {
    min: tr('sauna.minLabel', 'min'),
    avg: tr('sauna.avgLabel', 'avg'),
    max: tr('sauna.maxLabel', 'max'),
  };

  const renderStatSection = (title, items) => items.length > 0 && (
    <div className="space-y-2">
      <div className="text-[10px] uppercase tracking-[0.24em] font-extrabold text-[var(--text-secondary)] px-1">{title}</div>
      <div className="grid grid-cols-2 gap-2">
        {items.map((item) => {
          const Icon = item.icon;
          const clickable = Boolean(item.onClick) && !editMode && (item.clickable ?? true);
          return (
            <button
              type="button"
              key={item.key}
              onClick={clickable ? item.onClick : undefined}
              className={cx('rounded-2xl px-3 py-3 border flex items-center gap-2 text-left transition', clickable ? 'active:scale-[0.99] cursor-pointer' : 'cursor-default', item.active ? 'bg-emerald-500/18 border-emerald-500/35' : 'bg-[var(--glass-bg-hover)] border-[var(--glass-border)]')}
            >
              <Icon className={cx('w-4 h-4', item.active ? 'text-emerald-600 dark:text-emerald-300' : 'text-[var(--text-secondary)]')} />
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-widest font-extrabold text-[var(--text-secondary)] truncate">{item.title}</div>
                <div className={cx('text-sm text-[var(--text-primary)] truncate', isLightTheme ? 'font-normal' : 'font-extrabold')}>{item.value}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div
      {...dragProps}
      data-haptic={editMode ? undefined : 'card'}
      className={cx('touch-feedback relative p-5 rounded-[2.5rem] transition-all duration-300 overflow-hidden font-sans h-full', 'border border-[var(--glass-border)] bg-[var(--glass-bg)]', !editMode ? 'cursor-pointer active:scale-[0.98]' : 'cursor-move')}
      style={cardStyle}
    >
      {controls}

      <div className="relative z-10 h-full min-h-0 flex flex-col overflow-y-auto custom-scrollbar pr-1">
        <div className="grid grid-cols-3 items-start gap-4">
          <div className="min-w-0 space-y-2">
            <div className="flex items-center gap-3 min-w-0">
              <div className={cx(
                'w-12 h-12 rounded-full flex items-center justify-center border',
                flameOn && isLightTheme
                  ? 'bg-orange-100 border-orange-300/80'
                  : (!flameOn && isLightTheme
                    ? 'bg-slate-100 border-slate-300/80'
                    : 'bg-[var(--glass-bg-hover)] border-[var(--glass-border)]')
              )}>
                {flameOn ? (
                  <FlameAnimated className="w-6 h-6" isLightTheme={isLightTheme} />
                ) : (
                  <div className="relative w-6 h-6" aria-label={tr('sauna.notHeating', 'Varmer ikke')}>
                    <Flame className={cx('w-6 h-6', isLightTheme ? 'text-slate-700' : 'text-slate-300')} />
                    <span
                      className={cx(
                        'absolute left-1/2 top-1/2 w-7 h-[2px] -translate-x-1/2 -translate-y-1/2 -rotate-[34deg] rounded-full',
                        isLightTheme
                          ? 'bg-slate-800/80 shadow-[0_0_0_1px_rgba(255,255,255,0.55)]'
                          : 'bg-white/75'
                      )}
                    />
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <h3 className="text-lg font-bold text-[var(--text-primary)] truncate">{saunaName}</h3>
              </div>
            </div>
            {flameOn && (
              <button
                type="button"
                onClick={() => openFieldModal(tr('sauna.heating', 'Varmer'), [settings?.flameEntityId])}
                className={cx(
                  'px-2.5 py-1 rounded-full border text-[10px] uppercase tracking-widest inline-flex items-center',
                  heatingPillClass,
                  isLightTheme ? 'font-semibold' : 'font-extrabold'
                )}
              >
                {tr('sauna.heating', 'Varmer')}
              </button>
            )}
          </div>

          <div className="flex justify-center">
            <div className="relative w-40 h-40">
              {(settings?.peopleNowEntityId || (serviceYes && settings?.serviceEntityId)) && (
                <button
                  type="button"
                  onClick={() => {
                    if (serviceYes && settings?.serviceEntityId) {
                      openFieldModal(tr('sauna.service', 'Service'), [settings?.serviceEntityId]);
                      return;
                    }
                    openFieldModal(tr('sauna.peopleNow', 'Antall folk nå'), [settings?.peopleNowEntityId], { fieldType: 'number' });
                  }}
                  className={cx(
                    'absolute top-0 left-1/2 -translate-x-1/2 min-w-[2.7rem] h-10 px-3 rounded-full border flex items-center justify-center text-2xl font-extrabold z-20 shadow-lg',
                    serviceYes
                      ? (isLightTheme
                        ? 'border-amber-400/80 bg-amber-100 text-amber-700 shadow-amber-300/40'
                        : 'border-amber-400/40 bg-amber-500/25 text-amber-100 shadow-amber-900/40')
                      : (isLightTheme
                        ? 'border-slate-300/70 bg-white text-slate-800 shadow-slate-300/40'
                        : 'border-emerald-400/25 bg-emerald-500/20 text-emerald-100 shadow-emerald-900/30')
                  )}
                >
                  {serviceYes ? <Wrench className="w-5 h-5" /> : peopleNow}
                </button>
              )}
              <div className={cx(
                'relative w-40 h-40 rounded-full overflow-hidden border border-[var(--glass-border)] bg-[var(--glass-bg-hover)]',
                isLightTheme ? 'shadow-[0_8px_24px_rgba(15,23,42,0.18)]' : 'shadow-[0_16px_45px_rgba(0,0,0,0.45)]'
              )}>
                {imageUrl ? <img src={imageUrl} alt={saunaName} className="w-full h-full object-cover" draggable={false} /> : <div className="w-full h-full bg-gradient-to-br from-white/10 to-black/20" />}
                <div className="absolute inset-0 rounded-full ring-1 ring-white/10" />
                <div
                  className={cx(
                    'absolute bottom-2 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-full border text-[10px] uppercase tracking-widest whitespace-nowrap backdrop-blur-sm shadow-[0_8px_16px_rgba(0,0,0,0.24)]',
                    statusPillClass,
                    isLightTheme ? 'font-semibold' : 'font-extrabold'
                  )}
                >
                  <span className="align-middle">{primaryState.label}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="text-right flex flex-col items-end gap-2">
            {settings?.showManualMode !== false && settings?.manualModeEntityId && (
              <button
                type="button"
                onClick={() => openFieldModal(tr('sauna.manualMode', 'Modus'), [settings.manualModeEntityId], { fieldType: 'switch' })}
                className={cx(
                  'px-4 py-2 rounded-full text-[12px] uppercase tracking-widest border',
                  modePill.cls,
                  isLightTheme ? `font-semibold ${lightModePillClass}` : 'font-extrabold'
                )}
              >
                {modePill.label}
              </button>
            )}
          </div>
        </div>

        {(bookingLine || preheatOn) && (() => {
          const BookingIcon = statusVisual.icon;
          return (
            <div
              className={cx('mt-6 relative min-h-[7.8rem] pb-5', canOpenStatusGraph ? 'cursor-pointer' : '')}
              onClick={canOpenStatusGraph ? openStatusGraphModal : undefined}
              onKeyDown={canOpenStatusGraph ? (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  openStatusGraphModal();
                }
              } : undefined}
              role={canOpenStatusGraph ? 'button' : undefined}
              tabIndex={canOpenStatusGraph ? 0 : undefined}
              aria-label={canOpenStatusGraph ? tr('sensorInfo.title', 'Sensor detaljer') : undefined}
            >
              <div className="relative z-20 flex items-center justify-center mb-2">
                <div className="flex items-center justify-center gap-2 min-w-0 text-center px-2 py-0.5 rounded-full bg-black/20 shadow-[0_2px_8px_rgba(0,0,0,0.35)]">
                  <BookingIcon className={cx('w-4 h-4 shrink-0', statusVisual.color)} />
                  <p className="text-sm font-normal text-[var(--text-primary)] truncate">{bookingLine || tr('sauna.preheat', 'Forvarmer')}</p>
                </div>
              </div>
              {statusHistory.length > 0 && (
                <div className="absolute inset-x-2 top-8 h-[4.4rem] opacity-85 pointer-events-none overflow-hidden rounded-lg">
                  {statusOverlaySegments.map((segment) => (
                    <span
                      key={segment.id}
                      className={cx('absolute inset-y-1 rounded-md', segment.className)}
                      style={{ left: `${segment.leftPct}%`, width: `${segment.widthPct}%` }}
                    />
                  ))}
                  <SparkLine data={statusHistory} height={72} currentIndex={statusHistory.length - 1} fade minValue={0} maxValue={100} />
                </div>
              )}
              {statusOverlaySegments.length > 0 && (
                <div className="absolute right-2 top-8 z-10 flex items-center gap-1.5 text-[9px] leading-none pointer-events-none">
                  <span className={cx('inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border', isLightTheme ? 'bg-sky-100/80 border-sky-500/30 text-sky-800' : 'bg-sky-500/15 border-sky-300/25 text-sky-100')}>
                    <span className={cx('w-1.5 h-1.5 rounded-full', isLightTheme ? 'bg-sky-600' : 'bg-sky-300')} />
                    {tr('sauna.active', 'Aktiv')}
                  </span>
                  <span className={cx('inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border', isLightTheme ? 'bg-rose-100/80 border-rose-500/30 text-rose-800' : 'bg-rose-500/15 border-rose-300/25 text-rose-100')}>
                    <span className={cx('w-1.5 h-1.5 rounded-full', isLightTheme ? 'bg-rose-600' : 'bg-rose-300')} />
                    {tr('sauna.service', 'Service')}
                  </span>
                </div>
              )}
              <div className={cx('absolute left-2 top-9 h-[4.0rem] z-10 flex flex-col justify-between text-[10px] leading-none pointer-events-none', isLightTheme ? 'text-slate-900/90' : 'text-orange-200/80')}>
                <span>100°</span>
                <span>0°</span>
              </div>
              <div className={cx('absolute right-2 top-9 h-[4.0rem] z-10 flex items-center text-[10px] leading-none pointer-events-none', isLightTheme ? 'text-slate-900/90' : 'text-orange-200/80')}>
                <span>{tempIsValid ? `${currentTemp.toFixed(1)}°` : '--'}</span>
              </div>
              {statusTimeLabels && (
                <div className={cx('absolute inset-x-2 bottom-0 z-10 flex items-center justify-between text-[10px] leading-none pointer-events-none', isLightTheme ? 'text-slate-900/90' : 'text-orange-200/80')}>
                  <span>{statusTimeLabels.left}</span>
                  <span>{statusTimeLabels.mid}</span>
                  <span>{statusTimeLabels.right}</span>
                </div>
              )}
            </div>
          );
        })()}


        <div className="mt-4 grid grid-cols-3 gap-4 items-end">
          <button
            type="button"
            onClick={openTemperatureGraph}
            className={cx(
              'col-span-2 px-3 py-3 relative overflow-hidden text-left',
              !editMode ? 'cursor-pointer active:scale-[0.99]' : 'cursor-default'
            )}
          >
            <div className="mt-2 text-[10px] uppercase tracking-widest font-bold text-[var(--text-secondary)]">{tr('sauna.currentTempNow', 'Temp i badstuen nå')}</div>
            <div className="mt-4 flex items-end gap-2 relative">
              <Thermometer className="w-4 h-4 text-[var(--text-secondary)] mb-1" />
              <span className="text-5xl font-semibold leading-none tabular-nums text-[var(--text-primary)]">{tempIsValid ? currentTemp.toFixed(1) : '--'}</span>
              <span className="text-2xl text-[var(--text-secondary)] mb-1">°C</span>
            </div>
          </button>

          <button
            type="button"
            onClick={openPreheatQuickAction}
            className={cx(
              'col-span-1 text-right px-3 py-3 relative overflow-hidden',
              !editMode ? 'cursor-pointer active:scale-[0.99]' : 'cursor-default'
            )}
          >
            <div className="mt-8 text-[10px] uppercase tracking-widest font-bold text-[var(--text-secondary)]">{tr('sauna.preheatTime', 'Oppvarmingstid')}</div>
            <div className="text-3xl font-bold text-[var(--text-primary)] leading-tight">{preheatMinutes != null ? `${Math.round(preheatMinutes)}` : '--'}</div>
            <div className="text-base font-bold text-[var(--text-secondary)]">{minutesShort}</div>
          </button>
        </div>

        <div className="mt-4 space-y-4">
          {tempOverview.length > 0 && (
            <button
              type="button"
              onClick={() => openFieldModal(tr('sauna.tempOverview', 'Temperaturoversikt'), tempOverviewIds)}
              className="w-full rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg-hover)] p-3 text-left"
            >
              <div className="flex items-center justify-between gap-2 mb-2 px-1">
                <div className="text-[10px] uppercase tracking-[0.24em] font-extrabold text-[var(--text-secondary)]">{tr('sauna.tempOverview', 'Temperaturoversikt')}</div>
                <div className="flex items-center gap-1.5 text-[10px]">
                  <span className="px-2 py-0.5 rounded-full border border-cyan-400/20 bg-cyan-500/10 text-cyan-200">{tempStatLabels.min} {tempMin != null ? tempMin.toFixed(1) : '--'}°</span>
                  <span className="px-2 py-0.5 rounded-full border border-violet-400/20 bg-violet-500/10 text-violet-200">{tempStatLabels.avg} {tempAvg != null ? tempAvg.toFixed(1) : '--'}°</span>
                  <span className="px-2 py-0.5 rounded-full border border-rose-400/20 bg-rose-500/10 text-rose-200">{tempStatLabels.max} {tempMax != null ? tempMax.toFixed(1) : '--'}°</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {tempOverview.map(({ id, ent }) => {
                  const val = Number(ent?.state);
                  const hasVal = Number.isFinite(val);
                  const heatTone = hasVal && tempMax != null && val >= tempMax ? 'border-rose-400/30 bg-rose-500/10' : hasVal && tempMin != null && val <= tempMin ? 'border-cyan-400/30 bg-cyan-500/10' : 'border-[var(--glass-border)] bg-[var(--glass-bg)]';
                  return (
                    <div key={id} className={`rounded-xl px-3 py-2 border text-left ${heatTone}`}>
                      <div className="text-[10px] uppercase tracking-widest font-bold text-[var(--text-secondary)] truncate">{ent.attributes?.friendly_name || id}</div>
                      <div className="mt-1 flex items-end gap-1">
                        <span className="text-xl font-extrabold text-[var(--text-primary)] leading-none">{hasVal ? val.toFixed(1) : ent.state}</span>
                        <span className="text-xs text-[var(--text-secondary)] mb-0.5">{hasVal ? '°C' : ''}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </button>
          )}

          {renderStatSection(tr('sauna.controls', 'Styring'), controlStats)}
          {renderStatSection(tr('sauna.safetyStatus', 'Sikkerhet og status'), safetyStats)}
        </div>

        {settings?.showThresholdHint && (
          <div className="mt-3 text-[11px] text-[var(--text-secondary)]">
            {`${tr('sauna.warm', 'Varm')} ≥ ${warmTempC}°C`}
          </div>
        )}
      </div>
    </div>
  );
}
