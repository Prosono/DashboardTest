import { useEffect, useMemo, useState } from 'react';
import { Activity, BarChart3, Calendar, Clock, Database, RefreshCw, Search, X } from '../icons';
import { getHistoryBatch } from '../services/haClient';
import DebugMultiSeriesChart from '../components/charts/DebugMultiSeriesChart';

const QUICK_WINDOWS = [6, 12, 24, 72];
const MAX_TIMELINE_EVENTS = 200;
const OVERLAY_COLORS = ['#60a5fa', '#a78bfa', '#f59e0b', '#34d399', '#f472b6', '#22d3ee', '#f87171'];
const MAX_CHART_POINTS = 360;

const asArray = (value) => (Array.isArray(value) ? value : []);
const norm = (value) => String(value ?? '').trim().toLowerCase();

function makeTr(t) {
  return (key, fallback) => {
    const out = typeof t === 'function' ? t(key) : undefined;
    const s = String(out ?? '');
    const unresolved = !s || s === key || s.toUpperCase() === s;
    return unresolved ? fallback : s;
  };
}

function parseTimestamp(entry) {
  const raw = entry?.last_changed
    || entry?.last_updated
    || entry?.last_reported
    || entry?.timestamp
    || entry?.start
    || entry?.end
    || entry?.time
    || entry?.l
    || entry?.lc
    || entry?.lu
    || entry?.lr;
  if (raw == null || raw === '') return null;
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const ms = raw > 1e12 ? raw : raw * 1000;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) {
      const ms = numeric > 1e12 ? numeric : numeric * 1000;
      const date = new Date(ms);
      return Number.isNaN(date.getTime()) ? null : date;
    }
    const date = new Date(trimmed);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(String(raw));
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseNumericState(entry) {
  const raw = entry?.state ?? entry?.s ?? entry?.mean ?? entry?.value ?? entry?.v;
  const numeric = Number.parseFloat(raw);
  if (Number.isFinite(numeric)) return numeric;
  const attrs = (entry?.attributes && typeof entry.attributes === 'object') ? entry.attributes : null;
  if (attrs) {
    const currentTemp = Number.parseFloat(attrs.current_temperature ?? attrs.current_temp);
    if (Number.isFinite(currentTemp)) return currentTemp;
    const targetTemp = Number.parseFloat(attrs.temperature ?? attrs.target_temperature);
    if (Number.isFinite(targetTemp)) return targetTemp;
  }
  return null;
}

function isTruthyState(stateValue) {
  const value = norm(stateValue);
  if (!value) return false;
  if (['on', 'open', 'unlocked', 'true', '1', 'yes', 'ja', 'active', 'heat', 'heating'].includes(value)) return true;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0;
}

function collectEntityIdsFromPayload(payload) {
  const ids = new Set(
    asArray(payload?.entityIds)
      .map((id) => String(id || '').trim())
      .filter(Boolean)
  );

  const settings = payload?.settings;
  if (settings && typeof settings === 'object') {
    Object.entries(settings).forEach(([key, value]) => {
      if (typeof value === 'string' && key.endsWith('EntityId')) {
        const normalized = value.trim();
        if (normalized) ids.add(normalized);
        return;
      }
      if (Array.isArray(value) && key.endsWith('EntityIds')) {
        value.forEach((entry) => {
          const normalized = String(entry || '').trim();
          if (normalized) ids.add(normalized);
        });
      }
    });
  }

  return Array.from(ids);
}

function getDayWindow(selectedDay) {
  const parts = String(selectedDay || '')
    .split('-')
    .map((part) => Number(part));
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) {
    return null;
  }
  const [year, month, day] = parts;
  const start = new Date(year, month - 1, day, 0, 0, 0, 0);
  const end = new Date(year, month - 1, day + 1, 0, 0, 0, 0);
  return { start, end };
}

function formatState(stateValue) {
  const value = String(stateValue ?? '').trim();
  if (!value) return '--';
  const normalized = value.toLowerCase();
  if (normalized === 'on') return 'On';
  if (normalized === 'off') return 'Off';
  if (normalized === 'unavailable') return 'Unavailable';
  if (normalized === 'unknown') return 'Unknown';
  if (normalized === 'open') return 'Open';
  if (normalized === 'closed') return 'Closed';
  if (normalized === 'true') return 'True';
  if (normalized === 'false') return 'False';
  return value;
}

