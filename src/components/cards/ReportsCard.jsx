import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  Calendar,
  Clock,
  Database,
  Download,
  RefreshCw,
  Search,
  User,
} from '../../icons';
import { useNotifications } from '../../contexts';
import { fetchAppActionHistory, fetchPlatformOverview } from '../../services/appAuth';

const RANGE_OPTIONS = [
  { key: '24h', label: '24h', ms: 24 * 60 * 60 * 1000 },
  { key: '7d', label: '7d', ms: 7 * 24 * 60 * 60 * 1000 },
  { key: '30d', label: '30d', ms: 30 * 24 * 60 * 60 * 1000 },
];

const tr = (t, key, fallback) => {
  const resolved = typeof t === 'function' ? t(key) : '';
  if (!resolved || resolved === key) return fallback;
  return resolved;
};

const toDateMs = (value) => {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

const toPlainText = (value) => String(value || '')
  .replace(/<br\s*\/?>/gi, '\n')
  .replace(/<\/(p|div)>/gi, '\n')
  .replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/&quot;/gi, '"')
  .replace(/&#39;/gi, "'")
  .replace(/\r/g, '')
  .trim();

const normalizeLevel = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'critical' || normalized === 'warning' || normalized === 'success' || normalized === 'error') {
    return normalized;
  }
  return 'info';
};

const asPercent = (value, digits = 1) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return '--';
  return `${parsed.toFixed(digits)}%`;
};

const asShortDate = (value, locale = 'nb-NO') => {
  const ms = toDateMs(value);
  if (!ms) return '--';
  try {
    return new Date(ms).toLocaleDateString(locale, { month: '2-digit', day: '2-digit' });
  } catch {
    return new Date(ms).toLocaleDateString();
  }
};

