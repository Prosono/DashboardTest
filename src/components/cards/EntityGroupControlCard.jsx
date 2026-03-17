import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Fan, DoorOpen, Activity, Lock, ToggleRight, Hash, Camera, Shield, AlarmClock, ListChecks, Zap, Workflow } from '../../icons';
import SparkLine from '../charts/SparkLine';
import { getHistoryBatch } from '../../services';
import { HISTORY_REFRESH_INTERVAL, INITIAL_FETCH_DELAY } from '../../config/constants';

const norm = (v) => String(v ?? '').toLowerCase();
const HISTORYLESS_FIELD_TYPES = new Set(['number', 'select', 'button', 'script']);
const HISTORY_WINDOW_MS = 24 * 60 * 60 * 1000;
const DEFAULT_GRAPH_COLOR = '#94a3b8';
const ACTIVE_GRAPH_COLOR = '#34d399';
const HIGH_ACTIVITY_GRAPH_COLOR = '#f59e0b';

export const isEntityGroupActive = (fieldType, state) => {
  const normalized = norm(state);

  if (fieldType === 'lock') return normalized === 'unlocked';
  if (fieldType === 'camera') return Boolean(normalized) && !['off', 'idle', 'unavailable', 'unknown'].includes(normalized);
  if (fieldType === 'alarm') return normalized.startsWith('armed') || normalized === 'triggered';
  if (fieldType === 'timer') return normalized === 'active' || normalized === 'paused';

  return ['on', 'open', 'true', '1', 'unlocked', 'heat', 'heating'].includes(normalized);
};

const parseHistoryTime = (entry) => {
  const raw = entry?.last_changed
    || entry?.last_updated
    || entry?.last_reported
    || entry?.timestamp
    || entry?.time
    || entry?.lc
    || entry?.lu
    || entry?.lr;

  if (!raw) return null;

  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime()) ? null : raw;
  }

  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const date = new Date(raw > 1e12 ? raw : raw * 1000);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(String(raw));
  return Number.isNaN(date.getTime()) ? null : date;
};

const parseHistoryState = (entry) => entry?.state ?? entry?.s ?? null;

const compactActivitySeries = (points) => {
  if (!Array.isArray(points) || points.length <= 2) return points;

  const compacted = [points[0]];

  for (let index = 1; index < points.length; index += 1) {
    const point = points[index];
    const previous = compacted[compacted.length - 1];
    const previousTime = new Date(previous.time).getTime();
    const pointTime = new Date(point.time).getTime();

    if (previousTime === pointTime && previous.value === point.value) continue;
    compacted.push(point);
  }

  return compacted;
};

export const buildGroupActivitySeries = ({
  entityIds,
  historyById,
  entities,
  fieldType,
  start,
  end,
}) => {
  const startMs = start instanceof Date ? start.getTime() : NaN;
  const endMs = end instanceof Date ? end.getTime() : NaN;

  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return [];

  const ids = Array.isArray(entityIds) ? entityIds.filter(Boolean) : [];
  if (!ids.length) return [];

  const currentStateById = {};
  const timelineEvents = [];

  ids.forEach((entityId) => {
    const rawHistory = Array.isArray(historyById?.[entityId]) ? historyById[entityId] : [];
    const entries = rawHistory
      .map((entry) => {
        const time = parseHistoryTime(entry);
        const state = parseHistoryState(entry);
        if (!time || state === null || state === undefined) return null;
        return { time, state };
      })
      .filter(Boolean)
      .sort((a, b) => a.time.getTime() - b.time.getTime());

    const lastKnownEntry = [...entries].reverse().find((entry) => entry.time.getTime() <= startMs);
    const firstVisibleEntry = entries.find((entry) => entry.time.getTime() >= startMs);

    currentStateById[entityId] = lastKnownEntry?.state
      ?? firstVisibleEntry?.state
      ?? entities?.[entityId]?.state
      ?? null;

    entries.forEach((entry) => {
      const entryMs = entry.time.getTime();
      if (entryMs <= startMs || entryMs > endMs) return;
      timelineEvents.push({ entityId, time: entry.time, state: entry.state });
    });
  });

  let activeCount = ids.filter((entityId) => isEntityGroupActive(fieldType, currentStateById[entityId])).length;
  const points = [{ time: start, value: activeCount }];

  timelineEvents
    .sort((a, b) => a.time.getTime() - b.time.getTime())
    .forEach((event) => {
      const eventMs = event.time.getTime();
      const previousState = currentStateById[event.entityId];
      const wasActive = isEntityGroupActive(fieldType, previousState);
      const isActive = isEntityGroupActive(fieldType, event.state);

      if (wasActive === isActive && norm(previousState) === norm(event.state)) {
        currentStateById[event.entityId] = event.state;
        return;
      }

      points.push({ time: new Date(eventMs), value: activeCount });
      activeCount += (isActive ? 1 : 0) - (wasActive ? 1 : 0);
      points.push({ time: new Date(eventMs), value: activeCount });
      currentStateById[event.entityId] = event.state;
    });

  points.push({ time: end, value: activeCount });
  return compactActivitySeries(points);
};

