import { useState, useEffect } from 'react';
import { getHistory, getStatistics } from '../services';
import {
  FETCH_STAGGER_BASE,
  FETCH_STAGGER_RANDOM,
  HISTORY_REFRESH_INTERVAL
} from '../config/constants';

/**
 * Hook that fetches and refreshes temperature history data.
 * Returns [tempHistoryById, setTempHistoryById].
 */
export default function useTempHistory(conn, cardSettings) {
  const [tempHistoryById, setTempHistoryById] = useState({});

  useEffect(() => {
    if (!conn) return;
    let cancelled = false;

    const values = Object.values(cardSettings || {});
    const tempIds = values.flatMap((settings) => {
      const ids = [];
      if (!settings || typeof settings !== 'object') return ids;
      if (settings.tempId) ids.push(settings.tempId);
      if (settings.tempEntityId) ids.push(settings.tempEntityId);
      if (Array.isArray(settings.tempOverviewEntityIds)) ids.push(...settings.tempOverviewEntityIds);
      if (settings.targetTempEntityId) ids.push(settings.targetTempEntityId);
      if (settings.preheatMinutesEntityId) ids.push(settings.preheatMinutesEntityId);
      return ids;
    }).map((id) => String(id ?? '').trim()).filter(Boolean);

    const uniqueIds = Array.from(new Set(tempIds));

    const fetchHistoryFor = async (tempId) => {
      const end = new Date();
      const start = new Date();
      start.setHours(start.getHours() - 12);

      let historyFromStats = null;
      try {
        const stats = await getStatistics(conn, { start, end, statisticId: tempId, period: '5minute' });
        if (Array.isArray(stats) && stats.length > 0) {
          historyFromStats = stats.map((s) => ({ state: s.mean !== null ? s.mean : s.state, last_updated: s.start }));
        }
      } catch (e) {
        if (!cancelled) console.warn(`Statistics unavailable for ${tempId}, falling back to history`, e);
      }

      if (!cancelled && Array.isArray(historyFromStats) && historyFromStats.length > 0) {
        setTempHistoryById((prev) => ({ ...prev, [tempId]: historyFromStats }));
        return;
      }

      try {
        let historyData = await getHistory(conn, { start, end, entityId: tempId, minimal_response: false, no_attributes: true });

        if ((!Array.isArray(historyData) || historyData.length === 0) && tempId.startsWith('sensor.')) {
          historyData = await getHistory(conn, { start, end, entityId: tempId, minimal_response: false, no_attributes: false });
        }

        if (!cancelled && Array.isArray(historyData)) {
          setTempHistoryById((prev) => ({ ...prev, [tempId]: historyData }));
        }
      } catch (e) {
        if (!cancelled) console.error(`Temp history fetch error for ${tempId}`, e);
      }
    };

    uniqueIds.forEach((tempId, index) => {
      setTimeout(() => fetchHistoryFor(tempId), index * FETCH_STAGGER_BASE + Math.random() * FETCH_STAGGER_RANDOM);
    });

    const refreshInterval = setInterval(() => {
      if (!cancelled) uniqueIds.forEach((tempId) => fetchHistoryFor(tempId));
    }, HISTORY_REFRESH_INTERVAL);

    return () => {
      cancelled = true;
      clearInterval(refreshInterval);
    };
  }, [conn, cardSettings]);

  return [tempHistoryById, setTempHistoryById];
}