function downsampleSeries(series, maxPoints = MAX_CHART_POINTS) {
  if (!Array.isArray(series) || series.length <= maxPoints || maxPoints < 2) return series;
  const lastIndex = series.length - 1;
  const step = lastIndex / (maxPoints - 1);
  const sampled = [];
  let previousIndex = -1;

  for (let i = 0; i < maxPoints; i += 1) {
    const index = Math.min(lastIndex, Math.round(i * step));
    if (index === previousIndex) continue;
    sampled.push(series[index]);
    previousIndex = index;
  }

  if (sampled[sampled.length - 1] !== series[lastIndex]) {
    sampled.push(series[lastIndex]);
  }
  return sampled;
}

function compactStateSteps(events) {
  if (!Array.isArray(events) || events.length <= 1) return events;
  const compacted = [events[0]];
  for (let index = 1; index < events.length; index += 1) {
    const prev = compacted[compacted.length - 1];
    const current = events[index];
    if (norm(prev.stateRaw) !== norm(current.stateRaw)) {
      compacted.push(current);
    }
  }
  return compacted;
}

export default function SaunaDebugModal({
  show,
  payload,
  entities,
  conn,
  onClose,
  t = (key) => key,
}) {
  const tr = useMemo(() => makeTr(t), [t]);
  const saunaName = String(payload?.saunaName || tr('sauna.name', 'Sauna')).trim();
  const entityIds = useMemo(() => collectEntityIdsFromPayload(payload), [payload]);

  const [mode, setMode] = useState('range');
  const [rangeHours, setRangeHours] = useState(24);
  const [selectedDay, setSelectedDay] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [historyByEntityId, setHistoryByEntityId] = useState({});
  const [selectedEntityIds, setSelectedEntityIds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fetchedAt, setFetchedAt] = useState(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [cursorSnapshot, setCursorSnapshot] = useState(null);
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < 1024;
  });
  const [showEntityPicker, setShowEntityPicker] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.innerWidth >= 1024;
  });

  const timeWindow = useMemo(() => {
    if (mode === 'day' && selectedDay) {
      const dayWindow = getDayWindow(selectedDay);
      if (dayWindow) return dayWindow;
    }
    const end = new Date();
    const start = new Date(end.getTime() - (Math.max(1, Number(rangeHours) || 24) * 60 * 60 * 1000));
    return { start, end };
  }, [mode, selectedDay, rangeHours]);

  const windowLabel = useMemo(() => {
    const { start, end } = timeWindow;
    const startText = start.toLocaleString();
    const endText = end.toLocaleString();
    return `${startText} - ${endText}`;
  }, [timeWindow]);

  useEffect(() => {
    if (!show) return;
    if (!conn || entityIds.length === 0) {
      setHistoryByEntityId({});
      return;
    }

    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError('');
      try {
        const next = await getHistoryBatch(conn, {
          entityIds,
          start: timeWindow.start,
          end: timeWindow.end,
          minimal_response: false,
          no_attributes: false,
        });
        if (cancelled) return;
        setHistoryByEntityId(next || {});
        setFetchedAt(new Date());
      } catch (fetchError) {
        if (cancelled) return;
        setError(String(fetchError?.message || tr('common.error', 'Failed to load history')));
        setHistoryByEntityId({});
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [show, conn, entityIds, timeWindow.start, timeWindow.end, refreshNonce, tr]);

  const summaries = useMemo(() => {
    return entityIds.map((entityId) => {
      const current = entities?.[entityId] || {};
      const name = current?.attributes?.friendly_name || entityId;
      const domain = entityId.split('.')[0] || 'entity';
      const raw = asArray(historyByEntityId?.[entityId]);
      const eventsAsc = raw
        .map((entry) => {
          const time = parseTimestamp(entry);
          if (!time) return null;
          const stateRaw = entry?.state ?? entry?.s ?? '';
          const numericValue = parseNumericState(entry);
          return {
            time,
            stateRaw,
            stateNormalized: norm(stateRaw),
            numericValue: Number.isFinite(numericValue) ? numericValue : null,
          };
        })
        .filter(Boolean)
        .sort((a, b) => a.time - b.time);

      let changeCount = 0;
      for (let i = 1; i < eventsAsc.length; i += 1) {
        if (eventsAsc[i].stateNormalized !== eventsAsc[i - 1].stateNormalized) {
          changeCount += 1;
        }
      }

      const numericPoints = eventsAsc.filter((event) => Number.isFinite(event.numericValue));
      const numericValues = numericPoints.map((event) => event.numericValue);
      const hasNumericHistory = numericValues.length >= 2;
      const avg = numericValues.length
        ? (numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length)
        : null;

      const stateSteps = compactStateSteps(eventsAsc);
      const sparkDataBase = hasNumericHistory
        ? numericPoints.map((event) => ({ value: event.numericValue, time: event.time }))
        : stateSteps.map((event) => ({
          value: isTruthyState(event.stateRaw) ? 1 : 0,
          time: event.time,
        }));
      const sparkData = downsampleSeries(sparkDataBase, MAX_CHART_POINTS);

      const timeline = [...eventsAsc]
        .sort((a, b) => b.time - a.time)
        .slice(0, MAX_TIMELINE_EVENTS);

      return {
        entityId,
        domain,
        name,
        eventCount: eventsAsc.length,
        changeCount,
        min: numericValues.length ? Math.min(...numericValues) : null,
        max: numericValues.length ? Math.max(...numericValues) : null,
        avg,
        chartVariant: hasNumericHistory ? 'line' : 'bars',
        sparkData,
        timeline,
        currentState: current?.state,
        currentLastChanged: current?.last_changed ? new Date(current.last_changed) : null,
      };
    });
  }, [entityIds, entities, historyByEntityId]);

  const filteredSummaries = useMemo(() => {
    const query = norm(searchTerm);
    if (!query) return summaries;
    return summaries.filter((summary) => {
      return norm(summary.name).includes(query) || norm(summary.entityId).includes(query) || norm(summary.domain).includes(query);
    });
  }, [summaries, searchTerm]);

  useEffect(() => {
    if (!filteredSummaries.length) {
      if (selectedEntityIds.length > 0) setSelectedEntityIds([]);
      return;
    }
    const visibleIds = new Set(filteredSummaries.map((summary) => summary.entityId));
    const nextSelected = selectedEntityIds.filter((entityId) => visibleIds.has(entityId)).slice(0, 6);
    if (nextSelected.length === 0) {
      nextSelected.push(filteredSummaries[0].entityId);
    }
    const changed = (
      nextSelected.length !== selectedEntityIds.length
      || nextSelected.some((entityId, index) => entityId !== selectedEntityIds[index])
    );
    if (changed) {
      setSelectedEntityIds(nextSelected);
    }
  }, [filteredSummaries, selectedEntityIds]);

  const selectedSummaries = useMemo(() => {
    return selectedEntityIds
      .map((entityId) => summaries.find((summary) => summary.entityId === entityId))
      .filter(Boolean);
  }, [selectedEntityIds, summaries]);
  const selectedSummary = selectedSummaries[0] || null;
  const chartSeries = useMemo(() => {
    return selectedSummaries
      .filter((summary) => Array.isArray(summary.sparkData) && summary.sparkData.length > 1)
      .map((summary, index) => ({
        id: `series-${summary.entityId}`,
        label: summary.name,
        color: OVERLAY_COLORS[index % OVERLAY_COLORS.length],
        strokeWidth: index === 0 ? 1.1 : 1.0,
        data: summary.sparkData,
        entityId: summary.entityId,
      }));
  }, [selectedSummaries]);
  const primarySeries = chartSeries[0] || null;
  const combinedHistory = useMemo(() => {
    const colorByEntity = new Map(chartSeries.map((series) => [series.entityId, series.color]));
    return selectedSummaries
      .flatMap((summary) => summary.timeline.map((event) => ({
        ...event,
        entityId: summary.entityId,
        entityName: summary.name,
        color: colorByEntity.get(summary.entityId) || '#93c5fd',
      })))
      .sort((a, b) => b.time - a.time)
      .slice(0, MAX_TIMELINE_EVENTS);
  }, [selectedSummaries, chartSeries]);

  const summaryStats = useMemo(() => {
    const totalEvents = summaries.reduce((sum, summary) => sum + summary.eventCount, 0);
    const changedEntities = summaries.filter((summary) => summary.changeCount > 0).length;
    const numericEntities = summaries.filter((summary) => summary.sparkData.length > 1 && summary.chartVariant === 'line').length;
    return {
      totalEntities: summaries.length,
      totalEvents,
      changedEntities,
      numericEntities,
    };
  }, [summaries]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleResize = () => {
      const nextIsMobile = window.innerWidth < 1024;
      setIsMobile(nextIsMobile);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    setShowEntityPicker(!isMobile);
  }, [isMobile]);

  if (!show) return null;

  return (
    <div
      className={`fixed inset-0 z-[155] flex ${isMobile ? 'items-stretch justify-stretch p-0' : 'items-center justify-center p-3 sm:p-6'}`}
      style={{ backdropFilter: 'blur(16px)', backgroundColor: isMobile ? 'rgba(2, 8, 20, 0.3)' : 'rgba(0, 0, 0, 0.45)' }}
      onClick={onClose}
      data-disable-pull-refresh="true"
    >
      {isMobile && (
        <>
          <div
            className="pointer-events-none absolute inset-x-0 top-0 z-[1]"
            style={{
              height: 'calc(env(safe-area-inset-top, 0px) + 24px)',
              background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.44) 0%, rgba(15, 23, 42, 0.18) 65%, rgba(15, 23, 42, 0) 100%)',
            }}
          />
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 z-[1]"
            style={{
              height: 'calc(env(safe-area-inset-bottom, 0px) + 24px)',
              background: 'linear-gradient(0deg, rgba(15, 23, 42, 0.44) 0%, rgba(15, 23, 42, 0.18) 65%, rgba(15, 23, 42, 0) 100%)',
            }}
          />
        </>
      )}

      {isMobile && (
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 z-[30] modal-close"
          style={{ top: 'calc(env(safe-area-inset-top, 0px) + 8px)' }}
          aria-label={tr('common.close', 'Close')}
        >
          <X className="w-4 h-4" />
        </button>
      )}

      <div
        className={`w-full overflow-hidden popup-anim ${
          isMobile
            ? 'h-[100dvh] max-h-[100dvh] rounded-none border-0 flex flex-col'
            : 'max-w-7xl max-h-[94vh] rounded-3xl border'
        }`}
        style={{
          background: isMobile ? 'transparent' : 'linear-gradient(135deg, var(--card-bg) 0%, var(--modal-bg) 100%)',
          borderColor: 'var(--glass-border)',
          color: 'var(--text-primary)',
        }}
        onClick={(event) => event.stopPropagation()}
        data-disable-pull-refresh="true"
      >
        <div
          className="p-4 sm:p-5 border-b border-[var(--glass-border)] space-y-3"
          style={isMobile ? { paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)' } : undefined}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.24em] font-bold text-[var(--text-secondary)] truncate">
                {saunaName}
              </p>
              <h3 className="text-lg sm:text-xl font-semibold text-[var(--text-primary)] truncate">
                {tr('sauna.debugTitle', 'Debug overview')}
              </h3>
              <p className="text-xs text-[var(--text-secondary)] mt-1 truncate">
                {windowLabel}
              </p>
            </div>
            <button type="button" onClick={onClose} className={`modal-close ${isMobile ? 'hidden' : ''}`} aria-label={tr('common.close', 'Close')}>
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {QUICK_WINDOWS.map((hours) => {
              const active = mode === 'range' && rangeHours === hours;
              return (
                <button
                  key={hours}
                  type="button"
                  onClick={() => {
                    setMode('range');
                    setRangeHours(hours);
                  }}
                  className={`px-3 py-1.5 rounded-full border text-[11px] font-semibold transition ${
                    active
                      ? 'bg-blue-500/20 border-blue-400/40 text-blue-200'
                      : 'bg-[var(--glass-bg)] border-[var(--glass-border)] text-[var(--text-secondary)]'
                  }`}
                >
                  {hours}h
                </button>
              );
            })}

            <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border bg-[var(--glass-bg)] border-[var(--glass-border)] text-[var(--text-secondary)]">
              <Calendar className="w-3.5 h-3.5" />
              <input
                type="date"
                value={selectedDay}
                onChange={(event) => {
                  const next = event.target.value;
                  setSelectedDay(next);
                  setMode(next ? 'day' : 'range');
                }}
                className="bg-transparent text-[11px] outline-none"
              />
            </label>

            {mode === 'day' && (
              <button
                type="button"
                onClick={() => {
                  setMode('range');
                  setSelectedDay('');
                }}
                className="px-3 py-1.5 rounded-full border text-[11px] font-semibold bg-[var(--glass-bg)] border-[var(--glass-border)] text-[var(--text-secondary)]"
              >
                {tr('sauna.debugLiveWindow', 'Use live window')}
              </button>
            )}

            <button
              type="button"
              onClick={() => setRefreshNonce((prev) => prev + 1)}
              className={`${isMobile ? '' : 'ml-auto'} px-3 py-1.5 rounded-full border text-[11px] font-semibold bg-[var(--glass-bg)] border-[var(--glass-border)] text-[var(--text-secondary)] inline-flex items-center gap-1.5`}
              title={tr('common.refresh', 'Refresh')}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              {tr('common.refresh', 'Refresh')}
            </button>

            {isMobile && (
              <button
                type="button"
                onClick={() => setShowEntityPicker((prev) => !prev)}
                className="px-3 py-1.5 rounded-full border text-[11px] font-semibold bg-[var(--glass-bg)] border-[var(--glass-border)] text-[var(--text-secondary)]"
              >
                {showEntityPicker
                  ? tr('common.close', 'Close')
                  : `${tr('sauna.debugEntities', 'Entities')} (${selectedEntityIds.length})`}
              </button>
            )}
          </div>
        </div>

        <div className="p-4 sm:p-5 grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 border-b border-[var(--glass-border)]">
          <div className="rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-3">
            <div className="text-[10px] uppercase tracking-widest text-[var(--text-secondary)]">{tr('sauna.debugEntities', 'Entities')}</div>
            <div className="mt-1 text-xl font-bold">{summaryStats.totalEntities}</div>
          </div>
          <div className="rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-3">
            <div className="text-[10px] uppercase tracking-widest text-[var(--text-secondary)]">{tr('sauna.debugEvents', 'Events')}</div>
            <div className="mt-1 text-xl font-bold">{summaryStats.totalEvents}</div>
          </div>
          <div className="rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-3">
            <div className="text-[10px] uppercase tracking-widest text-[var(--text-secondary)]">{tr('sauna.debugChanged', 'Changed entities')}</div>
            <div className="mt-1 text-xl font-bold">{summaryStats.changedEntities}</div>
          </div>
          <div className="rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-3">
            <div className="text-[10px] uppercase tracking-widest text-[var(--text-secondary)]">{tr('sauna.debugNumeric', 'Numeric entities')}</div>
            <div className="mt-1 text-xl font-bold">{summaryStats.numericEntities}</div>
          </div>
        </div>

        <div
          className={`overflow-hidden ${
            isMobile
              ? 'flex-1 min-h-0 flex flex-col'
              : 'h-[calc(94vh-250px)] min-h-[360px] grid lg:grid-cols-[320px_1fr]'
          }`}
          data-disable-pull-refresh="true"
        >
          <div
            className={`overflow-y-auto custom-scrollbar ${
              isMobile
                ? `space-y-2.5 border-b border-[var(--glass-border)] transition-all duration-300 ease-out overflow-hidden ${
                  showEntityPicker
                    ? 'max-h-[40dvh] opacity-100 translate-y-0 p-3'
                    : 'max-h-0 opacity-0 -translate-y-2 p-0 border-b-0 pointer-events-none'
                }`
                : 'border-r border-[var(--glass-border)] p-4 space-y-3'
            }`}
          >
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
              <input
                type="text"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder={tr('sauna.debugSearchEntities', 'Search entities')}
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] text-sm outline-none focus:border-blue-400/40"
              />
            </div>
            <div className="text-[11px] text-[var(--text-secondary)]">
              {tr('sauna.debugSelectedCount', 'Selected')}: {selectedEntityIds.length}
            </div>

            {loading && (
              <div className="rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-3 text-xs text-[var(--text-secondary)]">
                {tr('common.loading', 'Loading')}...
              </div>
            )}
            {!!error && (
              <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
                {error}
              </div>
            )}

            <div className="space-y-2">
              {filteredSummaries.map((summary) => {
                const active = selectedEntityIds.includes(summary.entityId);
                return (
                  <button
                    key={summary.entityId}
                    type="button"
                    onClick={() => {
                      setSelectedEntityIds((prev) => {
                        if (prev.includes(summary.entityId)) {
                          if (prev.length === 1) return prev;
                          return prev.filter((id) => id !== summary.entityId);
                        }
                        return [...prev, summary.entityId].slice(0, 6);
                      });
                    }}
                    className={`w-full text-left rounded-2xl border p-3 transition ${
                      active
                        ? 'bg-blue-500/16 border-blue-400/35'
                        : 'bg-[var(--glass-bg)] border-[var(--glass-border)]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{summary.name}</p>
                      <div className="flex items-center gap-1">
                        <span className={`w-2 h-2 rounded-full ${active ? 'bg-blue-300' : 'bg-transparent border border-[var(--glass-border)]'}`} />
                        <span className="px-2 py-0.5 rounded-full text-[10px] uppercase tracking-widest border border-[var(--glass-border)] text-[var(--text-secondary)]">
                          {summary.domain}
                        </span>
                      </div>
                    </div>
                    <p className="mt-1 text-[11px] text-[var(--text-secondary)] truncate">{summary.entityId}</p>
                    <div className="mt-2 flex items-center gap-2 text-[11px] text-[var(--text-secondary)]">
                      <span className="inline-flex items-center gap-1"><Database className="w-3 h-3" />{summary.eventCount}</span>
                      <span className="inline-flex items-center gap-1"><Activity className="w-3 h-3" />{summary.changeCount}</span>
                    </div>
                  </button>
                );
              })}
              {!loading && filteredSummaries.length === 0 && (
                <div className="rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-3 text-xs text-[var(--text-secondary)]">
                  {tr('sauna.debugNoEntities', 'No matching entities')}
                </div>
              )}
            </div>
          </div>

          <div className={`${isMobile ? 'flex-1 p-3' : 'p-4'} overflow-y-auto custom-scrollbar`}>
            {!selectedSummary && (
              <div className="h-full rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-5 text-sm text-[var(--text-secondary)] flex items-center justify-center">
                {tr('sauna.debugSelectEntity', 'Select an entity to inspect history')}
              </div>
            )}

            {selectedSummary && (
              <div className="space-y-3">
                {isMobile && selectedSummaries.length > 0 && (
                  <div className="rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-2.5">
                    <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-[var(--text-secondary)] mb-2">
                      {tr('sauna.debugSelectedCount', 'Selected')}: {selectedEntityIds.length}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedSummaries.map((summary) => (
                        <button
                          key={`mobile-selected-${summary.entityId}`}
                          type="button"
                          onClick={() => {
                            setSelectedEntityIds((prev) => {
                              if (!prev.includes(summary.entityId)) return prev;
                              if (prev.length <= 1) return prev;
                              return prev.filter((id) => id !== summary.entityId);
                            });
                          }}
                          className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full border border-[var(--glass-border)] bg-[var(--card-bg)] text-[11px] text-[var(--text-secondary)]"
                          title={summary.entityId}
                        >
                          <span className="w-2 h-2 rounded-full bg-blue-300" />
                          <span className="max-w-[140px] truncate">{summary.name}</span>
                          <X className="w-3 h-3" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{selectedSummary.name}</p>
                      <p className="text-xs text-[var(--text-secondary)] mt-1 break-all">{selectedSummary.entityId}</p>
                    </div>
                    <div className="text-right text-xs text-[var(--text-secondary)]">
                      <div>{tr('common.state', 'State')}: {formatState(selectedSummary.currentState)}</div>
                      <div className="mt-1">{tr('common.updated', 'Updated')}: {selectedSummary.currentLastChanged ? selectedSummary.currentLastChanged.toLocaleString() : '--'}</div>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 lg:grid-cols-5 gap-2">
                    <div className="rounded-xl border border-[var(--glass-border)] px-3 py-2">
                      <div className="text-[10px] uppercase tracking-widest text-[var(--text-secondary)]">{tr('sauna.debugChanges', 'Changes')}</div>
                      <div className="text-lg font-bold">{selectedSummary.changeCount}</div>
                    </div>
                    <div className="rounded-xl border border-[var(--glass-border)] px-3 py-2">
                      <div className="text-[10px] uppercase tracking-widest text-[var(--text-secondary)]">{tr('sauna.debugEvents', 'Events')}</div>
                      <div className="text-lg font-bold">{selectedSummary.eventCount}</div>
                    </div>
                    <div className="rounded-xl border border-[var(--glass-border)] px-3 py-2">
                      <div className="text-[10px] uppercase tracking-widest text-[var(--text-secondary)]">{tr('sauna.debugMin', 'Min')}</div>
                      <div className="text-lg font-bold">{Number.isFinite(selectedSummary.min) ? selectedSummary.min.toFixed(1) : '--'}</div>
                    </div>
                    <div className="rounded-xl border border-[var(--glass-border)] px-3 py-2">
                      <div className="text-[10px] uppercase tracking-widest text-[var(--text-secondary)]">{tr('sauna.debugAvg', 'Avg')}</div>
                      <div className="text-lg font-bold">{Number.isFinite(selectedSummary.avg) ? selectedSummary.avg.toFixed(1) : '--'}</div>
                    </div>
                    <div className="rounded-xl border border-[var(--glass-border)] px-3 py-2">
                      <div className="text-[10px] uppercase tracking-widest text-[var(--text-secondary)]">{tr('sauna.debugMax', 'Max')}</div>
                      <div className="text-lg font-bold">{Number.isFinite(selectedSummary.max) ? selectedSummary.max.toFixed(1) : '--'}</div>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-4">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <p className="text-[11px] uppercase tracking-[0.2em] font-bold text-[var(--text-secondary)] inline-flex items-center gap-2">
                      <BarChart3 className="w-4 h-4" />
                      {tr('sauna.debugTrend', 'Trend')}
                    </p>
                    <p className="text-[11px] text-[var(--text-secondary)]">{windowLabel}</p>
                  </div>
                  <div className="mb-2 flex flex-wrap gap-2">
                    {chartSeries.map((series, index) => (
                      <span
                        key={series.id}
                        className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full border text-[10px] border-[var(--glass-border)] text-[var(--text-secondary)]"
                      >
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: series.color }} />
                        <span className={index === 0 ? 'font-semibold' : ''}>{series.label}</span>
                      </span>
                    ))}
                  </div>
                  {primarySeries ? (
                    <DebugMultiSeriesChart
                      series={chartSeries}
                      height={isMobile ? 146 : 168}
                      normalizeSeries={chartSeries.length > 1}
                      lineStrokeWidth={1.0}
                      onCursorSnapshotChange={setCursorSnapshot}
                    />
                  ) : (
                    <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--card-bg)] px-3 py-6 text-center text-xs text-[var(--text-secondary)]">
                      {tr('sauna.debugNoTrendData', 'No trend data for selected entities')}
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-4">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <p className="text-[11px] uppercase tracking-[0.2em] font-bold text-[var(--text-secondary)] inline-flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      {tr('common.history', 'History')}
                    </p>
                    <p className="text-[11px] text-[var(--text-secondary)]">
                      {cursorSnapshot?.time ? `${tr('sauna.debugCursor', 'Cursor')}: ${cursorSnapshot.time.toLocaleTimeString()} - ` : ''}
                      {combinedHistory.length} {tr('sauna.debugRows', 'rows')}
                      {fetchedAt ? ` - ${tr('common.updated', 'Updated')}: ${fetchedAt.toLocaleTimeString()}` : ''}
                    </p>
                  </div>
                  <div className={`${isMobile ? 'max-h-[42dvh]' : 'max-h-[360px]'} overflow-y-auto custom-scrollbar space-y-2 pr-1`}>
                    {combinedHistory.map((event, index) => (
                      <div key={`${event.entityId}_${event.time.getTime()}_${index}`} className="rounded-xl border border-[var(--glass-border)] bg-[var(--card-bg)] px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: event.color }} />
                            <p className="text-xs text-[var(--text-secondary)] truncate">{event.entityName}</p>
                            <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{formatState(event.stateRaw)}</p>
                          </div>
                          <p className="text-[11px] text-[var(--text-secondary)]">{event.time.toLocaleString()}</p>
                        </div>
                        <div className="mt-1 text-[11px] text-[var(--text-secondary)]">
                          {Number.isFinite(event.numericValue) ? `${tr('sauna.debugValue', 'Value')}: ${event.numericValue.toFixed(2)}` : `${tr('common.state', 'State')}: ${formatState(event.stateRaw)}`}
                        </div>
                      </div>
                    ))}
                    {combinedHistory.length === 0 && (
                      <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--card-bg)] px-3 py-2 text-xs text-[var(--text-secondary)]">
                        {tr('sauna.debugNoHistory', 'No history in selected window')}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
