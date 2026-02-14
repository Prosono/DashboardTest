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
      return ids;
    }).filter(Boolean);

    const uniqueIds = Array.from(new Set(tempIds));

    const fetchHistoryFor = async (tempId) => {
      const end = new Date();
      const start = new Date();
      start.setHours(start.getHours() - 12);
      try {
        const stats = await getStatistics(conn, { start, end, statisticId: tempId, period: '5minute' });
        if (!cancelled && Array.isArray(stats) && stats.length > 0) {
          const mapped = stats.map((s) => ({ state: s.mean !== null ? s.mean : s.state, last_updated: s.start }));
          setTempHistoryById((prev) => ({ ...prev, [tempId]: mapped }));
          return;
        }

        const historyData = await getHistory(conn, { start, end, entityId: tempId, minimal_response: false, no_attributes: true });
        if (!cancelled && historyData) {
          setTempHistoryById((prev) => ({ ...prev, [tempId]: historyData }));
        }
      } catch (e) {
        if (!cancelled) console.error('Temp history fetch error', e);
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
