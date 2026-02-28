import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Clock, Thermometer, TrendingUp, X } from '../../icons';
import { getIconComponent } from '../../icons';
import SparkLine from '../charts/SparkLine';

const DEFAULT_ACTIVE_STATES = ['on', 'true', '1', 'yes', 'active', 'booked', 'occupied', 'aktiv'];
const DEFAULT_SERVICE_STATES = ['ja', 'yes', 'service', 'on', 'true', '1'];
const HOURLY_SAMPLE_MINUTE = 1;
const HOURLY_SAMPLE_LAST_MINUTE = 59;

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

const normalizeState = (value) => String(value ?? '').trim().toLowerCase();

const parseStateArray = (rawValue, fallback) => {
  if (Array.isArray(rawValue) && rawValue.length > 0) {
    return rawValue.map((item) => normalizeState(item)).filter(Boolean);
  }
  return fallback;
};

const isStateActive = (value, states) => parseStateArray(states, DEFAULT_ACTIVE_STATES).includes(normalizeState(value));

const isServiceActive = (value, states) => parseStateArray(states, DEFAULT_SERVICE_STATES).includes(normalizeState(value));

const toHourKey = (timestampMs) => {
  const date = new Date(timestampMs);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  return `${year}-${month}-${day}-${hour}`;
};

const toScheduledHourlySampleMs = (timestampMs) => {
  const date = new Date(timestampMs);
  date.setMinutes(HOURLY_SAMPLE_MINUTE, 0, 0);
  return date.getTime();
};

const calcDeviationPct = (temp, target) => {
  const tempNum = toNum(temp);
  const targetNum = toNum(target);
  if (tempNum === null || targetNum === null || Math.abs(targetNum) < 0.001) return null;
  return roundToOne(((tempNum - targetNum) / targetNum) * 100);
};

const calcScoreFromDeviationPct = (deviationPct) => {
  const parsed = toNum(deviationPct);
  if (parsed === null) return null;
  return Math.max(0, Math.min(100, Math.round(100 - Math.abs(parsed))));
};

