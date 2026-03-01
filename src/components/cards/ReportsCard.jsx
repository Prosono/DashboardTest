import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, BarChart3, Calendar, Download, RefreshCw, User } from '../../icons';
import { useNotifications } from '../../contexts';
import { fetchAppActionHistory } from '../../services/appAuth';

const RANGE_OPTIONS = [
  { key: '24h', label: '24h', ms: 24 * 60 * 60 * 1000 },
  { key: '7d', label: '7d', ms: 7 * 24 * 60 * 60 * 1000 },
  { key: '30d', label: '30d', ms: 30 * 24 * 60 * 60 * 1000 },
];

const safeNum = (value) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const clamp = (value, min, max, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
};

const asPercent = (value, digits = 1) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return '--';
  return `${parsed.toFixed(digits)}%`;
};

const asTemp = (value, digits = 1) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return '--';
  return `${parsed.toFixed(digits)}°`;
};

const tr = (t, key, fallback) => {
  const resolved = typeof t === 'function' ? t(key) : '';
  if (!resolved || resolved === key) return fallback;
  return resolved;
};

const toCardIdFromSettingsKey = (settingsKey) => {
  const text = String(settingsKey || '');
  if (!text.includes('::')) return text;
  const parts = text.split('::');
  return parts[parts.length - 1] || text;
};

const normalizeHealthSnapshot = (entry, fallbackTolerance = 3) => {
  const timestamp = String(entry?.timestamp || entry?.time || '').trim();
  const timestampMs = Date.parse(timestamp);
  if (!Number.isFinite(timestampMs)) return null;
  const startTemp = safeNum(entry?.startTemp ?? entry?.temperature ?? entry?.temp);
  const targetTemp = safeNum(entry?.targetTemp);
  const deviationPct = safeNum(entry?.deviationPct);
  const toleranceC = clamp(entry?.targetToleranceC, 0, 20, fallbackTolerance);
  if (startTemp === null || deviationPct === null) return null;
  const score = Math.max(0, Math.min(100, Math.round(100 - Math.abs(deviationPct))));
  return {
    id: String(entry?.id || `${timestamp}_${Math.random().toString(36).slice(2, 6)}`),
    timestamp,
    timestampMs,
    startTemp,
    targetTemp,
    deviationPct,
    score,
    toleranceC,
  };
};

