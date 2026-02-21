import { useState, useEffect, useMemo } from 'react';
import { X, Activity, AlertTriangle } from 'lucide-react';
import { logger } from '../utils/logger';
import { getHistory, getHistoryRest, getStatistics } from '../services/haClient';
import SensorHistoryGraph from '../components/charts/SensorHistoryGraph';
import BinaryTimeline from '../components/charts/BinaryTimeline';
import { formatRelativeTime } from '../utils';
import { getIconComponent } from '../icons';

export default function SensorModal({
  isOpen,
  onClose,
  entityId,
  entity,
  customName,
  overlayEntities = [],
  conn,
  haUrl,
  haToken,
  t = (key) => key,
}) {
  const [history, setHistory] = useState([]);
  const [historyEvents, setHistoryEvents] = useState([]);
  const [overlayHistory, setOverlayHistory] = useState([]);
  const [overlayVisibility, setOverlayVisibility] = useState({});
  const [loading, setLoading] = useState(false);
  const [_historyError, setHistoryError] = useState(null);
  const [_historyMeta, setHistoryMeta] = useState({ source: null, rawCount: 0 });
  const [historyHours, setHistoryHours] = useState(24);

  // Keep track of window for the timeline
  const [timeWindow, setTimeWindow] = useState({ start: new Date(Date.now() - 24*60*60*1000), end: new Date() });
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

  const overlayConfigKey = useMemo(() => JSON.stringify(
    (Array.isArray(overlayEntities) ? overlayEntities : []).map((overlay) => ({
      entityId: overlay?.entityId || '',
      label: overlay?.label || '',
      color: overlay?.color || '',
      activeStates: Array.isArray(overlay?.activeStates) ? overlay.activeStates.join('|') : '',
      initialState: overlay?.initialState ?? '',
    }))
  ), [overlayEntities]);

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
          const end = new Date();
          const start = new Date(end.getTime() - historyHours * 60 * 60 * 1000);
          const resolvedEntityId = entity?.entity_id || entityId;
          const resolvedEntityIdSafe = String(resolvedEntityId || '');
          setTimeWindow({ start, end });
          
          let points = [];
          let events = [];
          
          // Determine if we need history data for activity/events display
          const entityDomain = resolvedEntityId?.split('.')?.[0];
          const currentState = String(entity?.state ?? '').toLowerCase();
          const isCurrentNumeric = !['script', 'scene'].includes(entityDomain)
            && !Number.isNaN(parseFloat(entity?.state))
            && !String(entity?.state).match(/^unavailable|unknown$/i)
            && !resolvedEntityIdSafe.startsWith('binary_sensor.');
          const needsActivityData = getShouldShowActivity(currentState, isCurrentNumeric);
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
                minimal_response: false,
                no_attributes: false
              });

              if (wsData && Array.isArray(wsData)) {
                const raw = Array.isArray(wsData[0]) ? wsData[0] : wsData;
                setHistoryMeta({ source: 'ws', rawCount: raw.length });
                points = raw
                  .map((d) => {
                    const value = parseHistoryNumber(d);
                    const time = parseHistoryEntryTime(d);
                    if (!Number.isFinite(value) || !time) return null;
                    return { value, time };
                  })
                  .filter(Boolean);
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
                    minimal_response: false,
                    no_attributes: false,
                    significant_changes_only: false
                  });

                  if (data && Array.isArray(data)) {
                    const raw = Array.isArray(data[0]) ? data[0] : data;
                    setHistoryMeta({ source: 'rest', rawCount: raw.length });
                    points = raw
                      .map((d) => {
                        const value = parseHistoryNumber(d);
                        const time = parseHistoryEntryTime(d);
                        if (!Number.isFinite(value) || !time) return null;
                        return { value, time };
                      })
                      .filter(Boolean);
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
          if (points.length < 2) {
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
               { value: val, time: new Date(now.getTime() - historyHours * 60 * 60 * 1000) },
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

          const configuredOverlays = Array.isArray(overlayEntities)
            ? overlayEntities.filter((overlay) => overlay?.entityId)
            : [];

          if (configuredOverlays.length > 0) {
            const overlaySeries = await Promise.all(
              configuredOverlays.map(async (overlay) => {
                const overlayEntityId = overlay.entityId;
                let overlayEvents = [];
                try {
                  const overlayRaw = await getHistory(conn, {
                    entityId: overlayEntityId,
                    start,
                    end,
                    minimal_response: false,
                    no_attributes: false,
                  });
                  overlayEvents = overlayRaw
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
                } catch {
                  overlayEvents = [];
                }

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
                  events: overlayEvents,
                };
              })
            );

            setOverlayHistory(
              overlaySeries.filter((overlay) => Array.isArray(overlay.events) && overlay.events.length > 0)
            );
          } else {
            setOverlayHistory([]);
          }

          setHistory(points);
          setHistoryEvents(events);
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
  }, [isOpen, conn, haUrl, haToken, historyHours, isSystemDetailsSensor, overlayConfigKey, entityId]);

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

  if (!isOpen || !entity) return null;

  const attrs = entity.attributes || {};
  const name = customName || attrs.friendly_name || entityId;
  const unit = attrs.unit_of_measurement ? `${attrs.unit_of_measurement}` : '';
  const state = entity.state;
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

  const lastChanged = entity.last_changed ? new Date(entity.last_changed).toLocaleString() : '--';
  const lastUpdated = entity.last_updated ? new Date(entity.last_updated).toLocaleString() : '--';

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
        className="fixed inset-0 z-[150] flex items-center justify-center p-4 md:p-6"
        style={{ backdropFilter: 'blur(20px)', backgroundColor: 'rgba(0,0,0,0.3)' }}
        onClick={onClose}
      >
        <div
          className="border w-full max-w-3xl rounded-3xl md:rounded-[2.5rem] overflow-hidden flex flex-col backdrop-blur-xl shadow-2xl popup-anim relative max-h-[88vh]"
          style={{
            background: 'linear-gradient(135deg, var(--card-bg) 0%, var(--modal-bg) 100%)',
            borderColor: 'var(--glass-border)',
            color: 'var(--text-primary)'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="absolute top-4 right-4 md:top-6 md:right-6 z-50">
            <button onClick={onClose} className="modal-close">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-6 md:p-8 border-b border-[var(--glass-border)]">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-3 rounded-xl bg-red-500/20 text-red-400">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <h2 className="text-lg sm:text-xl md:text-2xl font-light tracking-tight text-[var(--text-primary)] uppercase italic leading-tight break-words">
                {t('warnings.title') === 'warnings.title' ? title : t('warnings.title')}
              </h2>
            </div>
            <p className="text-xs uppercase tracking-widest font-bold text-[var(--text-secondary)]">
              {warningLines.length} varsler
            </p>
          </div>

          <div className="p-4 md:p-6 overflow-y-auto custom-scrollbar space-y-2">
            {warningLines.length === 0 && (
              <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-emerald-300 text-sm font-medium">
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

          <div className="px-6 pb-5 pt-2 text-center text-[11px] text-[var(--text-secondary)] font-mono opacity-60">
            {entityId}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center p-4 md:p-6"
      style={{ backdropFilter: 'blur(20px)', backgroundColor: 'rgba(0,0,0,0.3)' }}
      onClick={onClose}
    >
      <div
        className="border w-full max-w-5xl rounded-3xl md:rounded-[3rem] overflow-hidden flex flex-col lg:grid lg:grid-cols-5 backdrop-blur-xl shadow-2xl popup-anim relative max-h-[90vh] md:h-auto md:min-h-[550px]"
        style={{
          background: 'linear-gradient(135deg, var(--card-bg) 0%, var(--modal-bg) 100%)',
          borderColor: 'var(--glass-border)',
          color: 'var(--text-primary)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <div className="absolute top-6 right-6 md:top-10 md:right-10 z-50">
          <button onClick={onClose} className="modal-close">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* LEFT PANEL: Visuals & Graph (3 cols) */}
        <div className="lg:col-span-3 relative p-6 md:p-10 flex flex-col overflow-hidden border-b lg:border-b-0 lg:border-r shrink-0" style={{borderColor: 'var(--glass-border)'}}>
           
           {/* Header */}
           <div className="flex items-center gap-4 shrink-0 mb-6">
             <div
               className="p-4 rounded-2xl transition-all duration-500"
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
                 <div className={`mt-2 px-3 py-1 rounded-full border inline-flex items-center gap-2 ${entity.state === 'unavailable' ? 'bg-red-500/10 border-red-500/20 text-red-500' : 'bg-[var(--glass-bg)] border-[var(--glass-border)] text-[var(--text-secondary)]'}`}>
                 <div className={`w-1.5 h-1.5 rounded-full ${entity.state === 'unavailable' ? 'bg-red-500' : 'bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.5)]'}`} />
                 <span className="text-[10px] font-bold uppercase tracking-widest leading-none pt-[1px]">
                   {String(displayState)} {unit}
                 </span>
               </div>
             </div>
           </div>

           {/* Main Content Area */}
           <div className="flex-1 flex flex-col min-h-0 relative">
              {isNumeric && overlayHistory.length > 0 && (
                <div className="mb-4 flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full border text-[10px] font-bold uppercase tracking-widest bg-[var(--glass-bg)] border-[var(--glass-border)] text-[var(--text-secondary)]">
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
                      className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full border text-[10px] font-bold uppercase tracking-widest transition-all ${
                        overlayVisibility[overlay.entityId] !== false
                          ? 'bg-[var(--glass-bg)] border-[var(--glass-border)] text-[var(--text-secondary)]'
                          : 'bg-transparent border-[var(--glass-border)] text-[var(--text-secondary)] opacity-45'
                      }`}
                      aria-pressed={overlayVisibility[overlay.entityId] !== false}
                      title={overlayVisibility[overlay.entityId] !== false ? 'Skjul' : 'Vis'}
                    >
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: overlay.color || '#60a5fa' }}
                      />
                      {overlay.label}
                    </button>
                  ))}
                </div>
              )}
              {isNumeric && !hasActivity ? (
                <div className="h-full w-full min-h-[250px] relative">
                    <div className="-ml-4 -mr-4 md:mr-0 h-full">
                      <SensorHistoryGraph
                        data={history}
                        variant={historyChartVariant}
                        overlays={visibleOverlays}
                        height={350}
                        noDataLabel={t('sensorInfo.noHistory')}
                        strokeColor="var(--text-primary)"
                        areaColor="var(--text-primary)"
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
                        <h4 className="text-xs font-bold uppercase tracking-widest text-[var(--text-secondary)] opacity-80 mb-4 bg-transparent">{t('history.activity')}</h4> 
                        <div className="mb-6">
                           <BinaryTimeline events={historyEvents} startTime={timeWindow.start} endTime={timeWindow.end} />
                        </div>
                        
                        <h4 className="text-xs font-bold uppercase tracking-widest text-[var(--text-secondary)] opacity-80 mb-4 bg-transparent shadow-sm pb-2 border-b border-[var(--glass-border)]">{t('history.log')}</h4>
                        <div className="space-y-1 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
                            {recentEvents.length === 0 && (
                                <div className="text-sm text-[var(--text-secondary)] italic opacity-60 py-8 text-center">{t('sensorInfo.noHistory')}</div>
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
                                <div key={`${event.lastChanged || idx}`} className="flex items-center gap-4 p-3 rounded-xl transition-colors hover:bg-white/5 group border border-transparent hover:border-white/5">
                                  <div className={`h-2 w-2 rounded-full flex-shrink-0 ${(event.state === 'on' || event.state === 'true' || event.state === 'open' || event.state === 'unlocked' || event.state === 'playing' || event.state > 0) ? 'bg-green-400 opacity-80' : 'bg-[var(--text-secondary)] opacity-35'}`} />
                                    <div className="flex-1 min-w-0 flex items-start justify-between gap-4">
                                        <div className="min-w-0">
                                          <span className="text-sm font-medium text-[var(--text-primary)] truncate block">
                                              {logLabel}
                                          </span>
                                          {domain === 'climate' && (climateCurrent !== null || climateTarget !== null) && (
                                            <span className="mt-1 text-[10px] uppercase tracking-widest text-[var(--text-secondary)] inline-flex flex-wrap gap-2">
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
                                        <span className="text-xs font-mono text-[var(--text-secondary)] opacity-70 group-hover:opacity-100 transition-opacity whitespace-nowrap">
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
                     <div className="-ml-4 -mr-4 md:mr-0 h-full">
                        <SensorHistoryGraph
                          data={history}
                          variant={historyChartVariant}
                          overlays={visibleOverlays}
                          height={350}
                          noDataLabel={t('sensorInfo.noHistory')}
                          strokeColor="var(--text-primary)"
                          areaColor="var(--text-primary)"
                        />
                     </div>
                   )}
                </div>
              )}
           </div>
        </div>

        {/* RIGHT PANEL: Meta & Attributes (2 cols) */}
        <div className="lg:col-span-2 relative bg-[var(--glass-bg)]/10 p-6 md:p-10 overflow-y-auto flex flex-col gap-10">
           
           {/* Timestamps */}
           <div>
               <h4 className="text-xs font-bold uppercase tracking-widest text-[var(--text-secondary)] mb-6 opacity-40">{t('sensorInfo.timeline')}</h4>
               <div className="space-y-6">
                  <div className="relative pl-4 border-l border-[var(--glass-border)]">
                      <div className="absolute -left-[3px] top-1.5 w-1.5 h-1.5 rounded-full bg-blue-400"></div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)] opacity-50 mb-0.5">{t('sensorInfo.lastChanged')}</p>
                      <p className="text-sm font-medium text-[var(--text-primary)]">{lastChanged}</p>
                  </div>
                  <div className="relative pl-4 border-l border-[var(--glass-border)]">
                      <div className="absolute -left-[3px] top-1.5 w-1.5 h-1.5 rounded-full bg-purple-400"></div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)] opacity-50 mb-0.5">{t('sensorInfo.lastUpdated')}</p>
                      <p className="text-sm font-medium text-[var(--text-primary)]">{lastUpdated}</p>
                  </div>
               </div>
           </div>

           {/* History Range */}
           <div>
             <h4 className="text-xs font-bold uppercase tracking-widest text-[var(--text-secondary)] mb-4 opacity-40">{t('history.rangeHours')}</h4>
             <div className="flex flex-wrap gap-2">
               {[6, 12, 24, 48, 72].map((hours) => (
                 <button
                   key={hours}
                   onClick={() => setHistoryHours(hours)}
                   className={`px-3 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest border transition-all ${historyHours === hours ? 'bg-[var(--glass-bg-hover)] text-[var(--text-primary)] border-[var(--glass-border)]' : 'bg-[var(--glass-bg)] text-[var(--text-secondary)] border-transparent hover:bg-[var(--glass-bg-hover)] hover:text-[var(--text-primary)]'}`}
                 >
                   {hours}h
                 </button>
               ))}
             </div>
           </div>

           {/* Attributes */}
           {attributeEntries.length > 0 && (
                <div className="flex-1">
                     <div className="flex items-center justify-between mb-6">
                        <h4 className="text-xs font-bold uppercase tracking-widest text-[var(--text-secondary)] opacity-40">{t('sensorInfo.attributes')}</h4>
                     </div>
                     
                     <div className="space-y-4">
                          {attributeEntries.map(([key, value]) => (
                            <div key={key} className="flex flex-col gap-1">
                                  <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)] opacity-40 capitalize">{key.replace(/_/g, ' ')}</span>
                                  <span className="text-sm font-medium text-[var(--text-primary)] opacity-80 break-words leading-snug font-mono">{String(value)}</span>
                              </div>
                          ))}
                     </div>
                </div>
           )}

           <div className="mt-auto pt-10 opacity-30">
              <p className="text-[10px] font-mono text-center select-all">{entityId}</p>
           </div>

        </div>
      </div>
    </div>
  );
}
