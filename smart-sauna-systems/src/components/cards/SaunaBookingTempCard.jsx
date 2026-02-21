import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Clock, Flame, Thermometer, TrendingUp, Wrench, X, Trash2 } from '../../icons';
import { getIconComponent } from '../../icons';
import SparkLine from '../charts/SparkLine';

const DEFAULT_ACTIVE_STATES = ['on', 'true', '1', 'yes', 'active', 'booked', 'occupied', 'aktiv'];
const DEFAULT_SERVICE_STATES = ['ja', 'yes', 'service', 'on', 'true', '1', 'active', 'aktiv'];

const clamp = (value, min, max, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
};

const toNum = (value) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const roundToOne = (value) => Math.round(Number(value) * 10) / 10;
const toHourKey = (timestampMs) => {
  const date = new Date(timestampMs);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  return `${year}-${month}-${day}-${hour}`;
};

const normalizeState = (value) => String(value ?? '').trim().toLowerCase();

const parseStateArray = (rawValue, fallback) => {
  if (Array.isArray(rawValue) && rawValue.length > 0) {
    return rawValue
      .map((state) => normalizeState(state))
      .filter(Boolean);
  }
  return fallback;
};

const isStateActive = (value, states) => parseStateArray(states, DEFAULT_ACTIVE_STATES).includes(normalizeState(value));