const normalizeSamples = (rawValue) => {
  if (!Array.isArray(rawValue)) return [];
  return rawValue
    .map((entry, index) => {
      const timestamp = String(entry?.timestamp || entry?.time || '').trim();
      const timestampMs = Date.parse(timestamp);
      const startTemp = toNum(entry?.startTemp ?? entry?.temperature ?? entry?.temp);
      if (!Number.isFinite(timestampMs) || startTemp === null) return null;
      const targetTemp = toNum(entry?.targetTemp);
      const deviationPct = toNum(entry?.deviationPct);
      const deviationC = toNum(entry?.deviationC);
      const computedDeviationC = targetTemp !== null ? roundToOne(startTemp - targetTemp) : null;
      return {
        id: String(entry?.id || `${timestamp}_${index}`),
        timestamp,
        timestampMs,
        hourKey: String(entry?.hourKey || toHourKey(timestampMs)),
        startTemp: roundToOne(startTemp),
        targetTemp,
        deviationPct: deviationPct !== null ? roundToOne(deviationPct) : calcDeviationPct(startTemp, targetTemp),
        deviationC: deviationC !== null ? roundToOne(deviationC) : computedDeviationC,
        sampleMode: String(entry?.sampleMode || 'hourly'),
        activeRaw: entry?.activeRaw ?? null,
        serviceRaw: entry?.serviceRaw ?? null,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.timestampMs - b.timestampMs);
};

const serializeSamples = (samples) => samples.map((entry) => ({
  id: entry.id,
  timestamp: entry.timestamp,
  hourKey: entry.hourKey,
  startTemp: entry.startTemp,
  targetTemp: entry.targetTemp,
  deviationPct: entry.deviationPct,
  deviationC: entry.deviationC,
  sampleMode: entry.sampleMode,
  activeRaw: entry.activeRaw,
  serviceRaw: entry.serviceRaw,
}));

const makeTr = (t) => (key, fallback) => {
  const out = typeof t === 'function' ? t(key) : undefined;
  const str = String(out ?? '');
  const looksLikeKey = !str || str === key || str.toLowerCase() === key.toLowerCase() || str === str.toUpperCase() || str.includes('.');
  return looksLikeKey ? fallback : str;
};

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

const formatDeviationPercent = (value) => {
  if (!Number.isFinite(Number(value))) return '--';
  const num = Number(value);
  return `${num > 0 ? '+' : ''}${num.toFixed(1)}%`;
};

const getHealthTone = (score) => {
  if (!Number.isFinite(Number(score))) {
    return {
      ring: '#64748b',
      glow: 'rgba(100, 116, 139, 0.24)',
      scoreText: 'text-[var(--text-primary)]',
    };
  }
  if (score > 90) {
    return {
      ring: '#10b981',
      glow: 'rgba(16, 185, 129, 0.38)',
      scoreText: 'text-emerald-300',
    };
  }
  if (score >= 70) {
    return {
      ring: '#f59e0b',
      glow: 'rgba(245, 158, 11, 0.38)',
      scoreText: 'text-amber-300',
    };
  }
  return {
    ring: '#ef4444',
    glow: 'rgba(239, 68, 68, 0.38)',
    scoreText: 'text-rose-300',
  };
};

const getBarColor = (entry, toleranceC = 3) => {
  const temp = toNum(entry?.startTemp);
  const target = toNum(entry?.targetTemp);
  if (temp === null || target === null) return '#60a5fa';
  const safeTolerance = Number.isFinite(Number(toleranceC)) ? Math.max(0, Number(toleranceC)) : 3;
  const delta = temp - target;
  if (Math.abs(delta) <= safeTolerance) return '#22c55e';
  if (delta > safeTolerance) return '#f59e0b';
  return '#ef4444';
};

const buildChartRange = (entries = [], fallbackTarget = null, options = {}) => {
  const minSpan = Number.isFinite(Number(options?.minSpan)) ? Math.max(2, Number(options.minSpan)) : 14;
  const paddingRatio = Number.isFinite(Number(options?.paddingRatio)) ? Math.max(0, Number(options.paddingRatio)) : 0.18;
  const paddingMin = Number.isFinite(Number(options?.paddingMin)) ? Math.max(0.5, Number(options.paddingMin)) : 1;
  const values = [];

  entries.forEach((entry) => {
    const temp = toNum(entry?.startTemp);
    const target = toNum(entry?.targetTemp);
    if (temp !== null) values.push(temp);
    if (target !== null) values.push(target);
  });

  const fallback = toNum(fallbackTarget);
  if (fallback !== null) values.push(fallback);
  if (!values.length) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const rawSpan = Math.max(1, max - min);
  const span = Math.max(minSpan, rawSpan);
  const center = (min + max) / 2;
  const baseMin = center - (span / 2);
  const baseMax = center + (span / 2);
  const padding = Math.max(paddingMin, span * paddingRatio);

  return {
    minValue: baseMin - padding,
    maxValue: baseMax + padding,
  };
};

export default function SaunaHealthScoreCard({
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

  const cardName = customNames?.[cardId] || settings?.name || tr('sauna.healthScore.title', 'Sauna health score');
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
  const bookingActive = activeEntity ? isStateActive(activeEntity?.state, settings?.activeOnStates) : false;
  const serviceActive = serviceEntity ? isServiceActive(serviceEntity?.state, settings?.serviceOnStates) : false;

  const summaryHours = clamp(settings?.summaryHours, 6, 168, 48);
  const keepDays = clamp(settings?.keepDays, 7, 365, 120);
  const maxEntries = clamp(settings?.maxEntries, 25, 3000, 1000);
  const targetToleranceC = Number.isFinite(Number(settings?.targetToleranceC))
    ? Math.max(0, Math.min(20, Number(settings.targetToleranceC)))
    : 3;

  const samples = useMemo(() => normalizeSamples(settings?.healthSnapshots), [settings?.healthSnapshots]);
  const lastLoggedHourRef = useRef(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);

  useEffect(() => {
    if (editMode || !settingsKey || typeof saveCardSetting !== 'function' || !tempEntityId || !activeEntityId) {
      return;
    }

    const maybeCaptureHourlySample = () => {
      const now = new Date();
      const minute = now.getMinutes();
      if (minute < HOURLY_SAMPLE_MINUTE || minute > HOURLY_SAMPLE_LAST_MINUTE) return;
      if (!bookingActive || currentTemp === null) return;
      if (serviceEntityId && serviceActive) return;

      const nowMs = now.getTime();
      const captureMs = toScheduledHourlySampleMs(nowMs);
      const hourKey = toHourKey(captureMs);
      if (lastLoggedHourRef.current === hourKey) return;

      const existing = normalizeSamples(settings?.healthSnapshots);
      if (existing.some((entry) => entry.hourKey === hourKey)) {
        lastLoggedHourRef.current = hourKey;
        return;
      }

      const keepCutoff = captureMs - (keepDays * 24 * 60 * 60 * 1000);
      const nextEntry = {
        id: `health_${hourKey}`,
        timestamp: new Date(captureMs).toISOString(),
        hourKey,
        startTemp: roundToOne(currentTemp),
        targetTemp: targetTemp !== null ? roundToOne(targetTemp) : null,
        deviationPct: calcDeviationPct(currentTemp, targetTemp),
        deviationC: targetTemp !== null ? roundToOne(currentTemp - targetTemp) : null,
        sampleMode: 'hourly',
        activeRaw: activeEntity?.state ?? null,
        serviceRaw: serviceEntity?.state ?? null,
      };

      const retained = existing.filter((entry) => entry.timestampMs >= keepCutoff);
      const trimmed = [...retained, nextEntry].slice(-maxEntries);
      saveCardSetting(settingsKey, 'healthSnapshots', serializeSamples(trimmed));
      lastLoggedHourRef.current = hourKey;
    };

    maybeCaptureHourlySample();
    const intervalId = window.setInterval(maybeCaptureHourlySample, 15000);
    return () => window.clearInterval(intervalId);
  }, [
    activeEntity?.state,
    activeEntityId,
    bookingActive,
    currentTemp,
    editMode,
    keepDays,
    maxEntries,
    saveCardSetting,
    serviceActive,
    serviceEntity?.state,
    serviceEntityId,
    settings?.healthSnapshots,
    settingsKey,
    targetTemp,
    tempEntityId,
  ]);

  const nowMs = Date.now();
  const windowStart = nowMs - (summaryHours * 60 * 60 * 1000);
  const recentSorted = samples
    .filter((entry) => entry.timestampMs >= windowStart)
    .sort((a, b) => a.timestampMs - b.timestampMs);
  const recentDesc = recentSorted.slice().reverse();

  const tempValues = recentSorted.map((entry) => entry.startTemp);
  const avgTemp = tempValues.length
    ? roundToOne(tempValues.reduce((sum, value) => sum + value, 0) / tempValues.length)
    : null;
  const minTemp = tempValues.length ? roundToOne(Math.min(...tempValues)) : null;
  const maxTemp = tempValues.length ? roundToOne(Math.max(...tempValues)) : null;

  const targetSamples = recentSorted.filter((entry) => entry.targetTemp !== null && entry.deviationPct !== null);
  const avgDeviationPct = targetSamples.length
    ? roundToOne(targetSamples.reduce((sum, entry) => sum + (entry.deviationPct ?? 0), 0) / targetSamples.length)
    : null;
  const hitCount = targetSamples.filter((entry) => {
    const temp = toNum(entry.startTemp);
    const target = toNum(entry.targetTemp);
    if (temp === null || target === null) return false;
    return Math.abs(temp - target) <= targetToleranceC;
  }).length;
  const hitRate = targetSamples.length ? Math.round((hitCount / targetSamples.length) * 100) : null;

  const score = calcScoreFromDeviationPct(avgDeviationPct);
  const scoreSamples = targetSamples
    .map((entry) => calcScoreFromDeviationPct(entry.deviationPct))
    .filter((entryScore) => Number.isFinite(Number(entryScore)));
  const latestScore = scoreSamples.length ? scoreSamples[scoreSamples.length - 1] : null;
  const previousScore = scoreSamples.length > 1 ? scoreSamples[scoreSamples.length - 2] : null;
  const scoreTrendDelta = latestScore !== null && previousScore !== null
    ? roundToOne(latestScore - previousScore)
    : null;
  const scoreTrendDirection = scoreTrendDelta === null
    ? 'flat'
    : (scoreTrendDelta > 0 ? 'up' : (scoreTrendDelta < 0 ? 'down' : 'flat'));

  const sparkEntries = recentSorted.slice(-24);
  const sparkPoints = sparkEntries.map((entry) => ({
    value: entry.startTemp,
    barColor: getBarColor(entry, targetToleranceC),
  }));
  const sparkRange = buildChartRange(sparkEntries, targetTemp, { minSpan: 18, paddingRatio: 0.12, paddingMin: 1 });
  const latestSample = recentSorted.length ? recentSorted[recentSorted.length - 1] : null;

  const ringRadius = 48;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringProgress = Number.isFinite(Number(score)) ? Number(score) : 0;
  const ringDashArray = `${(ringProgress / 100) * ringCircumference} ${ringCircumference}`;
  const tone = getHealthTone(score);

  const missingConfig = [];
  if (!tempEntityId) missingConfig.push(tr('sauna.healthScore.tempEntity', 'Temperature sensor'));
  if (!activeEntityId) missingConfig.push(tr('sauna.healthScore.activeEntity', 'Booking active sensor'));

  const renderPortal = (content) => {
    if (typeof document === 'undefined') return null;
    return createPortal(content, document.body);
  };

  return (
    <div
      {...dragProps}
      className={`touch-feedback relative p-5 rounded-[2.2rem] border bg-[var(--glass-bg)] border-[var(--glass-border)] h-full overflow-hidden transition-all duration-300 ${
        editMode ? 'cursor-move' : 'cursor-default'
      }`}
      style={cardStyle}
    >
      {controls}

      <div className="relative z-10 h-full flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg-hover)] flex items-center justify-center shrink-0">
              <CardIcon className="w-4.5 h-4.5 text-[var(--text-secondary)]" />
            </div>
            <div className="min-w-0">
              <div className="text-sm md:text-base font-semibold truncate text-[var(--text-primary)]">
                {cardName}
              </div>
              <div className="text-[10px] uppercase tracking-widest text-[var(--text-secondary)] mt-1">
                {tr('sauna.healthScore.summaryWindow', 'Window')}: {summaryHours}h
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
          <div className="flex-1 min-h-0 rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg-hover)] p-3 flex flex-col gap-3">
            <div className="grid grid-cols-[auto_1fr] gap-3 items-center">
              <div className="relative w-28 h-28 shrink-0">
                <svg viewBox="0 0 120 120" className="w-full h-full">
                  <circle
                    cx="60"
                    cy="60"
                    r={ringRadius}
                    fill="none"
                    stroke="rgba(148, 163, 184, 0.2)"
                    strokeWidth="12"
                  />
                  <circle
                    cx="60"
                    cy="60"
                    r={ringRadius}
                    fill="none"
                    stroke={tone.ring}
                    strokeWidth="12"
                    strokeLinecap="round"
                    strokeDasharray={ringDashArray}
                    style={{
                      transform: 'rotate(-90deg)',
                      transformOrigin: '50% 50%',
                      filter: `drop-shadow(0 0 8px ${tone.glow})`,
                    }}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                  <span className={`text-[1.9rem] leading-none font-semibold tabular-nums ${tone.scoreText}`}>
                    {score !== null ? score : '--'}
                  </span>
                  <span className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] mt-1">
                    {tr('sauna.healthScore.score', 'Score')}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-2.5 py-2">
                  <div className="text-[10px] uppercase tracking-widest text-[var(--text-secondary)] font-bold">
                    {tr('sauna.healthScore.samples', 'Samples')}
                  </div>
                  <div className="text-lg font-semibold tabular-nums text-[var(--text-primary)] mt-1">
                    {recentSorted.length}
                  </div>
                </div>
                <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-2.5 py-2">
                  <div className="text-[10px] uppercase tracking-widest text-[var(--text-secondary)] font-bold">
                    {tr('sauna.healthScore.hitRate', 'Hit rate')}
                  </div>
                  <div className="text-lg font-semibold tabular-nums text-[var(--text-primary)] mt-1">
                    {hitRate !== null ? `${hitRate}%` : '--'}
                  </div>
                </div>
                <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-2.5 py-2">
                  <div className="text-[10px] uppercase tracking-widest text-[var(--text-secondary)] font-bold">
                    {tr('sauna.healthScore.deviation', 'Deviation')}
                  </div>
                  <div className={`text-lg font-semibold tabular-nums mt-1 ${avgDeviationPct !== null && avgDeviationPct < 0 ? 'text-rose-300' : 'text-[var(--text-primary)]'}`}>
                    {formatDeviationPercent(avgDeviationPct)}
                  </div>
                </div>
                <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-2.5 py-2">
                  <div className="text-[10px] uppercase tracking-widest text-[var(--text-secondary)] font-bold">
                    {tr('sauna.healthScore.trend', 'Trend')}
                  </div>
                  <div className={`text-lg font-semibold tabular-nums mt-1 inline-flex items-center gap-1 ${
                    scoreTrendDirection === 'up'
                      ? 'text-emerald-300'
                      : (scoreTrendDirection === 'down' ? 'text-amber-300' : 'text-[var(--text-primary)]')
                  }`}>
                    <TrendingUp className={`w-4 h-4 ${scoreTrendDirection === 'down' ? 'rotate-180' : ''}`} />
                    {scoreTrendDelta === null ? '--' : `${scoreTrendDelta > 0 ? '+' : ''}${scoreTrendDelta.toFixed(1)}`}
                  </div>
                </div>
              </div>
            </div>

            {sparkPoints.length > 1 && (
              <button
                type="button"
                className={`w-full text-left rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-2.5 py-2 transition-colors ${
                  editMode ? 'cursor-default' : 'hover:bg-[var(--glass-bg-hover)]'
                }`}
                onClick={() => {
                  if (editMode) return;
                  setShowDetailsModal(true);
                }}
              >
                <div className="flex items-center justify-between text-[10px] uppercase tracking-widest font-bold text-[var(--text-secondary)] mb-1">
                  <span>{tr('sauna.healthScore.tempTrend', 'Temperature trend')}</span>
                  <span>{targetTemp !== null ? `${tr('sauna.target', 'Target')}: ${targetTemp.toFixed(1)}°` : '--'}</span>
                </div>
                <SparkLine
                  data={sparkPoints}
                  currentIndex={sparkPoints.length - 1}
                  height={58}
                  variant="bar"
                  minValue={sparkRange?.minValue}
                  maxValue={sparkRange?.maxValue}
                  barColorAccessor={(point) => point?.barColor}
                  barMaxHeightRatio={0.6}
                />
              </button>
            )}

            <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-widest text-[var(--text-secondary)]">
              <span className="inline-flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {latestSample ? formatSince(latestSample.timestampMs) : tr('common.unavailable', 'Unavailable')}
              </span>
              <button
                type="button"
                className="px-3 py-1 rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg)] hover:bg-[var(--glass-bg-hover)] text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)]"
                onClick={() => {
                  if (editMode) return;
                  setShowDetailsModal(true);
                }}
              >
                {tr('sauna.healthScore.details', 'Details')}
              </button>
            </div>
          </div>
        )}
      </div>

      {showDetailsModal && renderPortal(
        <div
          data-disable-pull-refresh="true"
          className="fixed inset-0 z-[230] flex items-start sm:items-center justify-center p-3 sm:p-4 overflow-y-auto"
          style={{
            background: 'rgba(4, 10, 20, 0.68)',
            backdropFilter: 'blur(8px)',
            paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)',
            paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)',
          }}
          onClick={() => setShowDetailsModal(false)}
        >
          <div
            data-disable-pull-refresh="true"
            className="border w-full max-w-5xl rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-2xl relative font-sans backdrop-blur-xl popup-anim flex flex-col overflow-hidden my-auto"
            style={{
              background: 'var(--modal-bg)',
              borderColor: 'var(--glass-border)',
              maxHeight: 'calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 24px)',
              touchAction: 'pan-y',
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setShowDetailsModal(false)}
              className="absolute top-4 right-4 modal-close"
              aria-label={tr('common.close', 'Close')}
            >
              <X className="w-4 h-4" />
            </button>

            <div className="pr-10 mb-4">
              <div className="text-xs uppercase tracking-widest font-bold text-[var(--text-secondary)]">
                {tr('sauna.healthScore.title', 'Sauna health score')}
              </div>
              <div className="text-lg sm:text-xl font-semibold text-[var(--text-primary)] mt-1">
                {cardName}
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-1 space-y-3">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-3 py-2.5">
                  <div className="text-[10px] uppercase tracking-widest font-bold text-[var(--text-secondary)]">{tr('sauna.healthScore.score', 'Score')}</div>
                  <div className={`text-xl font-semibold tabular-nums mt-1 ${tone.scoreText}`}>{score !== null ? score : '--'}</div>
                </div>
                <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-3 py-2.5">
                  <div className="text-[10px] uppercase tracking-widest font-bold text-[var(--text-secondary)]">{tr('sauna.healthScore.avgTemp', 'Avg temp')}</div>
                  <div className="text-xl font-semibold tabular-nums mt-1 text-[var(--text-primary)]">{avgTemp !== null ? `${avgTemp.toFixed(1)}°` : '--'}</div>
                </div>
                <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-3 py-2.5">
                  <div className="text-[10px] uppercase tracking-widest font-bold text-[var(--text-secondary)]">{tr('sauna.healthScore.range', 'Range')}</div>
                  <div className="text-sm font-semibold tabular-nums mt-1 text-[var(--text-primary)]">
                    {minTemp !== null && maxTemp !== null ? `${minTemp.toFixed(1)}° - ${maxTemp.toFixed(1)}°` : '--'}
                  </div>
                </div>
                <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-3 py-2.5">
                  <div className="text-[10px] uppercase tracking-widest font-bold text-[var(--text-secondary)]">{tr('sauna.healthScore.samples', 'Samples')}</div>
                  <div className="text-xl font-semibold tabular-nums mt-1 text-[var(--text-primary)]">{recentSorted.length}</div>
                </div>
              </div>

              {sparkPoints.length > 1 && (
                <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-3 py-2.5">
                  <div className="flex items-center justify-between text-[10px] uppercase tracking-widest font-bold text-[var(--text-secondary)] mb-1.5">
                    <span>{tr('sauna.healthScore.tempTrend', 'Temperature trend')}</span>
                    <span>{targetTemp !== null ? `${tr('sauna.target', 'Target')}: ${targetTemp.toFixed(1)}°` : '--'}</span>
                  </div>
                  <SparkLine
                    data={sparkPoints}
                    currentIndex={sparkPoints.length - 1}
                    height={72}
                    variant="bar"
                    minValue={sparkRange?.minValue}
                    maxValue={sparkRange?.maxValue}
                    barColorAccessor={(point) => point?.barColor}
                    barMaxHeightRatio={0.62}
                  />
                </div>
              )}

              <div
                className="min-h-0 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-2.5 overflow-y-auto custom-scrollbar"
                style={{ maxHeight: '42dvh' }}
              >
                <div className="flex items-center justify-between px-1 pb-2">
                  <div className="text-[10px] uppercase tracking-widest font-bold text-[var(--text-secondary)]">
                    {tr('common.history', 'History')}
                  </div>
                  <div className="text-[10px] uppercase tracking-widest text-[var(--text-muted)]">
                    {recentDesc.length}
                  </div>
                </div>

                <div className="space-y-2">
                  {recentDesc.length === 0 && (
                    <div className="px-2 py-5 text-center text-xs text-[var(--text-muted)]">
                      {tr('sauna.healthScore.noSamples', 'No hourly samples yet')}
                    </div>
                  )}
                  {recentDesc.slice(0, 200).map((entry) => (
                    <div
                      key={entry.id}
                      className="rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg-hover)] px-3 py-2"
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
                      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-widest">
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg)] text-[var(--text-secondary)]">
                          {tr('sauna.target', 'Target')}: {entry.targetTemp !== null ? `${entry.targetTemp.toFixed(1)}°` : '--'}
                        </span>
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg)] text-[var(--text-secondary)]">
                          {tr('sauna.healthScore.deviation', 'Deviation')}: {formatDeviationPercent(entry.deviationPct)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>,
      )}
    </div>
  );
}