const asDateTime = (value, locale = 'nb-NO') => {
  const ms = toDateMs(value);
  if (!ms) return '--';
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

const levelClassName = (level) => {
  switch (normalizeLevel(level)) {
    case 'critical':
    case 'error':
      return 'border-rose-500/30 bg-rose-500/12 text-rose-300';
    case 'warning':
      return 'border-amber-500/30 bg-amber-500/12 text-amber-300';
    case 'success':
      return 'border-emerald-500/30 bg-emerald-500/12 text-emerald-300';
    default:
      return 'border-blue-500/30 bg-blue-500/12 text-blue-300';
  }
};

const sourceMeta = (sourceKey, t) => {
  switch (sourceKey) {
    case 'notification':
      return { label: tr(t, 'reports.source.notification', 'Notifications'), icon: Bell };
    case 'app_action':
      return { label: tr(t, 'reports.source.appAction', 'App actions'), icon: Activity };
    case 'dashboard_save':
      return { label: tr(t, 'reports.source.dashboardSave', 'Dashboard saves'), icon: Database };
    case 'session_activity':
      return { label: tr(t, 'reports.source.session', 'Sessions'), icon: User };
    case 'connection_issue':
      return { label: tr(t, 'reports.source.connectionIssue', 'Connection issues'), icon: AlertTriangle };
    default:
      return { label: sourceKey || tr(t, 'reports.source.other', 'Other'), icon: Database };
  }
};

const downloadBlob = (content, fileName, mimeType) => {
  if (typeof window === 'undefined') return;
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

const csvCell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

function normalizeNotificationEntry(entry, index) {
  const id = String(entry?.id || `notification-${index}`);
  const createdAt = String(entry?.createdAt || '');
  const title = String(entry?.title || '').trim();
  const message = toPlainText(entry?.message || '');
  const entityName = String(entry?.meta?.entityName || '').trim();
  const entityId = String(entry?.meta?.entityId || '').trim();

  return {
    id: `notification:${id}`,
    source: 'notification',
    level: normalizeLevel(entry?.level),
    createdAt,
    title: title || message || 'Notification',
    subtitle: message,
    actorName: '',
    entityId,
    entityName,
    summary: message,
    raw: entry,
  };
}

function normalizeAppActionEntry(entry, index) {
  const id = String(entry?.id || `app-action-${index}`);
  const createdAt = String(entry?.createdAt || '');
  const actorName = String(entry?.actor?.username || entry?.actor?.id || '').trim();
  const actionLabel = [String(entry?.domain || '').trim(), String(entry?.service || '').trim()]
    .filter(Boolean)
    .join('.');
  const entityName = String(entry?.entityName || '').trim();
  const entityId = String(entry?.entityId || '').trim();
  const summary = String(entry?.summary || '').trim();
  const title = entityName || entityId || summary || actionLabel || 'App action';

  return {
    id: `app_action:${id}`,
    source: 'app_action',
    level: 'info',
    createdAt,
    title,
    subtitle: [actionLabel, actorName].filter(Boolean).join(' • '),
    actorName,
    entityId,
    entityName,
    summary,
    raw: entry,
  };
}

function normalizePlatformEntries(overview, t) {
  if (!overview || typeof overview !== 'object') return [];

  const rows = [];
  const generatedAt = String(overview?.generatedAt || new Date().toISOString());
  const clients = Array.isArray(overview?.clients) ? overview.clients : [];
  const clientNameById = new Map(
    clients.map((entry) => [String(entry?.id || ''), String(entry?.name || entry?.id || '')]),
  );

  const recentLogs = Array.isArray(overview?.recentLogs) ? overview.recentLogs : [];
  recentLogs.forEach((entry, index) => {
    const id = String(entry?.id || `dashboard-save-${index}`);
    const clientId = String(entry?.clientId || '').trim();
    const clientName = String(clientNameById.get(clientId) || clientId || '').trim();
    const dashboardId = String(entry?.dashboardId || 'default').trim();
    const actorName = String(entry?.createdByUsername || entry?.createdBy || '').trim();
    rows.push({
      id: `dashboard_save:${id}`,
      source: 'dashboard_save',
      level: 'success',
      createdAt: String(entry?.createdAt || generatedAt),
      title: `${clientName || '-'} • ${dashboardId || '-'}`,
      subtitle: actorName ? `${tr(t, 'reports.savedBy', 'Saved by')}: ${actorName}` : '',
      actorName,
      entityId: '',
      entityName: dashboardId,
      summary: '',
      raw: entry,
    });
  });

  const sessions = Array.isArray(overview?.sessions) ? overview.sessions : [];
  sessions.forEach((entry, index) => {
    const id = String(entry?.id || `session-${index}`);
    const clientId = String(entry?.clientId || '').trim();
    const clientName = String(clientNameById.get(clientId) || clientId || '').trim();
    const actorName = String(entry?.username || entry?.userId || '').trim();
    const activity = String(entry?.lastActivityLabel || entry?.lastActivityPath || '').trim();
    const context = String(entry?.ipAddress || entry?.deviceLabel || entry?.deviceType || '').trim();
    rows.push({
      id: `session_activity:${id}`,
      source: 'session_activity',
      level: entry?.isOnline ? 'info' : 'warning',
      createdAt: String(entry?.lastActivityAt || entry?.lastSeenAt || entry?.createdAt || generatedAt),
      title: `${clientName || '-'} • ${actorName || '-'}`,
      subtitle: [activity, context].filter(Boolean).join(' • '),
      actorName,
      entityId: '',
      entityName: '',
      summary: activity,
      raw: entry,
    });
  });

  const issues = Array.isArray(overview?.issues) ? overview.issues : [];
  issues.forEach((entry, index) => {
    const id = String(entry?.connectionId || `issue-${index}`);
    const clientName = String(entry?.clientName || entry?.clientId || '').trim();
    const connectionName = String(entry?.connectionName || entry?.connectionId || '').trim();
    const status = String(entry?.status || '').trim();
    rows.push({
      id: `connection_issue:${id}:${index}`,
      source: 'connection_issue',
      level: 'warning',
      createdAt: String(entry?.updatedAt || entry?.clientUpdatedAt || generatedAt),
      title: `${clientName || '-'} • ${connectionName || '-'}`,
      subtitle: status ? `${tr(t, 'reports.status', 'Status')}: ${status}` : '',
      actorName: '',
      entityId: '',
      entityName: connectionName,
      summary: status,
      raw: entry,
    });
  });

  return rows;
}

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
  const [sourceFilter, setSourceFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [appActions, setAppActions] = useState([]);
  const [platformRows, setPlatformRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  const sinceMs = useMemo(() => {
    const option = RANGE_OPTIONS.find((entry) => entry.key === rangeKey) || RANGE_OPTIONS[1];
    return Date.now() - option.ms;
  }, [rangeKey]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError('');

    let nextActions = [];
    let nextPlatformRows = [];
    let actionError = '';

    try {
      const history = await fetchAppActionHistory(500);
      nextActions = Array.isArray(history) ? history : [];
    } catch (error) {
      actionError = String(error?.message || tr(t, 'reports.loadFailed', 'Could not load report data'));
    }

    try {
      const overview = await fetchPlatformOverview(120);
      nextPlatformRows = normalizePlatformEntries(overview, t);
    } catch {
      nextPlatformRows = [];
    }

    setAppActions(nextActions);
    setPlatformRows(nextPlatformRows);
    setLoadError(actionError);
    setLoading(false);
  }, [t]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const eventRows = useMemo(() => {
    const rows = [];
    const notifications = Array.isArray(notificationHistory) ? notificationHistory : [];
    notifications.forEach((entry, index) => {
      rows.push(normalizeNotificationEntry(entry, index));
    });
    appActions.forEach((entry, index) => {
      rows.push(normalizeAppActionEntry(entry, index));
    });
    rows.push(...platformRows);

    const deduped = [];
    const seen = new Set();
    rows
      .filter((entry) => toDateMs(entry?.createdAt) >= sinceMs)
      .sort((a, b) => toDateMs(b.createdAt) - toDateMs(a.createdAt))
      .forEach((entry) => {
        const key = String(entry?.id || '').trim();
        if (!key || seen.has(key)) return;
        seen.add(key);
        deduped.push(entry);
      });
    return deduped;
  }, [appActions, notificationHistory, platformRows, sinceMs]);

  const sourceOptions = useMemo(() => {
    const unique = new Set(eventRows.map((row) => String(row?.source || '').trim()).filter(Boolean));
    return ['all', ...Array.from(unique)];
  }, [eventRows]);

  useEffect(() => {
    if (sourceFilter === 'all') return;
    if (!sourceOptions.includes(sourceFilter)) {
      setSourceFilter('all');
    }
  }, [sourceFilter, sourceOptions]);

  const filteredRows = useMemo(() => {
    const query = String(searchQuery || '').trim().toLowerCase();
    return eventRows.filter((row) => {
      const source = String(row?.source || '');
      if (sourceFilter !== 'all' && source !== sourceFilter) return false;
      if (!query) return true;
      const haystack = [
        row?.title,
        row?.subtitle,
        row?.summary,
        row?.actorName,
        row?.entityName,
        row?.entityId,
        row?.source,
      ].map((value) => String(value || '').toLowerCase()).join(' ');
      return haystack.includes(query);
    });
  }, [eventRows, searchQuery, sourceFilter]);

  const levelCounts = useMemo(() => {
    const counts = {
      total: filteredRows.length,
      critical: 0,
      warning: 0,
      error: 0,
      info: 0,
      success: 0,
    };
    filteredRows.forEach((row) => {
      const level = normalizeLevel(row?.level);
      if (Object.prototype.hasOwnProperty.call(counts, level)) counts[level] += 1;
      else counts.info += 1;
    });
    return counts;
  }, [filteredRows]);

  const sourceCounts = useMemo(() => {
    const counts = new Map();
    filteredRows.forEach((row) => {
      const key = String(row?.source || 'other').trim() || 'other';
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count);
  }, [filteredRows]);

  const topActors = useMemo(() => {
    const counter = new Map();
    filteredRows.forEach((row) => {
      const actor = String(row?.actorName || '').trim();
      if (!actor) return;
      counter.set(actor, (counter.get(actor) || 0) + 1);
    });
    return Array.from(counter.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => (b.count - a.count) || a.name.localeCompare(b.name))
      .slice(0, 8);
  }, [filteredRows]);

  const topEntities = useMemo(() => {
    const counter = new Map();
    filteredRows.forEach((row) => {
      const label = String(row?.entityName || row?.entityId || '').trim();
      if (!label) return;
      counter.set(label, (counter.get(label) || 0) + 1);
    });
    return Array.from(counter.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => (b.count - a.count) || a.name.localeCompare(b.name))
      .slice(0, 8);
  }, [filteredRows]);

  const trendBars = useMemo(() => {
    const grouped = new Map();
    filteredRows.forEach((row) => {
      const ms = toDateMs(row?.createdAt);
      if (!ms) return;
      const key = new Date(ms).toISOString().slice(0, 10);
      const current = grouped.get(key) || { count: 0, high: 0, dateMs: ms };
      current.count += 1;
      if (['critical', 'error', 'warning'].includes(normalizeLevel(row?.level))) current.high += 1;
      if (ms > current.dateMs) current.dateMs = ms;
      grouped.set(key, current);
    });

    return Array.from(grouped.entries())
      .map(([dayKey, data]) => ({
        dayKey,
        dayMs: data.dateMs,
        count: data.count,
        highCount: data.high,
      }))
      .sort((a, b) => a.dayKey.localeCompare(b.dayKey))
      .slice(-7);
  }, [filteredRows]);

  const maxTrendCount = useMemo(
    () => Math.max(1, ...trendBars.map((entry) => Number(entry.count || 0))),
    [trendBars],
  );

  const eventCoveragePct = useMemo(() => {
    if (!eventRows.length) return 0;
    return (filteredRows.length / eventRows.length) * 100;
  }, [eventRows.length, filteredRows.length]);

  const normalizedSaunaRows = useMemo(() => {
    const rows = [];
    Object.entries(cardSettings || {}).forEach(([key, cfg]) => {
      if (!cfg || typeof cfg !== 'object') return;
      if (String(cfg?.type || '').trim() !== 'sauna_health_score') return;
      const snapshots = Array.isArray(cfg?.healthSnapshots) ? cfg.healthSnapshots : [];
      const name = String(cfg?.name || key).trim();
      snapshots.forEach((entry) => {
        const ms = toDateMs(entry?.timestamp || entry?.time);
        if (!ms || ms < sinceMs) return;
        const deviation = Number(entry?.deviationPct);
        if (!Number.isFinite(deviation)) return;
        rows.push({
          saunaName: name,
          createdAt: entry?.timestamp || entry?.time,
          score: Math.max(0, Math.min(100, Math.round(100 - Math.abs(deviation)))),
          deviationPct: deviation,
        });
      });
    });
    return rows;
  }, [cardSettings, sinceMs]);

  const reportPayload = useMemo(() => ({
    generatedAt: new Date().toISOString(),
    range: rangeKey,
    sourceFilter,
    searchQuery,
    summary: {
      totalRows: eventRows.length,
      filteredRows: filteredRows.length,
      filterCoveragePct: eventCoveragePct,
      levels: levelCounts,
      uniqueActors: topActors.length,
      uniqueEntities: topEntities.length,
      sourceCounts,
    },
    rows: filteredRows,
    saunaHealthSnapshots: normalizedSaunaRows,
    trend: trendBars,
  }), [
    eventCoveragePct,
    eventRows.length,
    filteredRows,
    levelCounts,
    normalizedSaunaRows,
    rangeKey,
    searchQuery,
    sourceCounts,
    sourceFilter,
    topActors.length,
    topEntities.length,
    trendBars,
  ]);

  const handleDownloadJson = useCallback(() => {
    const fileName = `smart-sauna-report-${rangeKey}-${Date.now()}.json`;
    downloadBlob(JSON.stringify(reportPayload, null, 2), fileName, 'application/json;charset=utf-8');
  }, [rangeKey, reportPayload]);

  const handleDownloadCsv = useCallback(() => {
    const lines = [];
    lines.push([csvCell('section'), csvCell('metric'), csvCell('value')].join(','));
    lines.push([csvCell('summary'), csvCell('range'), csvCell(rangeKey)].join(','));
    lines.push([csvCell('summary'), csvCell('filtered_rows'), csvCell(filteredRows.length)].join(','));
    lines.push([csvCell('summary'), csvCell('all_rows'), csvCell(eventRows.length)].join(','));
    lines.push([csvCell('summary'), csvCell('coverage_pct'), csvCell(eventCoveragePct.toFixed(2))].join(','));
    lines.push([csvCell('summary'), csvCell('critical'), csvCell(levelCounts.critical)].join(','));
    lines.push([csvCell('summary'), csvCell('warning'), csvCell(levelCounts.warning)].join(','));
    lines.push([csvCell('summary'), csvCell('info'), csvCell(levelCounts.info)].join(','));
    lines.push([csvCell('summary'), csvCell('success'), csvCell(levelCounts.success)].join(','));
    lines.push('');
    lines.push([csvCell('events'), csvCell('created_at'), csvCell('source'), csvCell('severity'), csvCell('title'), csvCell('actor'), csvCell('entity'), csvCell('details')].join(','));
    filteredRows.forEach((row) => {
      lines.push([
        csvCell('event'),
        csvCell(row?.createdAt || ''),
        csvCell(row?.source || ''),
        csvCell(normalizeLevel(row?.level || 'info')),
        csvCell(row?.title || ''),
        csvCell(row?.actorName || ''),
        csvCell(row?.entityName || row?.entityId || ''),
        csvCell(row?.subtitle || row?.summary || ''),
      ].join(','));
    });
    const fileName = `smart-sauna-report-${rangeKey}-${Date.now()}.csv`;
    downloadBlob(lines.join('\n'), fileName, 'text/csv;charset=utf-8');
  }, [eventCoveragePct, eventRows.length, filteredRows, levelCounts, rangeKey]);

  const handleDownloadHtml = useCallback(() => {
    const sourceRows = sourceCounts.map((entry) => {
      const meta = sourceMeta(entry.source, t);
      return `<tr><td>${meta.label}</td><td>${entry.count}</td></tr>`;
    }).join('');
    const recentRows = filteredRows.slice(0, 25).map((row) => {
      const sourceLabel = sourceMeta(row.source, t).label;
      return `<tr><td>${asDateTime(row.createdAt, locale)}</td><td>${sourceLabel}</td><td>${String(normalizeLevel(row.level)).toUpperCase()}</td><td>${row.title || ''}</td><td>${row.actorName || ''}</td></tr>`;
    }).join('');

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
  <div class="muted">Generated: ${asDateTime(new Date().toISOString(), locale)} · Range: ${rangeKey}</div>
  <div class="grid">
    <div class="kpi"><h3>Total events</h3><p>${filteredRows.length}</p></div>
    <div class="kpi"><h3>Critical</h3><p>${levelCounts.critical}</p></div>
    <div class="kpi"><h3>Warnings</h3><p>${levelCounts.warning}</p></div>
    <div class="kpi"><h3>Coverage</h3><p>${eventCoveragePct.toFixed(1)}%</p></div>
  </div>
  <h2>Sources</h2>
  <table>
    <thead><tr><th>Source</th><th>Events</th></tr></thead>
    <tbody>${sourceRows}</tbody>
  </table>
  <h2>Recent Events</h2>
  <table>
    <thead><tr><th>Time</th><th>Source</th><th>Severity</th><th>Title</th><th>Actor</th></tr></thead>
    <tbody>${recentRows}</tbody>
  </table>
</body>
</html>`;

    const fileName = `smart-sauna-report-${rangeKey}-${Date.now()}.html`;
    downloadBlob(html, fileName, 'text/html;charset=utf-8');
  }, [eventCoveragePct, filteredRows, levelCounts.critical, levelCounts.warning, locale, rangeKey, sourceCounts, t]);

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
          onClick={() => void loadData()}
          className="h-9 px-3 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] hover:bg-[var(--glass-bg-hover)] text-[var(--text-secondary)] text-[11px] font-bold uppercase tracking-wider inline-flex items-center gap-1.5"
          title={tr(t, 'reports.refresh', 'Refresh')}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          {tr(t, 'common.refresh', 'Refresh')}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[8rem_11rem_minmax(0,1fr)_auto] gap-2 mb-3">
        <select
          value={rangeKey}
          onChange={(event) => setRangeKey(event.target.value)}
          className="w-full h-10 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-3 text-sm"
        >
          {RANGE_OPTIONS.map((option) => (
            <option key={option.key} value={option.key}>{option.label}</option>
          ))}
        </select>

        <select
          value={sourceFilter}
          onChange={(event) => setSourceFilter(event.target.value)}
          className="w-full h-10 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-3 text-sm"
        >
          <option value="all">{tr(t, 'reports.source.all', 'All sources')}</option>
          {sourceOptions.filter((value) => value !== 'all').map((value) => (
            <option key={value} value={value}>{sourceMeta(value, t).label}</option>
          ))}
        </select>

        <label className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="w-full h-10 pl-9 pr-3 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] text-sm text-[var(--text-primary)] outline-none focus:border-blue-500/40"
            placeholder={tr(t, 'reports.search', 'Search events')}
          />
        </label>

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
          <div className="text-[10px] uppercase tracking-wider font-bold text-[var(--text-secondary)]">{tr(t, 'reports.kpi.total', 'Events')}</div>
          <div className="mt-1 text-xl font-bold text-[var(--text-primary)]">{filteredRows.length}</div>
        </div>
        <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-2.5">
          <div className="text-[10px] uppercase tracking-wider font-bold text-[var(--text-secondary)]">{tr(t, 'reports.kpi.critical', 'Critical')}</div>
          <div className="mt-1 text-xl font-bold text-rose-300">{levelCounts.critical}</div>
        </div>
        <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-2.5">
          <div className="text-[10px] uppercase tracking-wider font-bold text-[var(--text-secondary)]">{tr(t, 'reports.kpi.warning', 'Warning')}</div>
          <div className="mt-1 text-xl font-bold text-amber-300">{levelCounts.warning}</div>
        </div>
        <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-2.5">
          <div className="text-[10px] uppercase tracking-wider font-bold text-[var(--text-secondary)]">{tr(t, 'reports.kpi.actors', 'Actors')}</div>
          <div className="mt-1 text-xl font-bold text-[var(--text-primary)]">{topActors.length}</div>
        </div>
        <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-2.5">
          <div className="text-[10px] uppercase tracking-wider font-bold text-[var(--text-secondary)]">{tr(t, 'reports.kpi.coverage', 'Coverage')}</div>
          <div className="mt-1 text-xl font-bold text-[var(--text-primary)]">{asPercent(eventCoveragePct)}</div>
        </div>
      </div>

      <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-3 mb-3">
        <div className="flex items-center gap-2 mb-2">
          <BarChart3 className="w-4 h-4 text-[var(--text-secondary)]" />
          <span className="text-[11px] uppercase tracking-wider font-bold text-[var(--text-secondary)]">
            {tr(t, 'reports.activityTrend', 'Activity trend (last 7 days)')}
          </span>
        </div>
        <div className="h-28 flex items-end gap-2">
          {trendBars.length === 0 ? (
            <div className="text-xs text-[var(--text-secondary)]">{tr(t, 'reports.noTrend', 'No trend data in selected range')}</div>
          ) : trendBars.map((entry) => {
            const height = Math.max(8, Math.round((entry.count / maxTrendCount) * 100));
            const highRatio = entry.count > 0 ? (entry.highCount / entry.count) : 0;
            const barColor = highRatio > 0.4
              ? 'from-rose-500/70 to-amber-500/60'
              : highRatio > 0
                ? 'from-amber-500/65 to-sky-500/55'
                : 'from-sky-500/60 to-emerald-400/65';
            return (
              <div key={entry.dayKey} className="flex-1 min-w-0 flex flex-col items-center gap-1">
                <div
                  className={`w-full rounded-md bg-gradient-to-t ${barColor}`}
                  style={{ height: `${height}%` }}
                  title={`${asShortDate(entry.dayKey, locale)} • ${entry.count}`}
                />
                <div className="text-[10px] text-[var(--text-secondary)] truncate">{asShortDate(entry.dayKey, locale)}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-2">
        <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-3">
          <div className="flex items-center gap-2 mb-2">
            <Database className="w-4 h-4 text-[var(--text-secondary)]" />
            <span className="text-[11px] uppercase tracking-wider font-bold text-[var(--text-secondary)]">
              {tr(t, 'reports.sources', 'Sources')}
            </span>
          </div>
          <div className="space-y-1.5 max-h-52 overflow-y-auto custom-scrollbar pr-1">
            {sourceCounts.length === 0 ? (
              <div className="text-xs text-[var(--text-secondary)]">{tr(t, 'reports.noData', 'No data in selected range')}</div>
            ) : sourceCounts.map((entry) => {
              const meta = sourceMeta(entry.source, t);
              const Icon = meta.icon || Database;
              return (
                <div key={entry.source} className="rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg-hover)] px-2.5 py-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Icon className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                    <span className="text-sm text-[var(--text-primary)] truncate">{meta.label}</span>
                  </div>
                  <span className="text-xs font-semibold text-[var(--text-secondary)]">{entry.count}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-3">
          <div className="flex items-center gap-2 mb-2">
            <User className="w-4 h-4 text-[var(--text-secondary)]" />
            <span className="text-[11px] uppercase tracking-wider font-bold text-[var(--text-secondary)]">
              {tr(t, 'reports.topActors', 'Top actors')}
            </span>
          </div>
          <div className="space-y-1.5 max-h-52 overflow-y-auto custom-scrollbar pr-1">
            {topActors.length === 0 ? (
              <div className="text-xs text-[var(--text-secondary)]">{tr(t, 'reports.noActors', 'No actor data')}</div>
            ) : topActors.map((actor) => (
              <div key={actor.name} className="rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg-hover)] px-2.5 py-2 flex items-center justify-between gap-2">
                <span className="text-sm text-[var(--text-primary)] truncate">{actor.name}</span>
                <span className="text-xs font-semibold text-[var(--text-secondary)]">{actor.count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-3">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="w-4 h-4 text-[var(--text-secondary)]" />
            <span className="text-[11px] uppercase tracking-wider font-bold text-[var(--text-secondary)]">
              {tr(t, 'reports.topEntities', 'Top entities')}
            </span>
          </div>
          <div className="space-y-1.5 max-h-52 overflow-y-auto custom-scrollbar pr-1">
            {topEntities.length === 0 ? (
              <div className="text-xs text-[var(--text-secondary)]">{tr(t, 'reports.noEntities', 'No entity data')}</div>
            ) : topEntities.map((entity) => (
              <div key={entity.name} className="rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg-hover)] px-2.5 py-2 flex items-center justify-between gap-2">
                <span className="text-sm text-[var(--text-primary)] truncate">{entity.name}</span>
                <span className="text-xs font-semibold text-[var(--text-secondary)]">{entity.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-2 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-3">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="inline-flex items-center gap-2">
            <Clock className="w-4 h-4 text-[var(--text-secondary)]" />
            <span className="text-[11px] uppercase tracking-wider font-bold text-[var(--text-secondary)]">
              {tr(t, 'reports.recentEvents', 'Recent events')}
            </span>
          </div>
          {loadError ? (
            <span className="text-[10px] text-rose-300">{loadError}</span>
          ) : null}
        </div>
        <div className="space-y-1.5 max-h-56 overflow-y-auto custom-scrollbar pr-1">
          {filteredRows.length === 0 ? (
            <div className="text-xs text-[var(--text-secondary)]">{tr(t, 'reports.noData', 'No data in selected range')}</div>
          ) : filteredRows.slice(0, 30).map((row) => {
            const source = sourceMeta(row.source, t);
            const severity = normalizeLevel(row?.level);
            return (
              <div key={row.id} className="rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg-hover)] px-2.5 py-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex items-center gap-2">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wider ${levelClassName(severity)}`}>
                      {String(severity).toUpperCase()}
                    </span>
                    <span className="text-[10px] uppercase tracking-wider font-bold text-[var(--text-secondary)] truncate">{source.label}</span>
                  </div>
                  <span className="text-[10px] text-[var(--text-secondary)] shrink-0">{asDateTime(row.createdAt, locale)}</span>
                </div>
                <div className="mt-1 text-sm font-semibold text-[var(--text-primary)] truncate">{row.title || '-'}</div>
                <div className="mt-0.5 text-[11px] text-[var(--text-secondary)] truncate">
                  {[row.actorName, row.entityName || row.entityId, row.subtitle].filter(Boolean).join(' • ')}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {normalizedSaunaRows.length > 0 ? (
        <div className="mt-2 text-[10px] text-[var(--text-secondary)] inline-flex items-center gap-1.5">
          <Calendar className="w-3.5 h-3.5" />
          {tr(t, 'reports.optionalSaunaData', 'Includes sauna-health snapshots when those cards are configured.')}: {normalizedSaunaRows.length}
        </div>
      ) : null}

      {editMode ? (
        <div className="mt-2 text-[10px] text-[var(--text-secondary)] inline-flex items-center gap-1.5">
          <Calendar className="w-3.5 h-3.5" />
          {tr(t, 'reports.editHint', 'Edit card settings to rename this report card.')}
        </div>
      ) : null}
    </div>
  );
}