const normalizeSnapshots = (rawValue) => {
  if (!Array.isArray(rawValue)) return [];
  return rawValue
    .map((entry, index) => {
      const timestamp = String(entry?.timestamp || entry?.time || '').trim();
      const timestampMs = Date.parse(timestamp);
      const startTemp = toNum(entry?.startTemp ?? entry?.temperature ?? entry?.temp);
      if (!Number.isFinite(timestampMs) || startTemp === null) return null;
      const targetTemp = toNum(entry?.targetTemp);
      const providedDeviation = toNum(entry?.deviation);
      const deviation = providedDeviation !== null
        ? roundToOne(providedDeviation)
        : (targetTemp !== null ? roundToOne(startTemp - targetTemp) : null);
      const bookingType = String(entry?.bookingType || 'regular').toLowerCase() === 'service'
        ? 'service'
        : 'regular';
      return {
        id: String(entry?.id || `${timestamp}_${index}`),
        timestamp,
        timestampMs,
        hourKey: String(entry?.hourKey || toHourKey(timestampMs)),
        startTemp: roundToOne(startTemp),
        targetTemp,
        deviation,
        bookingType,
        sampleMode: String(entry?.sampleMode || 'hourly'),
        serviceRaw: entry?.serviceRaw ?? null,
        activeRaw: entry?.activeRaw ?? null,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.timestampMs - b.timestampMs);
};

const serializeSnapshots = (snapshots) => snapshots.map((entry) => ({
  id: entry.id,
  timestamp: entry.timestamp,
  hourKey: entry.hourKey,
  startTemp: entry.startTemp,
  targetTemp: entry.targetTemp,
  deviation: entry.deviation,
  bookingType: entry.bookingType,
  sampleMode: entry.sampleMode,
  serviceRaw: entry.serviceRaw,
  activeRaw: entry.activeRaw,
}));

const formatDateTime = (timestampMs) => {
  if (!Number.isFinite(timestampMs)) return '--';
  return new Date(timestampMs).toLocaleString([], {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatSince = (timestampMs) => {
  if (!Number.isFinite(timestampMs)) return '--';
  const deltaMin = Math.max(0, Math.round((Date.now() - timestampMs) / 60000));
  if (deltaMin < 1) return 'now';
  if (deltaMin < 60) return `${deltaMin}m`;
  const hours = Math.floor(deltaMin / 60);
  const minutes = deltaMin % 60;
  if (hours < 24) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours > 0 ? `${days}d ${restHours}h` : `${days}d`;
};

const getTempStats = (entries) => {
  if (!Array.isArray(entries) || entries.length === 0) return null;
  const values = entries
    .map((entry) => toNum(entry?.startTemp))
    .filter((value) => value !== null);
  if (!values.length) return null;
  return {
    min: roundToOne(Math.min(...values)),
    max: roundToOne(Math.max(...values)),
    avg: roundToOne(values.reduce((sum, value) => sum + value, 0) / values.length),
    latest: roundToOne(values[values.length - 1]),
  };
};

function makeTr(t) {
  return (key, fallback) => {
    const out = typeof t === 'function' ? t(key) : undefined;
    const str = String(out ?? '');
    const looksLikeKey = !str || str === key || str.toLowerCase() === key.toLowerCase() || str === str.toUpperCase() || str.includes('.');
    return looksLikeKey ? fallback : str;
  };
}

export default function SaunaBookingTempCard({
  cardId,
  settings,
  settingsKey,
  entities,
  dragProps,
  controls,
  cardStyle,
  editMode,
  customNames,
  customIcons,
  saveCardSetting,
  t,
}) {
  const tr = useMemo(() => makeTr(t), [t]);

  const cardName = customNames?.[cardId] || settings?.name || tr('sauna.bookingTemp.title', 'Sauna hourly KPI log');
  const iconName = customIcons?.[cardId] || settings?.icon;
  const CardIcon = iconName ? (getIconComponent(iconName) || Thermometer) : Thermometer;

  const tempEntityId = settings?.tempEntityId || '';
  const activeEntityId = settings?.bookingActiveEntityId || '';
  const serviceEntityId = settings?.serviceEntityId || '';
  const targetTempEntityId = settings?.targetTempEntityId || '';

  const tempEntity = tempEntityId ? entities?.[tempEntityId] : null;
  const activeEntity = activeEntityId ? entities?.[activeEntityId] : null;
  const serviceEntity = serviceEntityId ? entities?.[serviceEntityId] : null;
  const targetEntity = targetTempEntityId ? entities?.[targetTempEntityId] : null;

  const currentTemp = toNum(tempEntity?.state);
  const targetTempSetting = toNum(settings?.targetTempValue);
  const targetTemp = targetTempSetting !== null ? targetTempSetting : toNum(targetEntity?.state);
  const bookingActive = activeEntity ? isStateActive(activeEntity.state, settings?.activeOnStates) : false;
  const serviceActive = serviceEntity ? isStateActive(serviceEntity.state, settings?.serviceOnStates || DEFAULT_SERVICE_STATES) : false;

  const summaryHours = clamp(settings?.summaryHours, 6, 168, 24);
  const keepDays = clamp(settings?.keepDays, 7, 365, 120);
  const maxEntries = clamp(settings?.maxEntries, 25, 3000, 500);
  const recentRows = clamp(settings?.recentRows, 3, 20, 6);
  const targetToleranceC = Number.isFinite(Number(settings?.targetToleranceC)) ? Number(settings.targetToleranceC) : 0;

  const snapshots = useMemo(() => normalizeSnapshots(settings?.bookingSnapshots), [settings?.bookingSnapshots]);
  const lastLoggedHourRef = useRef(null);
  const [historyModal, setHistoryModal] = useState(null);

  const openHistoryModal = (payload) => {
    if (editMode) return;
    setHistoryModal(payload);
  };

  const removeSnapshot = (entryId) => {
    if (!settingsKey || typeof saveCardSetting !== 'function') return;
    const currentSnapshots = normalizeSnapshots(settings?.bookingSnapshots);
    const filtered = currentSnapshots.filter((entry) => entry.id !== entryId);
    if (filtered.length === currentSnapshots.length) return;
    saveCardSetting(settingsKey, 'bookingSnapshots', serializeSnapshots(filtered));
    setHistoryModal((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        entries: Array.isArray(prev.entries) ? prev.entries.filter((entry) => entry.id !== entryId) : [],
        highlightId: prev.highlightId === entryId ? null : prev.highlightId,
      };
    });
  };

  useEffect(() => {
    if (editMode || !settingsKey || typeof saveCardSetting !== 'function') {
      return;
    }

    const maybeCaptureHourlySnapshot = () => {
      const now = new Date();
      if (now.getMinutes() < 1) return;
      if (!bookingActive || serviceActive || currentTemp === null) return;

      const nowMs = now.getTime();
      const hourKey = toHourKey(nowMs);
      if (lastLoggedHourRef.current === hourKey) return;

      const existing = normalizeSnapshots(settings?.bookingSnapshots);
      if (existing.some((entry) => entry.hourKey === hourKey)) {
        lastLoggedHourRef.current = hourKey;
        return;
      }

      const captureMs = nowMs;
      const keepCutoff = captureMs - (keepDays * 24 * 60 * 60 * 1000);
      const nextEntry = {
        id: `${captureMs}_${Math.random().toString(36).slice(2, 8)}`,
        timestamp: new Date(captureMs).toISOString(),
        hourKey,
        startTemp: roundToOne(currentTemp),
        targetTemp: targetTemp !== null ? roundToOne(targetTemp) : null,
        deviation: targetTemp !== null ? roundToOne(currentTemp - targetTemp) : null,
        bookingType: 'regular',
        sampleMode: 'hourly',
        serviceRaw: serviceEntity?.state ?? null,
        activeRaw: activeEntity?.state ?? null,
      };

      const retained = existing.filter((entry) => entry.timestampMs >= keepCutoff);
      const trimmed = [...retained, nextEntry].slice(-maxEntries);
      saveCardSetting(settingsKey, 'bookingSnapshots', serializeSnapshots(trimmed));
      lastLoggedHourRef.current = hourKey;
    };

    maybeCaptureHourlySnapshot();
    const intervalId = window.setInterval(maybeCaptureHourlySnapshot, 15000);
    return () => window.clearInterval(intervalId);
  }, [
    bookingActive,
    currentTemp,
    targetTemp,
    serviceActive,
    serviceEntity?.state,
    activeEntity?.state,
    settings?.bookingSnapshots,
    keepDays,
    maxEntries,
    editMode,
    settingsKey,
    saveCardSetting,
  ]);

  const nowMs = Date.now();
  const windowStart = nowMs - (summaryHours * 60 * 60 * 1000);
  const recentSnapshots = snapshots.filter((entry) => entry.timestampMs >= windowStart);
  const recentSorted = recentSnapshots.slice().sort((a, b) => a.timestampMs - b.timestampMs);
  const recentVisible = recentSorted.slice(-recentRows).reverse();
  const allSnapshotsDesc = snapshots.slice().sort((a, b) => b.timestampMs - a.timestampMs);
  const trendStats = getTempStats(recentSorted);

  const startTemps = recentSnapshots.map((entry) => entry.startTemp);
  const averageStart = startTemps.length ? roundToOne(startTemps.reduce((sum, value) => sum + value, 0) / startTemps.length) : null;
  const minStart = startTemps.length ? roundToOne(Math.min(...startTemps)) : null;
  const maxStart = startTemps.length ? roundToOne(Math.max(...startTemps)) : null;

  const targetSamples = recentSnapshots.filter((entry) => entry.targetTemp !== null);
  const avgDeviation = targetSamples.length
    ? roundToOne(targetSamples.reduce((sum, entry) => sum + (entry.deviation ?? 0), 0) / targetSamples.length)
    : null;
  const reachedCount = targetSamples.filter((entry) => entry.startTemp >= (entry.targetTemp - targetToleranceC)).length;
  const serviceCount = recentSnapshots.filter((entry) => entry.bookingType === 'service').length;
  const regularCount = recentSnapshots.length - serviceCount;
  const reachedRate = targetSamples.length ? Math.round((reachedCount / targetSamples.length) * 100) : null;

  const sparkPoints = recentSorted.slice(-30).map((entry) => ({ value: entry.startTemp }));
  const latestSnapshot = snapshots.length ? snapshots[snapshots.length - 1] : null;
  const modalStats = getTempStats(historyModal?.entries || []);

  const missingConfig = [];
  if (!tempEntityId) missingConfig.push(tr('sauna.bookingTemp.tempEntity', 'Temperature sensor'));
  if (!activeEntityId) missingConfig.push(tr('sauna.bookingTemp.activeEntity', 'Booking active sensor'));

  return (
    <div
      {...dragProps}
      className={`touch-feedback relative p-5 rounded-[2.2rem] border bg-[var(--glass-bg)] border-[var(--glass-border)] h-full overflow-hidden transition-all duration-300 ${
        editMode ? 'cursor-move' : 'cursor-default'
      }`}
      style={cardStyle}
    >
      {controls}

      <div className="relative z-10 h-full flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-11 h-11 rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg-hover)] flex items-center justify-center shrink-0">
              <CardIcon className="w-5 h-5 text-[var(--text-secondary)]" />
            </div>
            <div className="min-w-0">
              <div className="text-sm md:text-base font-semibold uppercase tracking-wider truncate text-[var(--text-primary)]">
                {cardName}
              </div>
              <div className="mt-1 flex items-center gap-2 text-[10px] uppercase tracking-widest font-bold text-[var(--text-secondary)]">
                <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full border ${
                  bookingActive
                    ? 'bg-emerald-500/15 border-emerald-500/25 text-emerald-300'
                    : 'bg-[var(--glass-bg)] border-[var(--glass-border)]'
                }`}>
                  <Flame className="w-3 h-3" />
                  {bookingActive ? tr('sauna.active', 'Active') : tr('sauna.inactive', 'Inactive')}
                </span>
                {serviceEntityId && (
                  <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full border ${
                    serviceActive
                      ? 'bg-orange-500/15 border-orange-500/25 text-orange-300'
                      : 'bg-[var(--glass-bg)] border-[var(--glass-border)]'
                  }`}>
                    <Wrench className="w-3 h-3" />
                    {serviceActive ? tr('sauna.service', 'Service') : tr('sauna.regularBooking', 'Regular')}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="text-right shrink-0">
            <div className="text-[10px] uppercase tracking-widest font-bold text-[var(--text-secondary)]">
              {tr('sauna.currentTemp', 'Current')}
            </div>
            <div className="text-2xl font-semibold tabular-nums text-[var(--text-primary)]">
              {currentTemp !== null ? `${currentTemp.toFixed(1)}°` : '--'}
            </div>
          </div>
        </div>

        {missingConfig.length > 0 ? (
          <div className="flex-1 rounded-2xl border border-orange-500/25 bg-orange-500/10 p-4 text-sm text-orange-200">
            <div className="flex items-center gap-2 font-semibold uppercase tracking-widest text-[11px] mb-2">
              <AlertTriangle className="w-4 h-4" />
              {tr('common.configuration', 'Configuration needed')}
            </div>
            <div className="space-y-1 text-xs text-orange-100/90">
              {missingConfig.map((label) => (
                <div key={label}>- {label}</div>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
              <button
                type="button"
                className="text-left rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-3 py-2 transition-colors hover:bg-[var(--glass-bg-hover)]"
                onClick={() => openHistoryModal({
                  title: tr('sauna.bookingTemp.starts', 'Samples'),
                  subtitle: `${summaryHours}h`,
                  entries: recentSorted.slice().reverse(),
                  highlightId: null,
                })}
              >
                <div className="text-[10px] uppercase tracking-widest text-[var(--text-secondary)] font-bold">{summaryHours}h</div>
                <div className="text-lg font-semibold tabular-nums text-[var(--text-primary)]">{recentSnapshots.length}</div>
                <div className="text-[10px] text-[var(--text-muted)]">{tr('sauna.bookingTemp.starts', 'samples')}</div>
              </button>
              <button
                type="button"
                className="text-left rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-3 py-2 transition-colors hover:bg-[var(--glass-bg-hover)]"
                onClick={() => openHistoryModal({
                  title: tr('sauna.bookingTemp.avgStart', 'Avg start'),
                  subtitle: `${recentSnapshots.length} ${tr('sauna.bookingTemp.starts', 'samples')}`,
                  entries: recentSorted.slice().reverse(),
                  highlightId: null,
                })}
              >
                <div className="text-[10px] uppercase tracking-widest text-[var(--text-secondary)] font-bold">{tr('sauna.bookingTemp.avgStart', 'Avg start')}</div>
                <div className="text-lg font-semibold tabular-nums text-[var(--text-primary)]">{averageStart !== null ? `${averageStart.toFixed(1)}°` : '--'}</div>
                <div className="text-[10px] text-[var(--text-muted)]">{minStart !== null && maxStart !== null ? `${minStart.toFixed(1)}° - ${maxStart.toFixed(1)}°` : '--'}</div>
              </button>
              <button
                type="button"
                className="text-left rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-3 py-2 transition-colors hover:bg-[var(--glass-bg-hover)]"
                onClick={() => openHistoryModal({
                  title: tr('sauna.bookingTemp.targetHit', 'Target hit'),
                  subtitle: targetSamples.length ? `${reachedCount}/${targetSamples.length}` : tr('common.unavailable', 'Unavailable'),
                  entries: targetSamples.slice().sort((a, b) => b.timestampMs - a.timestampMs),
                  highlightId: null,
                })}
              >
                <div className="text-[10px] uppercase tracking-widest text-[var(--text-secondary)] font-bold">{tr('sauna.bookingTemp.targetHit', 'Target hit')}</div>
                <div className="text-lg font-semibold tabular-nums text-[var(--text-primary)]">{reachedRate !== null ? `${reachedRate}%` : '--'}</div>
                <div className="text-[10px] text-[var(--text-muted)]">{targetSamples.length ? `${reachedCount}/${targetSamples.length}` : tr('common.unavailable', 'Unavailable')}</div>
              </button>
              <button
                type="button"
                className="text-left rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-3 py-2 transition-colors hover:bg-[var(--glass-bg-hover)]"
                onClick={() => openHistoryModal({
                  title: tr('sauna.bookingTemp.deviation', 'Deviation'),
                  subtitle: avgDeviation !== null ? `${avgDeviation > 0 ? '+' : ''}${avgDeviation.toFixed(1)}°` : '--',
                  entries: targetSamples.slice().sort((a, b) => b.timestampMs - a.timestampMs),
                  highlightId: null,
                })}
              >
                <div className="text-[10px] uppercase tracking-widest text-[var(--text-secondary)] font-bold">{tr('sauna.bookingTemp.deviation', 'Deviation')}</div>
                <div className={`text-lg font-semibold tabular-nums ${avgDeviation !== null && avgDeviation < 0 ? 'text-rose-300' : 'text-[var(--text-primary)]'}`}>
                  {avgDeviation !== null ? `${avgDeviation > 0 ? '+' : ''}${avgDeviation.toFixed(1)}°` : '--'}
                </div>
                <div className="text-[10px] text-[var(--text-muted)]">{tr('sauna.bookingTemp.regularService', 'R/S')}: {regularCount}/{serviceCount}</div>
              </button>
            </div>

            {sparkPoints.length > 1 && (
              <button
                type="button"
                className="w-full text-left rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-3 py-2 transition-colors hover:bg-[var(--glass-bg-hover)]"
                onClick={() => openHistoryModal({
                  title: tr('sauna.bookingTemp.startTrend', 'Start temperature trend'),
                  subtitle: `${recentSnapshots.length} ${tr('sauna.bookingTemp.starts', 'samples')}`,
                  entries: recentSorted.slice().reverse(),
                  highlightId: null,
                })}
              >
                <div className="flex items-center justify-between text-[10px] uppercase tracking-widest font-bold text-[var(--text-secondary)] mb-1.5">
                  <span>{tr('sauna.bookingTemp.startTrend', 'Start temperature trend')}</span>
                  <span className="inline-flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" />
                    {targetTemp !== null ? `${targetTemp.toFixed(1)}°` : '--'}
                  </span>
                </div>
                {trendStats && (
                  <div className="grid grid-cols-3 gap-2 mb-1.5 text-[10px] uppercase tracking-widest text-[var(--text-muted)]">
                    <span>{tr('sauna.bookingTemp.minimum', 'Min')}: {trendStats.min.toFixed(1)}°</span>
                    <span>{tr('sauna.bookingTemp.latest', 'Latest')}: {trendStats.latest.toFixed(1)}°</span>
                    <span>{tr('sauna.bookingTemp.maximum', 'Max')}: {trendStats.max.toFixed(1)}°</span>
                  </div>
                )}
                <div className="flex items-center justify-between mb-1.5 text-[10px] uppercase tracking-widest text-[var(--text-muted)]">
                  <span>{tr('sauna.bookingTemp.graphTop', 'Top')}: {trendStats ? `${trendStats.max.toFixed(1)}°` : '--'}</span>
                  <span>{tr('sauna.bookingTemp.graphBottom', 'Bottom')}: {trendStats ? `${trendStats.min.toFixed(1)}°` : '--'}</span>
                </div>
                <SparkLine
                  data={sparkPoints}
                  currentIndex={sparkPoints.length - 1}
                  height={62}
                />
              </button>
            )}

            <div className="flex-1 min-h-0 rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-2.5 overflow-y-auto custom-scrollbar">
              <div className="flex items-center justify-between px-1 pb-2">
                <div className="text-[10px] uppercase tracking-widest font-bold text-[var(--text-secondary)]">
                  {tr('common.history', 'History')}
                </div>
                {latestSnapshot && (
                  <div className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] inline-flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatSince(latestSnapshot.timestampMs)}
                  </div>
                )}
              </div>
              <div className="space-y-2">
                {recentVisible.length === 0 && (
                  <div className="px-2 py-5 text-center text-xs text-[var(--text-muted)]">
                    {tr('sauna.bookingTemp.noStarts', 'No hourly samples in selected window')}
                  </div>
                )}
                {recentVisible.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    className="w-full text-left rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg-hover)] px-3 py-2 transition-colors hover:bg-[var(--glass-bg)]"
                    onClick={() => openHistoryModal({
                      title: formatDateTime(entry.timestampMs),
                      subtitle: tr('common.history', 'History'),
                      entries: allSnapshotsDesc,
                      highlightId: entry.id,
                    })}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-semibold tabular-nums text-[var(--text-primary)] inline-flex items-center gap-1.5">
                        <Thermometer className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                        {entry.startTemp.toFixed(1)}°
                      </div>
                      <div className="text-[10px] uppercase tracking-widest text-[var(--text-muted)]">
                        {formatDateTime(entry.timestampMs)}
                      </div>
                    </div>
                    <div className="mt-1.5 flex items-center justify-between gap-2 text-[10px] uppercase tracking-widest">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full border ${
                        entry.bookingType === 'service'
                          ? 'border-orange-500/30 bg-orange-500/15 text-orange-300'
                          : 'border-blue-500/30 bg-blue-500/15 text-blue-300'
                      }`}>
                        {entry.bookingType === 'service' ? tr('sauna.service', 'Service') : tr('sauna.regularBooking', 'Regular')}
                      </span>
                      <span className="text-[var(--text-secondary)] tabular-nums">
                        {entry.targetTemp !== null
                          ? `${tr('sauna.target', 'Target')}: ${entry.targetTemp.toFixed(1)}° (${entry.deviation >= 0 ? '+' : ''}${entry.deviation.toFixed(1)}°)`
                          : tr('sauna.bookingTemp.noTarget', 'No target configured')}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {historyModal && (
        <div
          data-disable-pull-refresh="true"
          className="fixed inset-0 z-[130] flex items-center justify-center p-3 sm:p-4"
          style={{ background: 'rgba(4, 10, 20, 0.68)', backdropFilter: 'blur(8px)' }}
          onClick={() => setHistoryModal(null)}
        >
          <div
            data-disable-pull-refresh="true"
            className="border w-full max-w-3xl rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-2xl relative font-sans backdrop-blur-xl popup-anim flex flex-col max-h-[86vh] overflow-hidden"
            style={{ background: 'var(--modal-bg)', borderColor: 'var(--glass-border)', touchAction: 'pan-y' }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setHistoryModal(null)}
              className="absolute top-4 right-4 modal-close"
              aria-label={tr('common.close', 'Close')}
            >
              <X className="w-4 h-4" />
            </button>

            <div className="pr-10">
              <div className="text-xs uppercase tracking-widest font-bold text-[var(--text-secondary)]">
                {historyModal.subtitle || tr('common.history', 'History')}
              </div>
              <div className="text-lg sm:text-xl font-semibold text-[var(--text-primary)] mt-1">
                {historyModal.title || tr('common.history', 'History')}
              </div>
            </div>

            {historyModal.entries?.length > 1 && (
              <div className="mt-4 rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-3 py-2">
                {modalStats && (
                  <div className="grid grid-cols-3 gap-2 mb-2 text-[10px] uppercase tracking-widest text-[var(--text-muted)]">
                    <span>{tr('sauna.bookingTemp.minimum', 'Min')}: {modalStats.min.toFixed(1)}°</span>
                    <span>{tr('sauna.bookingTemp.latest', 'Latest')}: {modalStats.latest.toFixed(1)}°</span>
                    <span>{tr('sauna.bookingTemp.maximum', 'Max')}: {modalStats.max.toFixed(1)}°</span>
                  </div>
                )}
                <div className="flex items-center justify-between mb-2 text-[10px] uppercase tracking-widest text-[var(--text-muted)]">
                  <span>{tr('sauna.bookingTemp.graphTop', 'Top')}: {modalStats ? `${modalStats.max.toFixed(1)}°` : '--'}</span>
                  <span>{tr('sauna.bookingTemp.graphBottom', 'Bottom')}: {modalStats ? `${modalStats.min.toFixed(1)}°` : '--'}</span>
                </div>
                <SparkLine
                  data={historyModal.entries.slice().reverse().map((entry) => ({ value: entry.startTemp }))}
                  currentIndex={historyModal.entries.length - 1}
                  height={72}
                />
              </div>
            )}

            <div
              className="mt-4 flex-1 min-h-0 overflow-y-auto custom-scrollbar space-y-2 pr-1 overscroll-contain"
              style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}
            >
              {!historyModal.entries?.length && (
                <div className="px-2 py-5 text-center text-xs text-[var(--text-muted)]">
                  {tr('sauna.bookingTemp.noStarts', 'No hourly samples in selected window')}
                </div>
              )}

              {historyModal.entries?.map((entry) => {
                const hit = entry.targetTemp !== null
                  ? entry.startTemp >= (entry.targetTemp - targetToleranceC)
                  : null;
                const isHighlighted = historyModal.highlightId && historyModal.highlightId === entry.id;
                return (
                  <div
                    key={entry.id}
                    className={`rounded-xl border px-3 py-2 ${
                      isHighlighted
                        ? 'border-blue-400/50 bg-blue-500/10'
                        : 'border-[var(--glass-border)] bg-[var(--glass-bg)]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-semibold tabular-nums text-[var(--text-primary)] inline-flex items-center gap-1.5">
                        <Thermometer className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                        {entry.startTemp.toFixed(1)}°
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-[10px] uppercase tracking-widest text-[var(--text-muted)]">
                          {formatDateTime(entry.timestampMs)}
                        </div>
                        <button
                          type="button"
                          className="h-7 w-7 rounded-full border border-red-400/30 bg-red-500/10 text-red-300 hover:bg-red-500/20 inline-flex items-center justify-center"
                          aria-label={tr('common.delete', 'Delete')}
                          onClick={(e) => {
                            e.stopPropagation();
                            const confirmDelete = typeof window === 'undefined'
                              ? true
                              : window.confirm(tr('sauna.bookingTemp.deleteSampleConfirm', 'Delete this sample?'));
                            if (!confirmDelete) return;
                            removeSnapshot(entry.id);
                          }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-widest">
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg-hover)] text-[var(--text-secondary)]">
                        {tr('sauna.target', 'Target')}: {entry.targetTemp !== null ? `${entry.targetTemp.toFixed(1)}°` : '--'}
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg-hover)] text-[var(--text-secondary)]">
                        {tr('sauna.bookingTemp.deviation', 'Deviation')}: {entry.deviation !== null ? `${entry.deviation > 0 ? '+' : ''}${entry.deviation.toFixed(1)}°` : '--'}
                      </span>
                      {hit !== null && (
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full border ${
                          hit
                            ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-300'
                            : 'border-rose-400/40 bg-rose-500/15 text-rose-300'
                        }`}>
                          {tr('sauna.bookingTemp.targetHit', 'Target hit')}: {hit ? tr('common.yes', 'Yes') : tr('common.no', 'No')}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