const downloadBlob = (content, fileName, mimeType) => {
  if (typeof window === 'undefined') return;
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

const csvCell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

const formatDateTime = (value, locale = 'nb-NO') => {
  const ms = Date.parse(String(value || ''));
  if (!Number.isFinite(ms)) return '--';
  try {
    return new Date(ms).toLocaleString(locale, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return new Date(ms).toLocaleString();
  }
};

const formatDateShort = (ms, locale = 'nb-NO') => {
  if (!Number.isFinite(ms)) return '--';
  try {
    return new Date(ms).toLocaleDateString(locale, { month: '2-digit', day: '2-digit' });
  } catch {
    return new Date(ms).toLocaleDateString();
  }
};

const severityRank = (level) => {
  const normalized = String(level || '').trim().toLowerCase();
  if (normalized === 'critical') return 4;
  if (normalized === 'error') return 3;
  if (normalized === 'warning') return 2;
  if (normalized === 'success') return 1;
  return 0;
};

export default function ReportsCard({
  cardId,
  settings = {},
  dragProps,
  controls,
  cardStyle,
  editMode,
  customNames = {},
  cardSettings = {},
  t,
  locale = 'nb-NO',
}) {
  const { notificationHistory } = useNotifications();
  const title = customNames[cardId] || settings.heading || tr(t, 'reports.title', 'Reports');
  const [rangeKey, setRangeKey] = useState(String(settings.defaultRange || '7d'));
  const [selectedSaunaCardId, setSelectedSaunaCardId] = useState('all');
  const [appActions, setAppActions] = useState([]);
  const [appActionsLoading, setAppActionsLoading] = useState(false);
  const [appActionsError, setAppActionsError] = useState('');

  const sinceMs = useMemo(() => {
    const option = RANGE_OPTIONS.find((entry) => entry.key === rangeKey) || RANGE_OPTIONS[1];
    return Date.now() - option.ms;
  }, [rangeKey]);

  const saunaCards = useMemo(() => {
    const rows = [];
    Object.entries(cardSettings || {}).forEach(([key, cfg]) => {
      if (!cfg || typeof cfg !== 'object') return;
      if (String(cfg?.type || '').trim() !== 'sauna_health_score') return;
      const healthSnapshots = Array.isArray(cfg.healthSnapshots) ? cfg.healthSnapshots : [];
      const resolvedCardId = toCardIdFromSettingsKey(key);
      const name = String(customNames?.[resolvedCardId] || cfg?.name || resolvedCardId || '').trim() || resolvedCardId;
      const tolerance = clamp(cfg?.targetToleranceC, 0, 20, 3);
      const snapshots = healthSnapshots
        .map((entry) => normalizeHealthSnapshot(entry, tolerance))
        .filter(Boolean)
        .sort((a, b) => a.timestampMs - b.timestampMs);
      rows.push({
        cardId: resolvedCardId,
        name,
        toleranceC: tolerance,
        snapshots,
      });
    });
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  }, [cardSettings, customNames]);

  useEffect(() => {
    if (selectedSaunaCardId === 'all') return;
    if (!saunaCards.some((row) => row.cardId === selectedSaunaCardId)) {
      setSelectedSaunaCardId('all');
    }
  }, [saunaCards, selectedSaunaCardId]);

  const loadAppActions = useCallback(async () => {
    setAppActionsLoading(true);
    setAppActionsError('');
    try {
      const history = await fetchAppActionHistory(500);
      setAppActions(Array.isArray(history) ? history : []);
    } catch (error) {
      setAppActions([]);
      setAppActionsError(String(error?.message || tr(t, 'reports.loadFailed', 'Could not load report data')));
    } finally {
      setAppActionsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadAppActions();
  }, [loadAppActions]);

  const flattenedHealthRows = useMemo(() => {
    const selectedSet = selectedSaunaCardId === 'all'
      ? null
      : new Set([selectedSaunaCardId]);
    const rows = [];
    saunaCards.forEach((sauna) => {
      if (selectedSet && !selectedSet.has(sauna.cardId)) return;
      sauna.snapshots.forEach((entry) => {
        if (entry.timestampMs < sinceMs) return;
        rows.push({
          ...entry,
          saunaCardId: sauna.cardId,
          saunaName: sauna.name,
          toleranceC: sauna.toleranceC,
        });
      });
    });
    return rows.sort((a, b) => b.timestampMs - a.timestampMs);
  }, [saunaCards, selectedSaunaCardId, sinceMs]);

  const saunaSummaryRows = useMemo(() => {
    const selectedSet = selectedSaunaCardId === 'all'
      ? null
      : new Set([selectedSaunaCardId]);
    return saunaCards
      .filter((sauna) => !selectedSet || selectedSet.has(sauna.cardId))
      .map((sauna) => {
        const samples = sauna.snapshots.filter((entry) => entry.timestampMs >= sinceMs);
        const count = samples.length;
        const avgScore = count > 0
          ? samples.reduce((sum, entry) => sum + entry.score, 0) / count
          : null;
        const avgDeviation = count > 0
          ? samples.reduce((sum, entry) => sum + entry.deviationPct, 0) / count
          : null;
        const hitCount = samples.filter((entry) => Math.abs(entry.deviationPct) <= sauna.toleranceC).length;
        const hitRate = count > 0 ? (hitCount / count) * 100 : null;
        const latest = samples.length > 0 ? samples[samples.length - 1] : null;
        return {
          cardId: sauna.cardId,
          name: sauna.name,
          count,
          avgScore,
          avgDeviation,
          hitRate,
          latestTemp: latest?.startTemp ?? null,
          latestAt: latest?.timestamp || '',
        };
      })
      .sort((a, b) => (b.count - a.count) || a.name.localeCompare(b.name));
  }, [saunaCards, selectedSaunaCardId, sinceMs]);

  const notificationRows = useMemo(() => {
    const rows = Array.isArray(notificationHistory) ? notificationHistory : [];
    return rows.filter((entry) => {
      const ts = Date.parse(String(entry?.createdAt || ''));
      return Number.isFinite(ts) && ts >= sinceMs;
    });
  }, [notificationHistory, sinceMs]);

  const notificationCounts = useMemo(() => {
    const counts = {
      total: notificationRows.length,
      critical: 0,
      warning: 0,
      error: 0,
      info: 0,
      success: 0,
    };
    notificationRows.forEach((entry) => {
      const level = String(entry?.level || 'info').trim().toLowerCase();
      if (Object.prototype.hasOwnProperty.call(counts, level)) counts[level] += 1;
      else counts.info += 1;
    });
    return counts;
  }, [notificationRows]);

  const appActionRows = useMemo(() => {
    const rows = Array.isArray(appActions) ? appActions : [];
    return rows.filter((entry) => {
      const ts = Date.parse(String(entry?.createdAt || ''));
      return Number.isFinite(ts) && ts >= sinceMs;
    });
  }, [appActions, sinceMs]);

  const topActors = useMemo(() => {
    const counter = new Map();
    appActionRows.forEach((entry) => {
      const actor = String(
        entry?.actor?.username
        || entry?.actor?.id
        || entry?.actorName
        || tr(t, 'reports.unknownActor', 'Unknown')
      ).trim();
      counter.set(actor, (counter.get(actor) || 0) + 1);
    });
    return Array.from(counter.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => (b.count - a.count) || a.name.localeCompare(b.name))
      .slice(0, 5);
  }, [appActionRows, t]);

  const totalMeasurements = flattenedHealthRows.length;
  const avgScore = totalMeasurements > 0
    ? flattenedHealthRows.reduce((sum, entry) => sum + entry.score, 0) / totalMeasurements
    : null;
  const avgDeviation = totalMeasurements > 0
    ? flattenedHealthRows.reduce((sum, entry) => sum + entry.deviationPct, 0) / totalMeasurements
    : null;
  const hitRate = totalMeasurements > 0
    ? (flattenedHealthRows.filter((entry) => Math.abs(entry.deviationPct) <= entry.toleranceC).length / totalMeasurements) * 100
    : null;

  const trendBars = useMemo(() => {
    const grouped = new Map();
    flattenedHealthRows.forEach((entry) => {
      const dayKey = new Date(entry.timestampMs).toISOString().slice(0, 10);
      const current = grouped.get(dayKey) || [];
      current.push(entry.score);
      grouped.set(dayKey, current);
    });
    return Array.from(grouped.entries())
      .map(([dayKey, values]) => {
        const average = values.reduce((sum, value) => sum + value, 0) / values.length;
        return { dayKey, average, count: values.length, dayMs: Date.parse(`${dayKey}T00:00:00Z`) };
      })
      .filter((entry) => Number.isFinite(entry.dayMs))
      .sort((a, b) => a.dayMs - b.dayMs)
      .slice(-7);
  }, [flattenedHealthRows]);

  const maxTrend = useMemo(() => {
    const maxValue = trendBars.reduce((max, entry) => Math.max(max, entry.average), 0);
    return maxValue > 0 ? maxValue : 100;
  }, [trendBars]);

  const reportPayload = useMemo(() => {
    const highestSeverity = notificationRows.reduce((current, entry) => {
      const currentRank = severityRank(current);
      const nextLevel = String(entry?.level || '').toLowerCase();
      return severityRank(nextLevel) > currentRank ? nextLevel : current;
    }, 'info');

    return {
      generatedAt: new Date().toISOString(),
      range: rangeKey,
      saunaFilter: selectedSaunaCardId,
      summary: {
        totalMeasurements,
        averageScore: avgScore,
        averageDeviationPct: avgDeviation,
        targetHitRatePct: hitRate,
        notifications: notificationCounts,
        appActions: {
          total: appActionRows.length,
          topActors,
        },
        highestSeverity,
      },
      saunaMetrics: saunaSummaryRows,
      scoreTrend: trendBars,
      notifications: notificationRows.map((entry) => ({
        id: String(entry?.id || ''),
        level: String(entry?.level || 'info'),
        title: String(entry?.title || ''),
        message: String(entry?.message || ''),
        createdAt: String(entry?.createdAt || ''),
      })),
      appActions: appActionRows.map((entry) => ({
        id: String(entry?.id || ''),
        action: String(entry?.action || ''),
        summary: String(entry?.summary || ''),
        createdAt: String(entry?.createdAt || ''),
        actor: entry?.actor || null,
        entityId: String(entry?.entityId || ''),
        entityName: String(entry?.entityName || ''),
        connectionId: String(entry?.connectionId || ''),
      })),
    };
  }, [
    appActionRows,
    avgDeviation,
    avgScore,
    hitRate,
    notificationCounts,
    notificationRows,
    rangeKey,
    saunaSummaryRows,
    selectedSaunaCardId,
    topActors,
    totalMeasurements,
    trendBars,
  ]);

  const handleDownloadJson = useCallback(() => {
    const fileName = `smart-sauna-report-${rangeKey}-${Date.now()}.json`;
    downloadBlob(JSON.stringify(reportPayload, null, 2), fileName, 'application/json;charset=utf-8');
  }, [reportPayload, rangeKey]);

  const handleDownloadCsv = useCallback(() => {
    const lines = [];
    lines.push([csvCell('section'), csvCell('metric'), csvCell('value')].join(','));
    lines.push([csvCell('summary'), csvCell('range'), csvCell(rangeKey)].join(','));
    lines.push([csvCell('summary'), csvCell('measurements'), csvCell(totalMeasurements)].join(','));
    lines.push([csvCell('summary'), csvCell('avg_score'), csvCell(Number.isFinite(avgScore) ? avgScore.toFixed(2) : '')].join(','));
    lines.push([csvCell('summary'), csvCell('avg_deviation_pct'), csvCell(Number.isFinite(avgDeviation) ? avgDeviation.toFixed(2) : '')].join(','));
    lines.push([csvCell('summary'), csvCell('target_hit_rate_pct'), csvCell(Number.isFinite(hitRate) ? hitRate.toFixed(2) : '')].join(','));
    lines.push([csvCell('summary'), csvCell('notifications_total'), csvCell(notificationCounts.total)].join(','));
    lines.push([csvCell('summary'), csvCell('app_actions_total'), csvCell(appActionRows.length)].join(','));
    lines.push('');

    lines.push([csvCell('sauna'), csvCell('name'), csvCell('measurements'), csvCell('avg_score'), csvCell('hit_rate_pct'), csvCell('avg_deviation_pct'), csvCell('latest_temp'), csvCell('latest_at')].join(','));
    saunaSummaryRows.forEach((row) => {
      lines.push([
        csvCell('sauna'),
        csvCell(row.name),
        csvCell(row.count),
        csvCell(Number.isFinite(row.avgScore) ? row.avgScore.toFixed(2) : ''),
        csvCell(Number.isFinite(row.hitRate) ? row.hitRate.toFixed(2) : ''),
        csvCell(Number.isFinite(row.avgDeviation) ? row.avgDeviation.toFixed(2) : ''),
        csvCell(Number.isFinite(row.latestTemp) ? row.latestTemp.toFixed(1) : ''),
        csvCell(row.latestAt),
      ].join(','));
    });
    lines.push('');

    lines.push([csvCell('notifications'), csvCell('created_at'), csvCell('level'), csvCell('title'), csvCell('message')].join(','));
    notificationRows.forEach((row) => {
      lines.push([
        csvCell('notifications'),
        csvCell(row?.createdAt || ''),
        csvCell(row?.level || ''),
        csvCell(row?.title || ''),
        csvCell(String(row?.message || '').replace(/\s+/g, ' ').trim()),
      ].join(','));
    });
    lines.push('');

    lines.push([csvCell('app_action'), csvCell('created_at'), csvCell('action'), csvCell('actor'), csvCell('entity'), csvCell('summary')].join(','));
    appActionRows.forEach((row) => {
      const actor = String(row?.actor?.username || row?.actor?.id || '').trim();
      lines.push([
        csvCell('app_action'),
        csvCell(row?.createdAt || ''),
        csvCell(row?.action || ''),
        csvCell(actor),
        csvCell(row?.entityName || row?.entityId || ''),
        csvCell(row?.summary || ''),
      ].join(','));
    });

    const fileName = `smart-sauna-report-${rangeKey}-${Date.now()}.csv`;
    downloadBlob(lines.join('\n'), fileName, 'text/csv;charset=utf-8');
  }, [
    appActionRows,
    avgDeviation,
    avgScore,
    hitRate,
    notificationCounts.total,
    notificationRows,
    rangeKey,
    saunaSummaryRows,
    totalMeasurements,
  ]);

  const handleDownloadHtml = useCallback(() => {
    const trendItems = trendBars.map((entry) => {
      const dateLabel = formatDateShort(entry.dayMs, locale);
      return `<tr><td>${dateLabel}</td><td>${entry.count}</td><td>${entry.average.toFixed(1)}</td></tr>`;
    }).join('');

    const saunaRows = saunaSummaryRows.map((row) => (
      `<tr><td>${row.name}</td><td>${row.count}</td><td>${Number.isFinite(row.avgScore) ? row.avgScore.toFixed(1) : '--'}</td><td>${Number.isFinite(row.hitRate) ? row.hitRate.toFixed(1) : '--'}%</td><td>${Number.isFinite(row.avgDeviation) ? row.avgDeviation.toFixed(1) : '--'}%</td></tr>`
    )).join('');

    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Smart Sauna Report</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 28px; color: #0f172a; }
    h1, h2 { margin: 0 0 10px 0; }
    .muted { color: #475569; margin-bottom: 20px; }
    .grid { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 12px; margin-bottom: 18px; }
    .kpi { border: 1px solid #cbd5e1; border-radius: 10px; padding: 10px 12px; background: #f8fafc; }
    .kpi h3 { margin: 0 0 4px 0; font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: #334155; }
    .kpi p { margin: 0; font-size: 22px; font-weight: 700; color: #0f172a; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    th, td { border: 1px solid #cbd5e1; padding: 8px 10px; text-align: left; font-size: 13px; }
    th { background: #e2e8f0; color: #0f172a; }
  </style>
</head>
<body>
  <h1>Smart Sauna Report</h1>
  <div class="muted">Generated: ${formatDateTime(new Date().toISOString(), locale)} · Range: ${rangeKey}</div>
  <div class="grid">
    <div class="kpi"><h3>Measurements</h3><p>${totalMeasurements}</p></div>
    <div class="kpi"><h3>Average score</h3><p>${Number.isFinite(avgScore) ? avgScore.toFixed(1) : '--'}</p></div>
    <div class="kpi"><h3>Hit rate</h3><p>${Number.isFinite(hitRate) ? `${hitRate.toFixed(1)}%` : '--'}</p></div>
    <div class="kpi"><h3>Notifications</h3><p>${notificationCounts.total}</p></div>
  </div>
  <h2>Sauna Performance</h2>
  <table>
    <thead><tr><th>Sauna</th><th>Measurements</th><th>Avg score</th><th>Hit rate</th><th>Avg deviation</th></tr></thead>
    <tbody>${saunaRows}</tbody>
  </table>
  <h2>Score Trend</h2>
  <table>
    <thead><tr><th>Day</th><th>Measurements</th><th>Avg score</th></tr></thead>
    <tbody>${trendItems}</tbody>
  </table>
</body>
</html>`;

    const fileName = `smart-sauna-report-${rangeKey}-${Date.now()}.html`;
    downloadBlob(html, fileName, 'text/html;charset=utf-8');
  }, [avgScore, hitRate, locale, notificationCounts.total, rangeKey, saunaSummaryRows, totalMeasurements, trendBars]);

  return (
    <div
      {...dragProps}
      className="group w-full rounded-[26px] p-4 md:p-5 relative overflow-hidden transition-all duration-300 border mb-3 break-inside-avoid"
      style={{
        ...cardStyle,
        borderColor: 'color-mix(in srgb, var(--glass-border) 88%, rgba(148,163,184,0.2))',
        background: 'linear-gradient(145deg, color-mix(in srgb, var(--card-bg) 94%, rgba(59,130,246,0.08)), color-mix(in srgb, var(--card-bg) 92%, rgba(14,165,233,0.03)))',
      }}
    >
      {controls}

      <div className="flex items-start justify-between gap-2.5 mb-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] font-bold text-[var(--text-secondary)]">
            {tr(t, 'reports.subtitle', 'Operations reports')}
          </div>
          <h3 className="text-[20px] font-semibold leading-tight text-[var(--text-primary)] mt-1">
            {title}
          </h3>
        </div>
        <button
          type="button"
          onClick={() => void loadAppActions()}
          className="h-9 px-3 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] hover:bg-[var(--glass-bg-hover)] text-[var(--text-secondary)] text-[11px] font-bold uppercase tracking-wider inline-flex items-center gap-1.5"
          title={tr(t, 'reports.refresh', 'Refresh')}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${appActionsLoading ? 'animate-spin' : ''}`} />
          {tr(t, 'common.refresh', 'Refresh')}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[9rem_minmax(0,1fr)_auto] gap-2 mb-3">
        <select
          value={rangeKey}
          onChange={(e) => setRangeKey(e.target.value)}
          className="w-full h-10 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-3 text-sm"
        >
          {RANGE_OPTIONS.map((option) => (
            <option key={option.key} value={option.key}>{option.label}</option>
          ))}
        </select>

        <select
          value={selectedSaunaCardId}
          onChange={(e) => setSelectedSaunaCardId(e.target.value)}
          className="w-full h-10 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-3 text-sm"
        >
          <option value="all">{tr(t, 'reports.allSaunas', 'All saunas')}</option>
          {saunaCards.map((entry) => (
            <option key={entry.cardId} value={entry.cardId}>{entry.name}</option>
          ))}
        </select>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleDownloadCsv}
            className="h-10 px-3 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] hover:bg-[var(--glass-bg-hover)] text-[11px] font-bold uppercase tracking-wider inline-flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            CSV
          </button>
          <button
            type="button"
            onClick={handleDownloadJson}
            className="h-10 px-3 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] hover:bg-[var(--glass-bg-hover)] text-[11px] font-bold uppercase tracking-wider inline-flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            JSON
          </button>
          <button
            type="button"
            onClick={handleDownloadHtml}
            className="h-10 px-3 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] hover:bg-[var(--glass-bg-hover)] text-[11px] font-bold uppercase tracking-wider inline-flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            HTML
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-3">
        <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-2.5">
          <div className="text-[10px] uppercase tracking-wider font-bold text-[var(--text-secondary)]">{tr(t, 'reports.measurements', 'Measurements')}</div>
          <div className="mt-1 text-xl font-bold text-[var(--text-primary)]">{totalMeasurements}</div>
        </div>
        <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-2.5">
          <div className="text-[10px] uppercase tracking-wider font-bold text-[var(--text-secondary)]">{tr(t, 'reports.avgScore', 'Avg score')}</div>
          <div className="mt-1 text-xl font-bold text-[var(--text-primary)]">{Number.isFinite(avgScore) ? avgScore.toFixed(1) : '--'}</div>
        </div>
        <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-2.5">
          <div className="text-[10px] uppercase tracking-wider font-bold text-[var(--text-secondary)]">{tr(t, 'reports.hitRate', 'Hit rate')}</div>
          <div className="mt-1 text-xl font-bold text-[var(--text-primary)]">{asPercent(hitRate)}</div>
        </div>
        <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-2.5">
          <div className="text-[10px] uppercase tracking-wider font-bold text-[var(--text-secondary)]">{tr(t, 'reports.avgDeviation', 'Avg deviation')}</div>
          <div className="mt-1 text-xl font-bold text-[var(--text-primary)]">{asPercent(avgDeviation)}</div>
        </div>
        <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-2.5">
          <div className="text-[10px] uppercase tracking-wider font-bold text-[var(--text-secondary)]">{tr(t, 'reports.notifications', 'Notifications')}</div>
          <div className="mt-1 text-xl font-bold text-[var(--text-primary)]">{notificationCounts.total}</div>
        </div>
      </div>

      <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-3 mb-3">
        <div className="flex items-center gap-2 mb-2">
          <BarChart3 className="w-4 h-4 text-[var(--text-secondary)]" />
          <span className="text-[11px] uppercase tracking-wider font-bold text-[var(--text-secondary)]">
            {tr(t, 'reports.scoreTrend', 'Score trend (last 7 days)')}
          </span>
        </div>
        <div className="h-28 flex items-end gap-2">
          {trendBars.length === 0 ? (
            <div className="text-xs text-[var(--text-secondary)]">{tr(t, 'reports.noTrend', 'No trend data in selected range')}</div>
          ) : trendBars.map((entry) => {
            const height = Math.max(8, Math.round((entry.average / maxTrend) * 100));
            return (
              <div key={entry.dayKey} className="flex-1 min-w-0 flex flex-col items-center gap-1">
                <div className="w-full rounded-md bg-gradient-to-t from-sky-500/60 to-emerald-400/65" style={{ height: `${height}%` }} />
                <div className="text-[10px] text-[var(--text-secondary)] truncate">{formatDateShort(entry.dayMs, locale)}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
        <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-3">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="w-4 h-4 text-[var(--text-secondary)]" />
            <span className="text-[11px] uppercase tracking-wider font-bold text-[var(--text-secondary)]">{tr(t, 'reports.saunaPerformance', 'Sauna performance')}</span>
          </div>
          <div className="space-y-1.5 max-h-44 overflow-y-auto custom-scrollbar pr-1">
            {saunaSummaryRows.length === 0 ? (
              <div className="text-xs text-[var(--text-secondary)]">{tr(t, 'reports.noSaunaData', 'No sauna health data found')}</div>
            ) : saunaSummaryRows.map((row) => (
              <div key={row.cardId} className="rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg-hover)] px-2.5 py-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-[var(--text-primary)] truncate">{row.name}</div>
                  <div className="text-[11px] text-[var(--text-secondary)]">{row.count}</div>
                </div>
                <div className="mt-1 text-[11px] text-[var(--text-secondary)]">
                  {tr(t, 'reports.score', 'Score')}: {Number.isFinite(row.avgScore) ? row.avgScore.toFixed(1) : '--'} · {tr(t, 'reports.hitRate', 'Hit rate')}: {asPercent(row.hitRate)} · {tr(t, 'reports.latestTemp', 'Latest temp')}: {asTemp(row.latestTemp)}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-3">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-[var(--text-secondary)]" />
            <span className="text-[11px] uppercase tracking-wider font-bold text-[var(--text-secondary)]">{tr(t, 'reports.alertsAndActions', 'Alerts and actions')}</span>
          </div>
          <div className="text-[11px] text-[var(--text-secondary)] mb-2">
            {tr(t, 'reports.alertSummary', 'Critical')}: {notificationCounts.critical} · {tr(t, 'reports.warningSummary', 'Warning')}: {notificationCounts.warning} · {tr(t, 'reports.infoSummary', 'Info')}: {notificationCounts.info}
          </div>
          <div className="space-y-1.5 max-h-44 overflow-y-auto custom-scrollbar pr-1">
            {topActors.length === 0 ? (
              <div className="text-xs text-[var(--text-secondary)]">{tr(t, 'reports.noActionData', 'No action data in selected range')}</div>
            ) : topActors.map((actor) => (
              <div key={actor.name} className="rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg-hover)] px-2.5 py-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <User className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                  <span className="text-sm text-[var(--text-primary)] truncate">{actor.name}</span>
                </div>
                <span className="text-xs font-semibold text-[var(--text-secondary)]">{actor.count}</span>
              </div>
            ))}
          </div>
          {appActionsError ? (
            <div className="mt-2 text-xs text-rose-300">{appActionsError}</div>
          ) : null}
        </div>
      </div>

      {editMode ? (
        <div className="mt-3 text-[10px] text-[var(--text-secondary)] inline-flex items-center gap-1.5">
          <Calendar className="w-3.5 h-3.5" />
          {tr(t, 'reports.editHint', 'Edit card settings to rename this report card.')}
        </div>
      ) : null}
    </div>
  );
}