const iconByType = {
  fan: Fan,
  door: DoorOpen,
  motion: Activity,
  lock: Lock,
  switch: ToggleRight,
  number: Hash,
  camera: Camera,
  alarm: Shield,
  timer: AlarmClock,
  select: ListChecks,
  button: Zap,
  script: Workflow,
};

const fallbackTitleByType = {
  fan: 'Vifter',
  door: 'Dorer',
  motion: 'Bevegelse',
  lock: 'Laser',
  switch: 'Brytere',
  number: 'Nummer',
  camera: 'Kamera',
  alarm: 'Alarm',
  timer: 'Timer',
  select: 'Valg',
  button: 'Knapper',
  script: 'Scener',
};

export default function EntityGroupControlCard({
  cardId,
  settings,
  entities,
  conn,
  dragProps,
  controls,
  cardStyle,
  editMode,
  customNames,
  customIcons,
  onOpen,
  t,
}) {
  const fieldType = settings?.fieldType || 'switch';
  const ids = useMemo(
    () => (Array.isArray(settings?.entityIds) ? settings.entityIds.filter(Boolean) : []),
    [settings?.entityIds],
  );
  const availableIds = useMemo(() => ids.filter((id) => entities?.[id]), [ids, entities]);
  const availableIdsKey = useMemo(() => availableIds.join('|'), [availableIds]);
  const showHistoryGraph = !HISTORYLESS_FIELD_TYPES.has(fieldType) && availableIds.length > 0;
  const [historySeries, setHistorySeries] = useState([]);
  const [isVisible, setIsVisible] = useState(false);
  const cardRef = useRef(null);
  const availableIdsRef = useRef([]);
  const entityStatesRef = useRef({});

  useEffect(() => {
    availableIdsRef.current = availableIds;
    entityStatesRef.current = availableIds.reduce((acc, entityId) => {
      acc[entityId] = entities?.[entityId]?.state ?? null;
      return acc;
    }, {});
  }, [availableIds, availableIdsKey, entities]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '220px' },
    );

    if (cardRef.current) {
      observer.observe(cardRef.current);
    }

    return () => observer.disconnect();
  }, []);

  const activeCount = useMemo(() => {
    if (HISTORYLESS_FIELD_TYPES.has(fieldType)) return availableIds.length;
    return availableIds.filter((id) => isEntityGroupActive(fieldType, entities?.[id]?.state)).length;
  }, [availableIds, entities, fieldType]);

  const total = availableIds.length;
  const Icon = customIcons?.[cardId] ? iconByType[fieldType] || ToggleRight : iconByType[fieldType] || ToggleRight;
  const titleFallback = fallbackTitleByType[fieldType] || 'Gruppe';
  const title = customNames?.[cardId] || settings?.title || titleFallback;
  const graphColor = total > 0 && activeCount / total >= 0.6
    ? HIGH_ACTIVITY_GRAPH_COLOR
    : activeCount > 0
      ? ACTIVE_GRAPH_COLOR
      : DEFAULT_GRAPH_COLOR;

  const value = fieldType === 'number' || fieldType === 'select' || fieldType === 'button' || fieldType === 'script'
    ? `${total}`
    : `${activeCount}/${total}`;

  const badge = fieldType === 'number' || fieldType === 'select' || fieldType === 'button' || fieldType === 'script'
    ? (t?.('common.entities') || 'entiteter')
    : fieldType === 'camera'
      ? (t?.('common.active') || 'aktiv')
      : fieldType === 'alarm'
        ? (t?.('common.armed') || 'armert')
        : fieldType === 'timer'
          ? (t?.('common.running') || 'kjører')
          : (t?.('common.on') || 'på');

  useEffect(() => {
    if (!conn || !showHistoryGraph || !isVisible) {
      setHistorySeries([]);
      return undefined;
    }

    let cancelled = false;
    let intervalId;
    let idleId;
    let timerId;

    const loadHistory = async () => {
      try {
        const end = new Date();
        const start = new Date(end.getTime() - HISTORY_WINDOW_MS);
        const historyById = await getHistoryBatch(conn, {
          entityIds: availableIdsRef.current,
          start,
          end,
          minimal_response: true,
          no_attributes: true,
        });

        if (cancelled) return;

        const series = buildGroupActivitySeries({
          entityIds: availableIdsRef.current,
          historyById,
          entities: availableIdsRef.current.reduce((acc, entityId) => {
            acc[entityId] = { state: entityStatesRef.current[entityId] };
            return acc;
          }, {}),
          fieldType,
          start,
          end,
        });

        setHistorySeries(series);
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to fetch entity group history', error);
          setHistorySeries([]);
        }
      }
    };

    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      idleId = window.requestIdleCallback(() => {
        loadHistory();
      }, { timeout: 4000 });
    } else {
      timerId = window.setTimeout(() => {
        loadHistory();
      }, Math.random() * INITIAL_FETCH_DELAY);
    }

    intervalId = window.setInterval(() => {
      loadHistory();
    }, HISTORY_REFRESH_INTERVAL);

    return () => {
      cancelled = true;
      if (idleId && typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
        window.cancelIdleCallback(idleId);
      }
      if (timerId) {
        window.clearTimeout(timerId);
      }
      if (intervalId) {
        window.clearInterval(intervalId);
      }
    };
  }, [conn, fieldType, isVisible, showHistoryGraph, availableIdsKey]);

  return (
    <button
      ref={cardRef}
      type="button"
      {...dragProps}
      onClick={() => { if (!editMode) onOpen?.(); }}
      className={`w-full h-full p-4 rounded-2xl border text-left relative overflow-hidden transition-all ${editMode ? 'cursor-move' : 'cursor-pointer active:scale-[0.99]'} bg-[var(--glass-bg)] border-[var(--glass-border)]`}
      style={cardStyle}
    >
      {historySeries.length > 1 && (
        <>
          <div
            className="absolute inset-0 pointer-events-none z-0"
            style={{
              background: `radial-gradient(circle at 88% 14%, ${graphColor}22 0%, transparent 42%)`,
            }}
          />
          <div className="absolute inset-x-0 bottom-0 h-24 z-0 pointer-events-none opacity-55">
            <SparkLine
              data={historySeries}
              height={110}
              currentIndex={historySeries.length - 1}
              useTimeScale
              curve="linear"
              showCurrentMarker={false}
              areaFill={false}
              lineStrokeWidth={2.2}
              primaryColor={graphColor}
            />
            <div
              className="absolute inset-0"
              style={{
                background: 'linear-gradient(to top, var(--glass-bg) 0%, color-mix(in srgb, var(--glass-bg) 35%, transparent) 48%, transparent 100%)',
              }}
            />
          </div>
        </>
      )}
      <div className="relative z-20">
        {controls}
      </div>
      <div className="relative z-10 flex items-center gap-3">
        <div className={`w-11 h-11 rounded-xl border flex items-center justify-center ${activeCount > 0 ? 'bg-emerald-500/14 border-emerald-500/28 text-emerald-300' : 'bg-[var(--glass-bg-hover)] border-[var(--glass-border)] text-[var(--text-secondary)]'}`}>
          <Icon className={`w-5 h-5 ${activeCount > 0 ? (fieldType === 'fan' ? 'animate-[fanSpin_1.25s_linear_infinite]' : 'animate-pulse') : ''}`} />
        </div>
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.22em] font-extrabold text-[var(--text-secondary)]">
            {fieldType}
          </div>
          <div className="text-lg font-bold leading-tight text-[var(--text-primary)] truncate">{title}</div>
        </div>
      </div>
      <div className="relative z-10 mt-4 flex items-end justify-between">
        <div className="text-3xl font-semibold leading-none tabular-nums text-[var(--text-primary)]">
          {value}
        </div>
        <div className="text-[10px] uppercase tracking-widest font-bold text-[var(--text-secondary)]">
          {badge}
        </div>
      </div>
      <style>{`
        @keyframes fanSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </button>
  );
}
