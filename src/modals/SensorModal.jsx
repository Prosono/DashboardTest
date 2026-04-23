import { useState, useEffect, useMemo } from 'react';
import { X, Activity, AlertTriangle } from 'lucide-react';
import { logger } from '../utils/logger';
import { getHistory, getHistoryBatch, getHistoryRest, getStatistics } from '../services/haClient';
import SensorHistoryGraph from '../components/charts/SensorHistoryGraph';
import BinaryTimeline from '../components/charts/BinaryTimeline';
import { formatRelativeTime } from '../utils';
import { getIconComponent } from '../icons';

const HISTORY_PRESET_OPTIONS = [1, 3, 6, 12, 24, 48, 72, 168, 336, 720];
const OVERLAY_COLOR_PALETTE = ['#38bdf8', '#ef4444', '#a855f7', '#22c55e', '#f59e0b', '#14b8a6', '#f97316', '#e879f9'];

const makeTr = (t) => (key, fallback) => {
  const out = typeof t === 'function' ? t(key) : undefined;
  const str = String(out ?? '').trim();
  return !str || str === key || str.toLowerCase() === key.toLowerCase() ? fallback : str;
};

const pad2 = (value) => String(value).padStart(2, '0');

const toDateTimeLocalInputValue = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
};

const parseDateTimeLocalInputValue = (value) => {
  const parsed = new Date(String(value || '').trim());
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const buildPresetHistoryWindow = (hours) => {
  const safeHours = Math.max(1, Number(hours) || 24);
  const end = new Date();
  const start = new Date(end.getTime() - (safeHours * 60 * 60 * 1000));
  return {
    mode: 'preset',
    presetHours: safeHours,
    start,
    end,
  };
};

const formatPresetHistoryLabel = (hours) => {
  const safeHours = Math.max(1, Number(hours) || 1);
  if (safeHours >= 24 && safeHours % 24 === 0) return `${safeHours / 24}D`;
  return `${safeHours}H`;
};

const getOverlayDefaultActiveStates = (entityId, entityData) => {
  const domain = String(entityId || '').split('.')[0] || '';
  const deviceClass = String(entityData?.attributes?.device_class || '').toLowerCase();

  if (domain === 'binary_sensor') {
    if (['door', 'window', 'garage_door'].includes(deviceClass)) return ['on', 'open', 'opening'];
    if (['motion', 'occupancy', 'presence'].includes(deviceClass)) return ['on', 'true', '1', 'detected', 'occupied', 'presence'];
    if (deviceClass === 'lock') return ['on', 'unlocked'];
    if (deviceClass === 'moisture') return ['on', 'wet'];
    if (deviceClass === 'smoke') return ['on', 'detected'];
  }

  if (['switch', 'input_boolean', 'automation', 'fan', 'light'].includes(domain)) return ['on', 'true', '1', 'yes'];
  if (domain === 'cover') return ['on', 'open', 'opening'];
  if (domain === 'lock') return ['unlocked'];
  if (domain === 'media_player') return ['playing', 'on', 'buffering'];
  if (domain === 'climate') return ['heat', 'heating', 'cool', 'cooling', 'fan_only', 'dry', 'on'];

  return ['on', 'true', '1', 'yes', 'active', 'open', 'heat', 'heating', 'playing'];
};

const buildDefaultOverlayConfig = (entityId, entityData, index = 0) => ({
  entityId,
  label: entityData?.attributes?.friendly_name || entityId,
  color: OVERLAY_COLOR_PALETTE[index % OVERLAY_COLOR_PALETTE.length],
  activeStates: getOverlayDefaultActiveStates(entityId, entityData),
  initialState: entityData?.state ?? '',
  source: 'manual',
});

const dedupeOverlayConfigs = (items = []) => {
  const byId = new Map();
  items.forEach((item, index) => {
    const entityId = String(item?.entityId || '').trim();
    if (!entityId) return;
    const existing = byId.get(entityId) || {};
    byId.set(entityId, {
      ...existing,
      ...item,
      entityId,
      label: item?.label || existing.label || entityId,
      color: item?.color || existing.color || OVERLAY_COLOR_PALETTE[index % OVERLAY_COLOR_PALETTE.length],
      activeStates: Array.isArray(item?.activeStates) && item.activeStates.length
        ? item.activeStates
        : (Array.isArray(existing.activeStates) ? existing.activeStates : undefined),
      initialState: item?.initialState ?? existing.initialState ?? '',
    });
  });
  return Array.from(byId.values());
};

export default function SensorModal({
  isOpen,
  onClose,
  entityId,
  entity,
  entities = {},
  customName,
  overlayEntities = [],
  conn,
  haUrl,
  haToken,
  t = (key) => key,
}) {
  const tr = useMemo(() => makeTr(t), [t]);
  const isLightTheme = typeof document !== 'undefined' && document.documentElement?.dataset?.theme === 'light';
  const [history, setHistory] = useState([]);
  const [historyEvents, setHistoryEvents] = useState([]);
  const [overlayHistory, setOverlayHistory] = useState([]);
  const [overlayVisibility, setOverlayVisibility] = useState({});
  const [loading, setLoading] = useState(false);
  const [_historyError, setHistoryError] = useState(null);
  const [_historyMeta, setHistoryMeta] = useState({ source: null, rawCount: 0 });
  const [historyQuery, setHistoryQuery] = useState(() => buildPresetHistoryWindow(24));
  const [customRangeStart, setCustomRangeStart] = useState(() => toDateTimeLocalInputValue(Date.now() - (24 * 60 * 60 * 1000)));
  const [customRangeEnd, setCustomRangeEnd] = useState(() => toDateTimeLocalInputValue(new Date()));
  const [rangeError, setRangeError] = useState('');
  const [manualOverlayConfigs, setManualOverlayConfigs] = useState([]);
  const [overlayInput, setOverlayInput] = useState('');
  const [overlayError, setOverlayError] = useState('');
  const timeWindow = useMemo(() => ({
    start: historyQuery.start,
    end: historyQuery.end,
  }), [historyQuery.end, historyQuery.start]);
  const isSystemWarningDetails = entityId === 'sensor.system_warning_details';
  const isSystemCriticalDetails = entityId === 'sensor.system_critical_details';
  const isSystemDetailsSensor = isSystemWarningDetails || isSystemCriticalDetails;

  const parseWarningLines = (rawValue) => {
    const raw = String(rawValue ?? '').replace(/\r\n/g, '\n').trim();
    if (!raw) return [];
    const low = raw.toLowerCase();
    if (low === 'unknown' || low === 'unavailable' || low === 'none') return [];

    let lines = raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    // Some integrations return all warnings in one long line.
    if (lines.length <= 1 && raw.includes('⚠️')) {
      lines = raw
        .split(/(?=⚠️)/g)
        .map((line) => line.trim())
        .filter(Boolean);
    }

    return lines
      .map((line) => line.replace(/^text:\s*/i, '').replace(/^⚠️\s*/u, '').trim())
      .filter(Boolean);
  };

  const toDateSafe = (value) => {
    if (!value) return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    if (typeof value === 'number') {
      const ms = value < 1e12 ? value * 1000 : value;
      const d = new Date(ms);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    if (typeof value === 'string') {
      const direct = new Date(value);
      if (!Number.isNaN(direct.getTime())) return direct;
      const num = Number(value);
      if (Number.isFinite(num)) {
        const ms = num < 1e12 ? num * 1000 : num;
        const d = new Date(ms);
        return Number.isNaN(d.getTime()) ? null : d;
      }
    }
    return null;
  };

  const parseHistoryNumber = (entry) => {
    const raw = entry?.state ?? entry?.s ?? entry?.mean ?? entry?.value;
    const num = Number.parseFloat(raw);
    if (Number.isFinite(num)) return num;
    const attrs = (entry?.attributes && typeof entry.attributes === 'object')
      ? entry.attributes
      : ((entry?.a && typeof entry.a === 'object') ? entry.a : {});
    const climateCurrent = Number.parseFloat(attrs?.current_temperature ?? attrs?.current_temp ?? attrs?.currentTemperature);
    if (Number.isFinite(climateCurrent)) return climateCurrent;
    const climateTarget = Number.parseFloat(attrs?.temperature ?? attrs?.target_temperature ?? attrs?.target_temp);
    return Number.isFinite(climateTarget) ? climateTarget : null;
  };

  const parseHistoryClimateSnapshot = (entry) => {
    const attrs = (entry?.attributes && typeof entry.attributes === 'object')
      ? entry.attributes
      : ((entry?.a && typeof entry.a === 'object') ? entry.a : {});
    const currentRaw = attrs?.current_temperature ?? attrs?.current_temp ?? attrs?.currentTemperature;
    const targetRaw = attrs?.temperature ?? attrs?.target_temperature ?? attrs?.target_temp;
    const currentTemp = Number.parseFloat(currentRaw);
    const targetTemp = Number.parseFloat(targetRaw);
    return {
      currentTemp: Number.isFinite(currentTemp) ? currentTemp : null,
      targetTemp: Number.isFinite(targetTemp) ? targetTemp : null,
    };
  };

  const normalizeEventState = (value) => String(value ?? '').trim().toLowerCase();

  const sameTempValue = (a, b) => {
    if (a === null && b === null) return true;
    if (a === null || b === null) return false;
    return Math.abs(a - b) < 0.2;
  };

  const compactHistoryEvents = (inputEvents, { includeTemp = false, maxItems = 900 } = {}) => {
    if (!Array.isArray(inputEvents) || inputEvents.length <= 1) return Array.isArray(inputEvents) ? inputEvents : [];
    const sorted = [...inputEvents]
      .filter((event) => event?.time && !Number.isNaN(new Date(event.time).getTime()))
      .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

    const compacted = [];
    let prev = null;
    sorted.forEach((event) => {
      if (!prev) {
        compacted.push(event);
        prev = event;
        return;
      }

      const sameState = normalizeEventState(event.state) === normalizeEventState(prev.state);
      const curr = Number.isFinite(Number(event.currentTemp)) ? Number(event.currentTemp) : null;
      const prevCurr = Number.isFinite(Number(prev.currentTemp)) ? Number(prev.currentTemp) : null;
      const target = Number.isFinite(Number(event.targetTemp)) ? Number(event.targetTemp) : null;
      const prevTarget = Number.isFinite(Number(prev.targetTemp)) ? Number(prev.targetTemp) : null;
      const tempChanged = includeTemp && (!sameTempValue(curr, prevCurr) || !sameTempValue(target, prevTarget));

      if (!sameState || tempChanged) {
        compacted.push(event);
        prev = event;
      }
    });

    if (compacted.length <= maxItems) return compacted;
    const tail = compacted.slice(-maxItems);
    if (!tail.length) return compacted.slice(-maxItems);
    tail[0] = compacted[0];
    return tail;
  };

  const parseHistoryEntryTime = (entry) => toDateSafe(
    entry?.last_changed
    || entry?.last_updated
    || entry?.last_reported
    || entry?.timestamp
    || entry?.start
    || entry?.end
    || entry?.l
    || entry?.lc
    || entry?.lu
    || entry?.lr
  );

  // Helper to determine if entity should show activity (called early before useEffect)
  const getShouldShowActivity = (stateValue, isNumericValue) => {
    const domain = entityId?.split('.')?.[0];
    const activityDomains = [
      'binary_sensor', 'automation', 'switch', 'input_boolean',
      'cover', 'light', 'fan', 'lock', 'climate',
      'media_player', 'scene', 'script', 'input_select'
    ];
    
    if (!activityDomains.includes(domain)) return false;
    if (stateValue === 'unavailable' || stateValue === 'unknown') return false;
    if (isNumericValue && domain !== 'light' && domain !== 'climate') return false;
    return true;
  };

  useEffect(() => {
    if (!isOpen) return;
    const nextWindow = buildPresetHistoryWindow(24);
    setHistoryQuery(nextWindow);
    setCustomRangeStart(toDateTimeLocalInputValue(nextWindow.start));
    setCustomRangeEnd(toDateTimeLocalInputValue(nextWindow.end));
    setRangeError('');
    setManualOverlayConfigs([]);
    setOverlayInput('');
    setOverlayError('');
  }, [entityId, isOpen]);

  const configuredOverlayEntities = useMemo(() => dedupeOverlayConfigs([
    ...(Array.isArray(overlayEntities) ? overlayEntities : []),
    ...manualOverlayConfigs,
  ]), [manualOverlayConfigs, overlayEntities]);

  const overlayConfigKey = useMemo(() => JSON.stringify(
    configuredOverlayEntities.map((overlay) => ({
      entityId: overlay?.entityId || '',
      label: overlay?.label || '',
      color: overlay?.color || '',
      activeStates: Array.isArray(overlay?.activeStates) ? overlay.activeStates.join('|') : '',
      initialState: overlay?.initialState ?? '',
      source: overlay?.source || '',
    }))
  ), [configuredOverlayEntities]);

  useEffect(() => {
    if (isOpen && entity && conn) {
      if (isSystemDetailsSensor) {
        setHistory([]);
        setHistoryEvents([]);
        setOverlayHistory([]);
        return;
      }
      const fetchHistory = async () => {
        setLoading(true);
        setHistoryError(null);
        setHistoryMeta({ source: null, rawCount: 0 });
        try {
          const start = timeWindow.start instanceof Date ? timeWindow.start : new Date(timeWindow.start);
          const end = timeWindow.end instanceof Date ? timeWindow.end : new Date(timeWindow.end);
          const resolvedEntityId = entity?.entity_id || entityId;
          const resolvedEntityIdSafe = String(resolvedEntityId || '');
          
          let points = [];
          let events = [];
          
          // Determine if we need history data for activity/events display
          const entityDomain = resolvedEntityId?.split('.')?.[0];
          const isClimateEntity = entityDomain === 'climate';
          const currentState = String(entity?.state ?? '').toLowerCase();
          const isCurrentNumeric = !['script', 'scene'].includes(entityDomain)
            && !Number.isNaN(parseFloat(entity?.state))
            && !String(entity?.state).match(/^unavailable|unknown$/i)
            && !resolvedEntityIdSafe.startsWith('binary_sensor.');
          const needsActivityData = getShouldShowActivity(currentState, isCurrentNumeric);
          const shouldBuildPoints = isCurrentNumeric || !needsActivityData;
          const preferSignificantHistory = isClimateEntity || (needsActivityData && !isCurrentNumeric);
          const includeAttributes = isClimateEntity;
          if (!resolvedEntityId) {
            setHistoryError('Missing entity id for history');
            setHistory([]);
            setHistoryEvents([]);
            setOverlayHistory([]);
            return;
          }
          
          // Fetch via WebSocket first to avoid browser CORS limitations on direct REST calls
          const shouldFetch = needsActivityData || isCurrentNumeric;
          const canTryRestFallback = (() => {
            if (!haUrl || typeof window === 'undefined') return false;
            try {
              const targetOrigin = new URL(haUrl, window.location.origin).origin;
              return targetOrigin === window.location.origin;
            } catch {
              return false;
            }
          })();

          if (shouldFetch) {
            try {
              const wsData = await getHistory(conn, {
                entityId: resolvedEntityId,
                start,
                end,
                minimal_response: preferSignificantHistory,
                no_attributes: !includeAttributes
              });

              if (wsData && Array.isArray(wsData)) {
                const raw = Array.isArray(wsData[0]) ? wsData[0] : wsData;
                setHistoryMeta({ source: 'ws', rawCount: raw.length });
                points = shouldBuildPoints
                  ? raw
                    .map((d) => {
                      const value = parseHistoryNumber(d);
                      const time = parseHistoryEntryTime(d);
                      if (!Number.isFinite(value) || !time) return null;
                      return { value, time };
                    })
                    .filter(Boolean)
                  : [];
                events = raw
                  .map(d => {
                    if (!d) return null;
                    const stateValue = d.state ?? d.s;
                    const changed = d.last_changed || d.last_updated || d.last_reported || d.timestamp || d.l || d.lc || d.lu || d.lr;
                    const time = parseHistoryEntryTime(d);
                    if (stateValue === undefined || !time) return null;
                    const climateSnapshot = parseHistoryClimateSnapshot(d);
                    return {
                      state: stateValue,
                      time,
                      lastChanged: changed,
                      currentTemp: climateSnapshot.currentTemp,
                      targetTemp: climateSnapshot.targetTemp,
                    };
                  })
                  .filter(Boolean);
              }
            } catch (wsErr) {
              const wsMessage = wsErr?.message || 'History WS failed';

              if (canTryRestFallback) {
                try {
                  const data = await getHistoryRest(haUrl, haToken, {
                    entityId: resolvedEntityId,
                    start,
                    end,
                    minimal_response: preferSignificantHistory,
                    no_attributes: !includeAttributes,
                    significant_changes_only: preferSignificantHistory
                  });

                  if (data && Array.isArray(data)) {
                    const raw = Array.isArray(data[0]) ? data[0] : data;
                    setHistoryMeta({ source: 'rest', rawCount: raw.length });
                    points = shouldBuildPoints
                      ? raw
                        .map((d) => {
                          const value = parseHistoryNumber(d);
                          const time = parseHistoryEntryTime(d);
                          if (!Number.isFinite(value) || !time) return null;
                          return { value, time };
                        })
                        .filter(Boolean)
                      : [];
                    events = raw
                      .map(d => {
                        if (!d) return null;
                        const stateValue = d.state ?? d.s;
                        const changed = d.last_changed || d.last_updated || d.last_reported || d.timestamp || d.l || d.lc || d.lu || d.lr;
                        const time = parseHistoryEntryTime(d);
                        if (stateValue === undefined || !time) return null;
                        const climateSnapshot = parseHistoryClimateSnapshot(d);
                        return {
                          state: stateValue,
                          time,
                          lastChanged: changed,
                          currentTemp: climateSnapshot.currentTemp,
                          targetTemp: climateSnapshot.targetTemp,
                        };
                      })
                      .filter(Boolean);
                    setHistoryError(null);
                  } else {
                    setHistoryError(wsMessage);
                  }
                } catch {
                  setHistoryError(wsMessage);
                }
              } else {
                setHistoryError(wsMessage);
              }
            }
          }

          // Fallback to statistics if history is sparse or empty
          if (shouldBuildPoints && points.length < 2) {
             try {
                const stats = await getStatistics(conn, {
                  statisticId: resolvedEntityId,
                  start,
                  end,
                  period: 'hour'
                });
                
                if (stats && Array.isArray(stats)) {
                  points = stats
                    .map((d) => {
                      const valueRaw = (typeof d.mean === 'number' ? d.mean : (typeof d.state === 'number' ? d.state : d.sum));
                      const value = Number.parseFloat(valueRaw);
                      const time = parseHistoryEntryTime(d);
                      if (!Number.isFinite(value) || !time) return null;
                      return { value, time };
                    })
                    .filter(Boolean);
                }
             } catch (statErr) {
              logger.warn('Stats fetch failed', statErr);
             }
          }

          // Final fallback for current state as line
          if (points.length < 2 && !isNaN(parseFloat(entity.state))) {
             const now = new Date();
             const val = parseFloat(entity.state);
             points = [
               { value: val, time: start },
               { value: val, time: now }
             ];
          }

          // Fallback for events (Binary Timeline) if no history found
          // Even if unavailable, we want to show that state
          if (events.length === 0 && entity.state) {
             events = [{
               state: entity.state,
               time: start, 
               lastChanged: start.toISOString(),
               currentTemp: Number.isFinite(Number(entity?.attributes?.current_temperature))
                 ? Number(entity.attributes.current_temperature)
                 : null,
               targetTemp: Number.isFinite(Number(entity?.attributes?.temperature))
                 ? Number(entity.attributes.temperature)
                 : null,
             }];
          }

          const configuredOverlays = configuredOverlayEntities.filter((overlay) => overlay?.entityId);

          if (configuredOverlays.length > 0) {
            let overlayBatch = {};
            try {
              overlayBatch = await getHistoryBatch(conn, {
                start,
                end,
                entityIds: configuredOverlays.map((overlay) => overlay.entityId),
                minimal_response: true,
                no_attributes: true,
              });
            } catch {
              overlayBatch = {};
            }

            const overlaySeries = configuredOverlays.map((overlay) => {
              const overlayEntityId = overlay.entityId;
              const overlayRaw = Array.isArray(overlayBatch?.[overlayEntityId]) ? overlayBatch[overlayEntityId] : [];
              let overlayEvents = overlayRaw
                .map((entry) => {
                  if (!entry) return null;
                  const stateValue = entry.state ?? entry.s;
                  const changed = entry.last_changed || entry.last_updated || entry.last_reported || entry.timestamp || entry.l || entry.lc || entry.lu || entry.lr;
                  const time = parseHistoryEntryTime(entry);
                  if (stateValue === undefined || !time) return null;
                  return {
                    state: stateValue,
                    time,
                    lastChanged: changed,
                  };
                })
                .filter(Boolean);

              if (overlayEvents.length === 0 && overlay.initialState !== undefined && overlay.initialState !== null && overlay.initialState !== '') {
                overlayEvents = [{
                  state: overlay.initialState,
                  time: start,
                  lastChanged: start.toISOString(),
                }];
              }

              return {
                entityId: overlayEntityId,
                label: overlay.label || overlayEntityId,
                color: overlay.color || '#60a5fa',
                activeStates: Array.isArray(overlay.activeStates) ? overlay.activeStates : undefined,
                source: overlay.source || '',
                events: overlayEvents,
              };
            });

            setOverlayHistory(
              overlaySeries.filter((overlay) => Array.isArray(overlay.events) && overlay.events.length > 0)
            );
          } else {
            setOverlayHistory([]);
          }

          setHistory(points);
          setHistoryEvents(compactHistoryEvents(events, {
            includeTemp: isClimateEntity,
            maxItems: isClimateEntity ? 720 : 1200,
          }));
        } catch (_e) {
          console.error("Failed to load history", _e);
          setOverlayHistory([]);
        } finally {
          setLoading(false);
        }
      };

      fetchHistory();
    } else {
      setHistory([]);
      setHistoryEvents([]);
      setOverlayHistory([]);
    }
  // The fetch effect is intentionally keyed off the resolved query window and overlay config,
  // not helper function identities that are recreated during render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, conn, haUrl, haToken, isSystemDetailsSensor, overlayConfigKey, entityId, entity, timeWindow.end, timeWindow.start, configuredOverlayEntities]);

  useEffect(() => {
    if (!Array.isArray(overlayHistory) || overlayHistory.length === 0) {
      setOverlayVisibility({});
      return;
    }
    setOverlayVisibility((prev) => {
      const next = {};
      overlayHistory.forEach((overlay) => {
        const key = overlay?.entityId;
        if (!key) return;
        next[key] = prev[key] ?? true;
      });
      return next;
    });
  }, [overlayHistory]);

  const entityData = entity || { state: '', attributes: {} };
  const attrs = entityData.attributes || {};
  const name = customName || attrs.friendly_name || entityId;
  const unit = attrs.unit_of_measurement ? `${attrs.unit_of_measurement}` : '';
  const state = entityData.state;
  const domain = entityId?.split('.')?.[0];
  const isNumeric = !['script', 'scene'].includes(domain) && !isNaN(parseFloat(state)) && !String(state).match(/^unavailable|unknown$/) && !entityId.startsWith('binary_sensor.');
  const isPeopleNowHistory = isNumeric && (
    /people_now/i.test(entityId || '')
    || /(person|people)/i.test(String(attrs.unit_of_measurement || ''))
  );
  const historyChartVariant = isPeopleNowHistory ? 'bars' : 'line';
  const deviceClass = attrs.device_class;
  // Determine if entity should show activity timeline and log
  const shouldShowActivity = () => getShouldShowActivity(String(state ?? '').toLowerCase(), isNumeric);
  
  const hasActivity = shouldShowActivity();
  const visibleOverlays = overlayHistory.filter((overlay) => {
    const key = overlay?.entityId;
    if (!key) return false;
    return overlayVisibility[key] !== false;
  });
  const overlayCandidateOptions = useMemo(() => (
    Object.entries(entities || {})
      .filter(([candidateId]) => candidateId && candidateId !== entityId)
      .filter(([candidateId, candidateEntity]) => {
        const candidateDomain = candidateId.split('.')[0] || '';
        const candidateState = String(candidateEntity?.state ?? '');
        const isCandidateNumeric = !['script', 'scene'].includes(candidateDomain)
          && !Number.isNaN(parseFloat(candidateState))
          && !candidateId.startsWith('binary_sensor.')
          && !candidateState.match(/^unavailable|unknown$/i);
        return !isCandidateNumeric;
      })
      .map(([candidateId, candidateEntity]) => ({
        entityId: candidateId,
        label: candidateEntity?.attributes?.friendly_name || candidateId,
        search: `${candidateId} ${candidateEntity?.attributes?.friendly_name || ''}`.toLowerCase(),
      }))
      .sort((a, b) => a.label.localeCompare(b.label))
  ), [entities, entityId]);
  const overlaySummary = configuredOverlayEntities.map((overlay, index) => ({
    ...overlay,
    color: overlay.color || OVERLAY_COLOR_PALETTE[index % OVERLAY_COLOR_PALETTE.length],
    visible: overlayVisibility[overlay.entityId] !== false,
  }));

  const historyWindowDurationMs = Math.max(60 * 1000, timeWindow.end.getTime() - timeWindow.start.getTime());
  const formatHistoryAxisLabel = useMemo(() => {
    if (historyWindowDurationMs >= (10 * 24 * 60 * 60 * 1000)) {
      return (date) => date.toLocaleDateString([], { day: '2-digit', month: '2-digit' });
    }
    if (historyWindowDurationMs >= (36 * 60 * 60 * 1000)) {
      return (date) => `${date.toLocaleDateString([], { day: '2-digit', month: '2-digit' })} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
    if (historyWindowDurationMs >= (24 * 60 * 60 * 1000)) {
      return (date) => `${date.toLocaleDateString([], { day: '2-digit', month: '2-digit' })} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
    return (date) => date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }, [historyWindowDurationMs]);

  const applyPresetRange = (hours) => {
    const nextWindow = buildPresetHistoryWindow(hours);
    setHistoryQuery(nextWindow);
    setCustomRangeStart(toDateTimeLocalInputValue(nextWindow.start));
    setCustomRangeEnd(toDateTimeLocalInputValue(nextWindow.end));
    setRangeError('');
  };

  const applyCustomRange = () => {
    const start = parseDateTimeLocalInputValue(customRangeStart);
    const end = parseDateTimeLocalInputValue(customRangeEnd);
    if (!start || !end || end <= start) {
      setRangeError(tr('history.invalidRange', 'Choose a valid start and end time.'));
      return;
    }
    setHistoryQuery({
      mode: 'custom',
      presetHours: null,
      start,
      end,
    });
    setRangeError('');
  };

  const setCustomRangeToNow = () => {
    const nextEnd = new Date();
    setCustomRangeEnd(toDateTimeLocalInputValue(nextEnd));
  };

  const resolveOverlayInputToken = (token) => {
    const normalized = String(token || '').trim().toLowerCase();
    if (!normalized) return null;
    return overlayCandidateOptions.find((candidate) => candidate.entityId.toLowerCase() === normalized || candidate.label.toLowerCase() === normalized)
      || overlayCandidateOptions.find((candidate) => candidate.search.includes(normalized))
      || null;
  };

  const addOverlayEntities = () => {
    const tokens = String(overlayInput || '')
      .split(/[\n,]+/g)
      .map((token) => token.trim())
      .filter(Boolean);
    if (!tokens.length) {
      setOverlayError(tr('history.overlayHelp', 'Add one or more entity IDs to show extra activity tracks.'));
      return;
    }

    const existingIds = new Set(configuredOverlayEntities.map((overlay) => overlay.entityId));
    const nextEntries = [];
    const unresolved = [];
    const skipped = [];

    tokens.forEach((token) => {
      const candidate = resolveOverlayInputToken(token);
      if (!candidate) {
        unresolved.push(token);
        return;
      }
      if (existingIds.has(candidate.entityId) || nextEntries.some((entry) => entry.entityId === candidate.entityId)) {
        skipped.push(candidate.entityId);
        return;
      }
      nextEntries.push(buildDefaultOverlayConfig(candidate.entityId, entities?.[candidate.entityId], configuredOverlayEntities.length + nextEntries.length));
    });

    if (nextEntries.length) {
      setManualOverlayConfigs((prev) => dedupeOverlayConfigs([...prev, ...nextEntries]));
      setOverlayInput('');
    }

    if (unresolved.length > 0) {
      setOverlayError(`${tr('history.overlayInvalid', 'Could not find')}: ${unresolved.join(', ')}`);
      return;
    }
    if (!nextEntries.length && skipped.length > 0) {
      setOverlayError(tr('history.overlayAlreadyAdded', 'Those overlays are already added.'));
      return;
    }
    setOverlayError('');
  };

  const removeOverlayEntity = (overlayEntityId) => {
    setManualOverlayConfigs((prev) => prev.filter((overlay) => overlay.entityId !== overlayEntityId));
    setOverlayVisibility((prev) => {
      const next = { ...prev };
      delete next[overlayEntityId];
      return next;
    });
  };

  const activeRangeSummary = `${timeWindow.start.toLocaleString()} - ${timeWindow.end.toLocaleString()}`;
  const isCompactViewport = typeof window !== 'undefined' && window.innerWidth < 768;
  const historyGraphHeight = isCompactViewport ? 300 : 350;
  const modalSurfaceStyle = isLightTheme
    ? {
      background: 'linear-gradient(180deg, rgba(248,250,252,0.98) 0%, rgba(241,245,249,0.98) 100%)',
      borderColor: 'rgba(148,163,184,0.45)',
      color: 'var(--text-primary)',
    }
    : {
      background: 'linear-gradient(135deg, var(--card-bg) 0%, var(--modal-bg) 100%)',
      borderColor: 'var(--glass-border)',
      color: 'var(--text-primary)',
    };
  const panelBorderStyle = { borderColor: isLightTheme ? 'rgba(148,163,184,0.35)' : 'var(--glass-border)' };
  const rightPanelStyle = isLightTheme
    ? { background: 'linear-gradient(180deg, rgba(255,255,255,0.72) 0%, rgba(248,250,252,0.96) 100%)' }
    : {};
  const sectionHeadingClass = `text-xs font-bold uppercase tracking-widest ${isLightTheme ? 'text-slate-600' : 'text-[var(--text-secondary)] opacity-40'}`;
  const sectionLabelClass = `text-[10px] font-bold uppercase tracking-wider ${isLightTheme ? 'text-slate-500' : 'text-[var(--text-secondary)] opacity-50'}`;
  const secondaryTextClass = isLightTheme ? 'text-slate-700' : 'text-[var(--text-secondary)]';
  const mutedTextClass = isLightTheme ? 'text-slate-500' : 'text-[var(--text-secondary)] opacity-70';
  const faintTextClass = isLightTheme ? 'text-slate-500/90' : 'text-[var(--text-secondary)] opacity-65';
  const pillSurfaceClass = isLightTheme
    ? 'bg-white/90 border-slate-300/80 text-slate-700 shadow-[0_10px_30px_rgba(148,163,184,0.12)]'
    : 'bg-[var(--glass-bg)] border-[var(--glass-border)] text-[var(--text-secondary)]';
  const panelSurfaceClass = isLightTheme
    ? 'border-slate-300/80 bg-white/88 shadow-[0_18px_48px_rgba(148,163,184,0.16)]'
    : 'border-[var(--glass-border)] bg-[var(--glass-bg)]';
  const inputSurfaceClass = isLightTheme
    ? 'border-slate-300/90 bg-white text-slate-900 placeholder:text-slate-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_10px_24px_rgba(148,163,184,0.12)] [color-scheme:light]'
    : 'border-[var(--glass-border)] bg-[var(--glass-bg-hover)] text-[var(--text-primary)]';
  const actionButtonClass = isLightTheme
    ? 'border-slate-300/90 bg-white text-slate-800 shadow-[0_10px_22px_rgba(148,163,184,0.14)] hover:bg-slate-50'
    : 'border-[var(--glass-border)] bg-[var(--glass-bg-hover)] text-[var(--text-primary)]';

  const lastChanged = entityData.last_changed ? new Date(entityData.last_changed).toLocaleString() : '--';
  const lastUpdated = entityData.last_updated ? new Date(entityData.last_updated).toLocaleString() : '--';

  if (!isOpen || !entity) return null;

  const attributeEntries = Object.entries(attrs)
    .filter(([key]) => !['friendly_name', 'unit_of_measurement', 'entity_picture', 'icon'].includes(key));

  const formatStateLabel = (value, dc = deviceClass) => {
    if (value === null || value === undefined) return '--';
    const normalized = String(value).toLowerCase();

    // Check for ISO Date (e.g. Scenes/Scripts)
    if (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)) {
      try {
         const d = new Date(value);
         if (!isNaN(d.getTime())) {
           return d.toLocaleString();
         }
      } catch (_e) {
        // Silently ignore parse errors for non-date values
      }
    }

    // Base state mappings
    const stateMap = {
      on: t('common.on'),
      off: t('common.off'),
      unavailable: t('status.unavailable'),
      unknown: t('common.unknown'),
      open: t('state.open'),
      closed: t('state.closed'),
      opening: t('state.open'),
      closing: t('state.closed'),
      locked: t('state.locked'),
      unlocked: t('state.unlocked'),
      active: t('state.active'),
      inactive: t('state.inactive'),
      idle: t('state.idle'),
      charging: t('state.charging'),
      playing: t('state.playing'),
      paused: t('state.paused'),
      standby: t('state.standby'),
      home: t('status.home'),
      away: t('status.notHome'),
      not_home: t('status.notHome'),
      online: t('state.online'),
      offline: t('state.offline'),
      heat: t('climate.hvac.heat'),
      cool: t('climate.hvac.cool'),
      auto: t('climate.hvac.auto'),
      'fan_only': t('climate.hvac.fanOnly'),
      dry: t('climate.hvac.dry')
    };
    
    // Check if it's an on/off state and apply device_class specific mapping
    const isOnOff = normalized === 'on' || normalized === 'off';
    if (isOnOff && dc) {
      const deviceClassMap = {
        door: { on: 'binary.door.open', off: 'binary.door.closed' },
        window: { on: 'binary.window.open', off: 'binary.window.closed' },
        garage_door: { on: 'binary.garageDoor.open', off: 'binary.garageDoor.closed' },
        motion: { on: 'binary.motion.detected', off: 'binary.motion.clear' },
        moisture: { on: 'binary.moisture.wet', off: 'binary.moisture.dry' },
        occupancy: { on: 'binary.occupancy.occupied', off: 'binary.occupancy.clear' },
        smoke: { on: 'binary.smoke.detected', off: 'binary.smoke.clear' },
        lock: { on: 'binary.lock.unlocked', off: 'binary.lock.locked' }
      };
      const key = deviceClassMap[dc]?.[normalized];
      if (key) return t(key);
    }
    
    return stateMap[normalized] || String(value);
  };

  let displayState = isNumeric ? parseFloat(state) : formatStateLabel(state, deviceClass);
  // Add prefix for Scene timestamps
  if (domain === 'scene' && String(state).match(/^\d{4}-\d{2}-\d{2}T/)) {
    displayState = `${t('state.sceneSet')} ${formatRelativeTime(state, t)}`;
  }

  const recentEvents = historyEvents
    .filter(e => e && e.time && !Number.isNaN(new Date(e.time).getTime()))
    .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
    .slice(0, 8);

  // Icon Logic
  const Icon = getIconComponent(attrs.icon) || Activity;
  const warningSource = attrs?.text ?? attrs?.details ?? attrs?.warning_details ?? attrs?.warnings ?? state;
  const warningLines = isSystemDetailsSensor ? parseWarningLines(warningSource) : [];

  if (isSystemDetailsSensor) {
    const title = isSystemCriticalDetails ? 'Kritiske varsler' : 'Systemvarsler';
    const toneClass = isSystemCriticalDetails
      ? 'border-red-400/30 bg-red-600/15'
      : 'border-red-500/20 bg-red-500/10';
    return (
      <div
        className="fixed inset-0 z-[150] flex items-center justify-center p-3 sm:p-4 md:p-6"
        style={{ backdropFilter: 'blur(20px)', backgroundColor: 'rgba(0,0,0,0.3)' }}
        onClick={onClose}
      >
        <div
          className="border w-full max-w-3xl rounded-3xl md:rounded-[2.5rem] overflow-hidden flex flex-col backdrop-blur-xl shadow-2xl popup-anim relative max-h-[88vh]"
          style={modalSurfaceStyle}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="absolute top-4 right-4 md:top-6 md:right-6 z-50">
            <button onClick={onClose} className="modal-close">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-5 sm:p-6 md:p-8 border-b" style={panelBorderStyle}>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-3 rounded-xl bg-red-500/20 text-red-400">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <h2 className="text-lg sm:text-xl md:text-2xl font-light tracking-tight text-[var(--text-primary)] uppercase italic leading-tight break-words">
                {t('warnings.title') === 'warnings.title' ? title : t('warnings.title')}
              </h2>
            </div>
            <p className={`text-xs uppercase tracking-widest font-bold ${secondaryTextClass}`}>
              {warningLines.length} varsler
            </p>
          </div>

          <div className="p-4 md:p-6 overflow-y-auto custom-scrollbar space-y-2">
            {warningLines.length === 0 && (
              <div className={`rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm font-medium ${isLightTheme ? 'text-emerald-700' : 'text-emerald-300'}`}>
                {t('warnings.none') === 'warnings.none' ? 'Ingen aktive varsler.' : t('warnings.none')}
              </div>
            )}
            {warningLines.map((line, index) => (
              <div key={`${index}_${line.slice(0, 20)}`} className={`rounded-2xl border px-4 py-3 flex items-start gap-3 ${toneClass}`}>
                <span className="text-red-400 leading-none pt-0.5">⚠️</span>
                <p className="text-sm text-[var(--text-primary)] leading-relaxed">{line}</p>
              </div>
            ))}
          </div>

          <div className={`px-6 pb-5 pt-2 text-center text-[11px] font-mono ${faintTextClass}`}>
            {entityId}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center p-3 sm:p-4 md:p-6"
      style={{ backdropFilter: 'blur(20px)', backgroundColor: 'rgba(0,0,0,0.3)' }}
      onClick={onClose}
    >
      <div
        className="border w-full max-w-5xl rounded-[2rem] sm:rounded-3xl md:rounded-[3rem] overflow-y-auto lg:overflow-hidden flex flex-col lg:grid lg:grid-cols-5 backdrop-blur-xl shadow-2xl popup-anim relative max-h-[92vh] md:h-auto md:min-h-[550px] lg:h-[90vh]"
        style={modalSurfaceStyle}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <div className="absolute top-4 right-4 sm:top-6 sm:right-6 md:top-10 md:right-10 z-50">
          <button onClick={onClose} className="modal-close">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* LEFT PANEL: Visuals & Graph (3 cols) */}
        <div className="lg:col-span-3 relative min-h-0 p-5 sm:p-6 md:p-10 flex flex-col overflow-hidden border-b lg:border-b-0 lg:border-r shrink-0" style={panelBorderStyle}>
           
           {/* Header */}
           <div className="flex items-center gap-3 sm:gap-4 shrink-0 mb-5 sm:mb-6 pr-12">
             <div
               className="p-3 sm:p-4 rounded-2xl transition-all duration-500 shrink-0"
               style={{
                 backgroundColor: entity.state === 'unavailable' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(59, 130, 246, 0.2)',
                 color: entity.state === 'unavailable' ? '#ef4444' : '#60a5fa'
               }}
             >
               <Icon className="w-8 h-8" />
             </div>
             <div className="min-w-0">
               <h2 className="text-lg sm:text-xl md:text-2xl font-light tracking-tight text-[var(--text-primary)] uppercase italic leading-tight break-words">
                 {name}
               </h2>
                 <div className={`mt-2 max-w-full px-3 py-1 rounded-full border inline-flex items-center gap-2 ${entity.state === 'unavailable' ? 'bg-red-500/10 border-red-500/20 text-red-500' : pillSurfaceClass}`}>
                 <div className={`w-1.5 h-1.5 rounded-full ${entity.state === 'unavailable' ? 'bg-red-500' : 'bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.5)]'}`} />
                 <span className="text-[10px] font-bold uppercase tracking-widest leading-none pt-[1px] truncate">
                   {String(displayState)} {unit}
                 </span>
               </div>
             </div>
           </div>

           {/* Main Content Area */}
           <div className="flex-1 flex flex-col min-h-0 relative">
              {isNumeric && overlayHistory.length > 0 && (
                <div className="mb-4 flex flex-wrap gap-2">
                  <span className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full border text-[10px] font-bold uppercase tracking-widest ${pillSurfaceClass}`}>
                    <span className="w-2 h-2 rounded-full bg-[var(--text-primary)] opacity-80" />
                    {t('sensorInfo.temperature') === 'sensorInfo.temperature' ? 'Temperatur' : t('sensorInfo.temperature')}
                  </span>
                  {overlayHistory.map((overlay) => (
                    <button
                      key={overlay.entityId}
                      type="button"
                      onClick={() => {
                        const key = overlay.entityId;
                        if (!key) return;
                        setOverlayVisibility((prev) => ({ ...prev, [key]: !(prev[key] ?? true) }));
                      }}
                      className={`inline-flex max-w-full items-center gap-2 px-2.5 py-1 rounded-full border text-[10px] font-bold uppercase tracking-widest transition-all ${
                        overlayVisibility[overlay.entityId] !== false
                          ? pillSurfaceClass
                          : isLightTheme
                            ? 'bg-transparent border-slate-300/80 text-slate-500 opacity-65'
                            : 'bg-transparent border-[var(--glass-border)] text-[var(--text-secondary)] opacity-45'
                      }`}
                      aria-pressed={overlayVisibility[overlay.entityId] !== false}
                      title={overlayVisibility[overlay.entityId] !== false ? 'Skjul' : 'Vis'}
                    >
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: overlay.color || '#60a5fa' }}
                      />
                      <span className="truncate">{overlay.label}</span>
                    </button>
                  ))}
                </div>
              )}
              {isNumeric && !hasActivity ? (
                <div className="h-full w-full min-h-[240px] sm:min-h-[250px] relative">
                    <div className="-ml-3 -mr-3 sm:-ml-4 sm:-mr-4 md:mr-0 h-full">
                      <SensorHistoryGraph
                        data={history}
                        variant={historyChartVariant}
                        overlays={visibleOverlays}
                        height={historyGraphHeight}
                        noDataLabel={t('sensorInfo.noHistory')}
                        strokeColor="var(--text-primary)"
                        areaColor="var(--text-primary)"
                        formatXLabel={formatHistoryAxisLabel}
                      />
                    </div>
                    {loading && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--text-primary)] opacity-20"></div>
                      </div>
                    )}
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 -mr-2">
                   {loading && recentEvents.length === 0 && (
                     <div className="h-[100px] flex items-center justify-center">
                       <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--text-primary)] opacity-20"></div>
                     </div>
                   )}
                   
                   {hasActivity && (
                     <>
                        <h4 className={`${sectionHeadingClass} mb-4 bg-transparent`}>{t('history.activity')}</h4> 
                        <div className="mb-6">
                           <BinaryTimeline events={historyEvents} startTime={timeWindow.start} endTime={timeWindow.end} formatLabel={formatHistoryAxisLabel} />
                        </div>
                        
                        <h4 className={`${sectionHeadingClass} mb-4 bg-transparent shadow-sm pb-2 border-b`} style={panelBorderStyle}>{t('history.log')}</h4>
                        <div className="space-y-1 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
                            {recentEvents.length === 0 && (
                                <div className={`text-sm italic py-8 text-center ${faintTextClass}`}>{t('sensorInfo.noHistory')}</div>
                            )}
                            {recentEvents.map((event, idx) => {
                                let stateLabel = formatStateLabel(event.state, deviceClass);
                                const domain = entityId?.split('.')?.[0];
                                const climateCurrent = Number.isFinite(Number(event?.currentTemp)) ? Number(event.currentTemp) : null;
                                const climateTarget = Number.isFinite(Number(event?.targetTemp)) ? Number(event.targetTemp) : null;
                                
                                // Specific formatting for Scenes in log
                                if (domain === 'scene' && String(event.state).match(/^\d{4}-\d{2}-\d{2}T/)) {
                                  stateLabel = `${t('state.sceneSet')} ${formatRelativeTime(event.state, t)}`;
                                }

                                const useStateOnly = (domain === 'binary_sensor' || domain === 'motion') && (deviceClass === 'motion' || deviceClass === 'occupancy' || deviceClass === 'presence');
                                const logLabel = (useStateOnly || domain === 'scene')
                                  ? (domain === 'scene' ? stateLabel : t('history.stateOnly').replace('{state}', stateLabel))
                                  : t('history.wasState').replace('{state}', stateLabel);

                                return (
                                <div key={`${event.lastChanged || idx}`} className={`flex items-start gap-3 sm:gap-4 p-3 rounded-xl transition-colors group border ${isLightTheme ? 'hover:bg-slate-900/[0.035] border-transparent hover:border-slate-300/70' : 'hover:bg-white/5 border-transparent hover:border-white/5'}`}>
                                  <div className={`h-2 w-2 rounded-full flex-shrink-0 ${(event.state === 'on' || event.state === 'true' || event.state === 'open' || event.state === 'unlocked' || event.state === 'playing' || event.state > 0) ? 'bg-green-400 opacity-80' : isLightTheme ? 'bg-slate-400 opacity-60' : 'bg-[var(--text-secondary)] opacity-35'}`} />
                                    <div className="flex-1 min-w-0 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                                        <div className="min-w-0">
                                          <span className="block break-words text-sm font-medium text-[var(--text-primary)] sm:truncate">
                                              {logLabel}
                                          </span>
                                          {domain === 'climate' && (climateCurrent !== null || climateTarget !== null) && (
                                            <span className={`mt-1 text-[10px] uppercase tracking-widest inline-flex flex-wrap gap-2 ${secondaryTextClass}`}>
                                              {climateCurrent !== null && (
                                                <span>
                                                  {(t('climate.current') === 'climate.current' ? 'Current' : t('climate.current'))}: {climateCurrent.toFixed(1)}°C
                                                </span>
                                              )}
                                              {climateTarget !== null && (
                                                <span>
                                                  {(t('climate.target') === 'climate.target' ? 'Target' : t('climate.target'))}: {climateTarget.toFixed(1)}°C
                                                </span>
                                              )}
                                            </span>
                                          )}
                                        </div>
                                        <span className={`text-xs font-mono transition-opacity break-words sm:whitespace-nowrap group-hover:opacity-100 ${mutedTextClass}`}>
                                            {formatRelativeTime(event.time, t)}
                                        </span>
                                    </div>
                                </div>
                                );
                            })}
                        </div>
                     </>
                   )}
                   
                   {!loading && !hasActivity && isNumeric && (
                     <div className="-ml-3 -mr-3 sm:-ml-4 sm:-mr-4 md:mr-0 h-full">
                        <SensorHistoryGraph
                          data={history}
                          variant={historyChartVariant}
                          overlays={visibleOverlays}
                          height={historyGraphHeight}
                          noDataLabel={t('sensorInfo.noHistory')}
                          strokeColor="var(--text-primary)"
                          areaColor="var(--text-primary)"
                          formatXLabel={formatHistoryAxisLabel}
                        />
                     </div>
                   )}
                </div>
              )}
           </div>
        </div>

        {/* RIGHT PANEL: Meta & Attributes (2 cols) */}
        <div className="lg:col-span-2 relative min-h-0 p-5 sm:p-6 md:p-10 overflow-y-auto overscroll-contain flex flex-col gap-6 sm:gap-8 md:gap-10 custom-scrollbar" style={rightPanelStyle}>
           
           {/* Timestamps */}
           <div>
               <h4 className={`${sectionHeadingClass} mb-5 sm:mb-6`}>{t('sensorInfo.timeline')}</h4>
               <div className="space-y-6">
                  <div className="relative pl-4 border-l" style={panelBorderStyle}>
                      <div className="absolute -left-[3px] top-1.5 w-1.5 h-1.5 rounded-full bg-blue-400"></div>
                      <p className={`${sectionLabelClass} mb-0.5`}>{t('sensorInfo.lastChanged')}</p>
                      <p className="text-sm font-medium text-[var(--text-primary)]">{lastChanged}</p>
                  </div>
                  <div className="relative pl-4 border-l" style={panelBorderStyle}>
                      <div className="absolute -left-[3px] top-1.5 w-1.5 h-1.5 rounded-full bg-purple-400"></div>
                      <p className={`${sectionLabelClass} mb-0.5`}>{t('sensorInfo.lastUpdated')}</p>
                      <p className="text-sm font-medium text-[var(--text-primary)]">{lastUpdated}</p>
                  </div>
               </div>
           </div>

           {/* History Window */}
           <div className="space-y-4">
             <div>
               <h4 className={`${sectionHeadingClass} mb-4`}>
                 {tr('history.window', 'History window')}
               </h4>
               <div className="-mx-1 overflow-x-auto pb-2 pl-1 pr-1 custom-scrollbar">
                 <div className="inline-flex min-w-max gap-2">
                   {HISTORY_PRESET_OPTIONS.map((hours) => {
                     const active = historyQuery.mode === 'preset' && historyQuery.presetHours === hours;
                     return (
                       <button
                         key={hours}
                         type="button"
                         onClick={() => applyPresetRange(hours)}
                         className={`shrink-0 px-3 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest border transition-all ${
                           active
                             ? isLightTheme
                               ? 'bg-slate-900 text-white border-slate-900 shadow-[0_10px_20px_rgba(15,23,42,0.16)]'
                               : 'bg-[var(--glass-bg-hover)] text-[var(--text-primary)] border-[var(--glass-border)] shadow-[0_0_0_1px_rgba(255,255,255,0.04)]'
                             : isLightTheme
                               ? 'bg-white/90 text-slate-600 border-slate-300/80 hover:bg-white hover:text-slate-900'
                               : 'bg-[var(--glass-bg)] text-[var(--text-secondary)] border-transparent hover:bg-[var(--glass-bg-hover)] hover:text-[var(--text-primary)]'
                         }`}
                       >
                         {formatPresetHistoryLabel(hours)}
                       </button>
                     );
                   })}
                 </div>
               </div>
               <div className={`mt-2 text-[11px] ${faintTextClass}`}>
                 {tr('history.presetHint', 'Tap a preset to update the chart immediately.')}
               </div>
             </div>

             <div className={`rounded-2xl border p-4 ${panelSurfaceClass}`}>
               <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                 <div className="min-w-0">
                   <div className={sectionLabelClass}>
                     {tr('history.customRange', 'Custom range')}
                   </div>
                   <div className={`mt-1 text-xs leading-relaxed break-words ${secondaryTextClass}`}>{activeRangeSummary}</div>
                 </div>
                 <button
                   type="button"
                   onClick={setCustomRangeToNow}
                   className={`shrink-0 rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest ${actionButtonClass}`}
                 >
                   {tr('history.now', 'Now')}
                 </button>
               </div>

               <div className="mt-4 grid grid-cols-1 gap-3">
                 <label className="min-w-0">
                   <span className={`mb-1 block ${sectionLabelClass}`}>
                     {tr('history.from', 'From')}
                   </span>
                   <input
                     type="datetime-local"
                     value={customRangeStart}
                     onChange={(event) => setCustomRangeStart(event.target.value)}
                     className={`h-11 w-full min-w-0 rounded-2xl border px-3 text-[13px] sm:text-sm font-medium outline-none ${inputSurfaceClass}`}
                   />
                 </label>
                 <label className="min-w-0">
                   <span className={`mb-1 block ${sectionLabelClass}`}>
                     {tr('history.to', 'To')}
                   </span>
                   <input
                     type="datetime-local"
                     value={customRangeEnd}
                     onChange={(event) => setCustomRangeEnd(event.target.value)}
                     className={`h-11 w-full min-w-0 rounded-2xl border px-3 text-[13px] sm:text-sm font-medium outline-none ${inputSurfaceClass}`}
                   />
                 </label>
               </div>

               <div className="mt-3 flex flex-wrap items-center gap-2">
                 <button
                   type="button"
                   onClick={applyCustomRange}
                   className={`rounded-2xl border px-4 py-2 text-[10px] font-bold uppercase tracking-widest ${actionButtonClass}`}
                 >
                   {tr('history.applyRange', 'Apply range')}
                 </button>
                 {historyQuery.mode === 'custom' && (
                   <span className={`rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest ${isLightTheme ? 'text-emerald-700' : 'text-emerald-300'}`}>
                     {tr('history.customActive', 'Custom active')}
                   </span>
                 )}
               </div>
               <div className={`mt-2 text-[11px] ${faintTextClass}`}>
                 {tr('history.customHint', 'Use Apply range only after changing date or time.')}
               </div>
               {rangeError && (
                 <div className={`mt-2 text-xs font-semibold ${isLightTheme ? 'text-rose-700' : 'text-rose-300'}`}>{rangeError}</div>
               )}
             </div>
           </div>

           {/* Overlay Sources */}
           {isNumeric && (
             <div className="space-y-4">
               <div>
                 <h4 className={`${sectionHeadingClass} mb-4`}>
                   {tr('history.overlays', 'Overlay tracks')}
                 </h4>
                 <div className={`rounded-2xl border p-4 ${panelSurfaceClass}`}>
                   <div className="flex flex-col gap-2">
                     <input
                       list={`sensor-overlay-options-${entityId}`}
                       type="text"
                       value={overlayInput}
                       onChange={(event) => setOverlayInput(event.target.value)}
                       placeholder={tr('history.overlayPlaceholder', 'Add entity ID or name')}
                       className={`h-11 w-full rounded-2xl border px-3 text-sm font-medium outline-none ${inputSurfaceClass}`}
                     />
                     <datalist id={`sensor-overlay-options-${entityId}`}>
                       {overlayCandidateOptions.map((candidate) => (
                         <option key={candidate.entityId} value={candidate.entityId}>
                           {candidate.label}
                         </option>
                       ))}
                     </datalist>
                     <button
                       type="button"
                       onClick={addOverlayEntities}
                       className={`rounded-2xl border px-4 py-2 text-[10px] font-bold uppercase tracking-widest ${actionButtonClass}`}
                     >
                       {tr('history.addOverlay', 'Add overlay')}
                     </button>
                   </div>
                   <div className={`mt-2 text-[11px] ${mutedTextClass}`}>
                     {tr('history.overlayHelp', 'Add one or more entity IDs to show extra activity tracks.')}
                   </div>
                   {overlayError && (
                     <div className="mt-2 text-xs font-semibold text-rose-300">{overlayError}</div>
                   )}
                 </div>
               </div>

               {overlaySummary.length > 0 && (
                 <div className="space-y-2">
                   {overlaySummary.map((overlay) => (
                     <div key={overlay.entityId} className={`rounded-2xl border p-3 ${panelSurfaceClass}`}>
                       <div className="flex items-start justify-between gap-3">
                         <button
                           type="button"
                           onClick={() => setOverlayVisibility((prev) => ({ ...prev, [overlay.entityId]: !(prev[overlay.entityId] ?? true) }))}
                           className="flex min-w-0 flex-1 items-start gap-3 text-left"
                         >
                           <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: overlay.color }} />
                           <span className="min-w-0">
                             <span className="block truncate text-sm font-semibold text-[var(--text-primary)]">{overlay.label || overlay.entityId}</span>
                             <span className={`mt-1 block truncate font-mono text-[11px] ${mutedTextClass}`}>{overlay.entityId}</span>
                           </span>
                         </button>
                         <div className="flex items-center gap-2">
                           <span className={`rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-widest ${
                             overlay.visible
                               ? isLightTheme
                                 ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700'
                                 : 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300'
                               : isLightTheme
                                 ? 'border-slate-300/80 bg-white text-slate-600'
                                 : 'border-[var(--glass-border)] bg-[var(--glass-bg-hover)] text-[var(--text-secondary)]'
                           }`}>
                             {overlay.visible ? tr('common.on', 'On') : tr('common.off', 'Off')}
                           </span>
                           {overlay.source === 'manual' && (
                             <button
                               type="button"
                               onClick={() => removeOverlayEntity(overlay.entityId)}
                               className={`grid h-8 w-8 place-items-center rounded-full border transition-colors hover:text-[var(--text-primary)] ${actionButtonClass}`}
                              title={tr('history.removeOverlay', 'Remove overlay')}
                             >
                               <X className="h-3.5 w-3.5" />
                             </button>
                           )}
                         </div>
                       </div>
                     </div>
                   ))}
                 </div>
               )}
             </div>
           )}

           {/* Attributes */}
           {attributeEntries.length > 0 && (
                <div className="flex-1">
                     <div className="flex items-center justify-between mb-6">
                        <h4 className={sectionHeadingClass}>{t('sensorInfo.attributes')}</h4>
                     </div>
                     
                     <div className="space-y-4">
                          {attributeEntries.map(([key, value]) => (
                            <div key={key} className="flex flex-col gap-1">
                                  <span className={`${sectionLabelClass} capitalize`}>{key.replace(/_/g, ' ')}</span>
                                  <span className="text-xs sm:text-sm font-medium text-[var(--text-primary)] break-words leading-snug font-mono">{String(value)}</span>
                              </div>
                          ))}
                     </div>
                </div>
           )}

           <div className={`mt-auto pt-8 sm:pt-10 ${isLightTheme ? 'opacity-55' : 'opacity-30'}`}>
              <p className={`text-[10px] font-mono text-center select-all break-all ${secondaryTextClass}`}>{entityId}</p>
           </div>

        </div>
      </div>
    </div>
  );
}
