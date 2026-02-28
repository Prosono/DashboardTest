import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  Building2,
  Check,
  Clock,
  Database,
  RefreshCw,
  Search,
  Shield,
  User,
  X,
} from '../../icons';
import { fetchPlatformOverview as fetchPlatformOverviewDirect } from '../../services/appAuth';

const clamp = (value, min, max, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
};

const tr = (t, key, fallback) => {
  const value = typeof t === 'function' ? t(key) : '';
  if (!value || value === key) return fallback;
  return value;
};

const normalizeLevel = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'critical' || normalized === 'warning' || normalized === 'success' || normalized === 'error') {
    return normalized;
  }
  return 'info';
};

const levelMeta = (level) => {
  switch (normalizeLevel(level)) {
    case 'critical':
      return {
        icon: AlertTriangle,
        chipClass: 'border-rose-500/35 bg-rose-500/15 text-rose-300',
      };
    case 'error':
      return {
        icon: AlertCircle,
        chipClass: 'border-rose-500/35 bg-rose-500/15 text-rose-300',
      };
    case 'warning':
      return {
        icon: AlertTriangle,
        chipClass: 'border-amber-500/35 bg-amber-500/15 text-amber-300',
      };
    case 'success':
      return {
        icon: Check,
        chipClass: 'border-emerald-500/35 bg-emerald-500/15 text-emerald-300',
      };
    default:
      return {
        icon: AlertCircle,
        chipClass: 'border-blue-500/35 bg-blue-500/15 text-blue-300',
      };
  }
};

const sourceMeta = {
  app_action: {
    icon: Activity,
    chipClass: 'border-cyan-500/35 bg-cyan-500/15 text-cyan-300',
  },
  dashboard_save: {
    icon: Building2,
    chipClass: 'border-emerald-500/35 bg-emerald-500/15 text-emerald-300',
  },
  session_activity: {
    icon: User,
    chipClass: 'border-violet-500/35 bg-violet-500/15 text-violet-300',
  },
  connection_issue: {
    icon: Shield,
    chipClass: 'border-amber-500/35 bg-amber-500/15 text-amber-300',
  },
};

const toDateMs = (value) => {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatDateTime = (value, locale = 'nb-NO', includeYear = false) => {
  const timestampMs = Date.parse(String(value || ''));
  if (!Number.isFinite(timestampMs)) return '--';
  try {
    return new Date(timestampMs).toLocaleString(locale, {
      day: '2-digit',
      month: '2-digit',
      ...(includeYear ? { year: 'numeric' } : {}),
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return new Date(timestampMs).toLocaleString();
  }
};

const getTimeThresholdMs = (windowKey, nowMs) => {
  if (windowKey === '24h') return nowMs - (24 * 60 * 60 * 1000);
  if (windowKey === '7d') return nowMs - (7 * 24 * 60 * 60 * 1000);
  return null;
};

const toSafeText = (value) => String(value ?? '').trim();

const buildTimelineRows = ({
  overview,
  includeAppActions,
  includeDashboardLogs,
  includeSessions,
  includeConnectionIssues,
  t,
}) => {
  if (!overview || typeof overview !== 'object') return [];

  const clients = Array.isArray(overview.clients) ? overview.clients : [];
  const clientNameById = new Map(
    clients.map((client) => [
      String(client?.id || '').trim(),
      String(client?.name || client?.id || '').trim(),
    ]),
  );

  const rows = [];

  if (includeAppActions) {
    const appActions = Array.isArray(overview.recentAppActions) ? overview.recentAppActions : [];
    appActions.forEach((entry, index) => {
      const clientId = toSafeText(entry?.clientId || '');
      const clientName = toSafeText(entry?.clientName || clientNameById.get(clientId) || clientId || '-');
      const actorName = toSafeText(entry?.actor?.username || entry?.actor?.id || '');
      const actionLabel = [toSafeText(entry?.domain), toSafeText(entry?.service)].filter(Boolean).join('.') || '-';
      const entityLabel = toSafeText(entry?.entityName || entry?.entityId || entry?.summary || actionLabel);
      const id = toSafeText(entry?.id || '') || `app-action-${clientId || 'global'}-${index}`;
      const createdAt = toSafeText(entry?.createdAt || overview.generatedAt || new Date().toISOString());
      rows.push({
        id: `app_action:${clientId}:${id}`,
        kind: 'app_action',
        level: 'info',
        createdAt,
        title: entityLabel || tr(t, 'globalTimeline.fallbackAction', 'Action'),
        subtitle: [clientName, actionLabel, actorName].filter(Boolean).join(' • '),
        clientId,
        clientName,
        actorName,
        summary: toSafeText(entry?.summary),
        entityId: toSafeText(entry?.entityId),
        entityName: toSafeText(entry?.entityName),
        connectionId: toSafeText(entry?.connectionId),
        domain: toSafeText(entry?.domain),
        service: toSafeText(entry?.service),
        raw: entry,
      });
    });
  }

  if (includeDashboardLogs) {
    const dashboardLogs = Array.isArray(overview.recentLogs) ? overview.recentLogs : [];
    dashboardLogs.forEach((entry, index) => {
      const clientId = toSafeText(entry?.clientId || '');
      const clientName = toSafeText(clientNameById.get(clientId) || clientId || '-');
      const dashboardId = toSafeText(entry?.dashboardId || 'default');
      const createdBy = toSafeText(entry?.createdByUsername || entry?.createdBy || '-');
      const logId = toSafeText(entry?.id || '') || `dashboard-save-${clientId || 'global'}-${index}`;
      const createdAt = toSafeText(entry?.createdAt || overview.generatedAt || new Date().toISOString());
      rows.push({
        id: `dashboard_save:${clientId}:${logId}`,
        kind: 'dashboard_save',
        level: 'success',
        createdAt,
        title: `${clientName} • ${dashboardId}`,
        subtitle: `${tr(t, 'globalTimeline.savedBy', 'Saved by')}: ${createdBy}`,
        clientId,
        clientName,
        actorName: createdBy,
        dashboardId,
        raw: entry,
      });
    });
  }

  if (includeSessions) {
    const sessions = Array.isArray(overview.sessions) ? overview.sessions : [];
    sessions.forEach((entry, index) => {
      const clientId = toSafeText(entry?.clientId || '');
      const clientName = toSafeText(clientNameById.get(clientId) || clientId || '-');
      const username = toSafeText(entry?.username || entry?.userId || '-');
      const sessionTs = toSafeText(entry?.lastActivityAt || entry?.lastSeenAt || entry?.createdAt || overview.generatedAt);
      const sessionId = toSafeText(entry?.id || '') || `session-${clientId || 'global'}-${index}`;
      const label = toSafeText(entry?.lastActivityLabel || entry?.lastActivityPath || tr(t, 'globalTimeline.unknownActivity', 'Activity update'));
      const location = toSafeText(entry?.ipAddress || entry?.deviceLabel || entry?.deviceType || '');
      rows.push({
        id: `session_activity:${clientId}:${sessionId}:${sessionTs}`,
        kind: 'session_activity',
        level: entry?.isOnline ? 'info' : 'warning',
        createdAt: sessionTs,
        title: `${clientName} • ${username}`,
        subtitle: [label, location].filter(Boolean).join(' • '),
        clientId,
        clientName,
        actorName: username,
        sessionId: toSafeText(entry?.id),
        raw: entry,
      });
    });
  }

  if (includeConnectionIssues) {
    const issues = Array.isArray(overview.issues) ? overview.issues : [];
    issues.forEach((entry, index) => {
      const clientId = toSafeText(entry?.clientId || '');
      const clientName = toSafeText(entry?.clientName || clientNameById.get(clientId) || clientId || '-');
      const issueId = `connection-issue-${clientId || 'global'}-${toSafeText(entry?.connectionId)}-${index}`;
      const status = toSafeText(entry?.status || 'issue');
      const createdAt = toSafeText(entry?.updatedAt || entry?.clientUpdatedAt || overview.generatedAt || new Date().toISOString());
      rows.push({
        id: `connection_issue:${issueId}`,
        kind: 'connection_issue',
        level: 'warning',
        createdAt,
        title: `${clientName} • ${toSafeText(entry?.connectionName || entry?.connectionId || '-')}`,
        subtitle: `${tr(t, 'globalTimeline.connectionStatus', 'Status')}: ${status}`,
        clientId,
        clientName,
        actorName: '',
        connectionId: toSafeText(entry?.connectionId),
        raw: entry,
      });
    });
  }

  const deduped = [];
  const seen = new Set();
  rows
    .sort((a, b) => toDateMs(b.createdAt) - toDateMs(a.createdAt))
    .forEach((row) => {
      const dedupeKey = String(row?.id || '').trim();
      if (!dedupeKey || seen.has(dedupeKey)) return;
      seen.add(dedupeKey);
      deduped.push(row);
    });

  return deduped;
};

export default function GlobalTimelineCard({
  cardId,
  settings = {},
  dragProps,
  controls,
  cardStyle,
  editMode,
  customNames = {},
  t,
  locale = 'nb-NO',
  userAdminApi,
  currentUser,
}) {
  const heading = customNames[cardId] || settings.heading || tr(t, 'globalTimeline.title', 'Global timeline');
  const maxEntries = clamp(settings.maxEntries, 20, 200, 120);
  const autoRefreshSec = clamp(settings.autoRefreshSec, 10, 600, 45);
  const includeAppActions = settings?.includeAppActions !== false;
  const includeDashboardLogs = settings?.includeDashboardLogs !== false;
  const includeSessions = settings?.includeSessions !== false;
  const includeConnectionIssues = settings?.includeConnectionIssues !== false;
  const isPlatformAdmin = currentUser?.isPlatformAdmin === true;

  const [rows, setRows] = useState([]);
  const [generatedAt, setGeneratedAt] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [clientFilter, setClientFilter] = useState('all');
  const [timeWindowFilter, setTimeWindowFilter] = useState('all');
  const [selectedRowId, setSelectedRowId] = useState('');

  const fetchTimeline = useCallback(async ({ silent = false } = {}) => {
    if (!isPlatformAdmin) {
      setRows([]);
      setGeneratedAt('');
      setError(tr(t, 'globalTimeline.platformAdminOnly', 'This card is available for the platform admin only.'));
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const fetchOverview = typeof userAdminApi?.fetchPlatformOverview === 'function'
      ? userAdminApi.fetchPlatformOverview
      : fetchPlatformOverviewDirect;

    if (typeof fetchOverview !== 'function') {
      setRows([]);
      setGeneratedAt('');
      setError(tr(t, 'globalTimeline.apiUnavailable', 'Global timeline API is unavailable.'));
      setLoading(false);
      setRefreshing(false);
      return;
    }

    if (silent) setRefreshing(true);
    else setLoading(true);
    setError('');

    try {
      const overview = await fetchOverview(Math.max(maxEntries, 80));
      const nextRows = buildTimelineRows({
        overview,
        includeAppActions,
        includeDashboardLogs,
        includeSessions,
        includeConnectionIssues,
        t,
      }).slice(0, maxEntries);
      setRows(nextRows);
      setGeneratedAt(String(overview?.generatedAt || ''));
    } catch (fetchError) {
      setRows([]);
      setGeneratedAt('');
      setError(String(fetchError?.message || tr(t, 'globalTimeline.loadFailed', 'Could not load global timeline.')));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [
    includeAppActions,
    includeConnectionIssues,
    includeDashboardLogs,
    includeSessions,
    isPlatformAdmin,
    maxEntries,
    t,
    userAdminApi,
  ]);

  useEffect(() => {
    void fetchTimeline({ silent: false });
  }, [fetchTimeline]);

  useEffect(() => {
    if (!isPlatformAdmin || editMode) return undefined;
    if (!Number.isFinite(autoRefreshSec) || autoRefreshSec <= 0) return undefined;
    const timer = window.setInterval(() => {
      void fetchTimeline({ silent: true });
    }, autoRefreshSec * 1000);
    return () => window.clearInterval(timer);
  }, [autoRefreshSec, editMode, fetchTimeline, isPlatformAdmin]);

  const clientOptions = useMemo(() => {
    const unique = new Map();
    rows.forEach((row) => {
      const id = String(row?.clientId || '').trim();
      if (!id) return;
      if (unique.has(id)) return;
      unique.set(id, String(row?.clientName || id).trim() || id);
    });
    return Array.from(unique.entries())
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([value, label]) => ({ value, label }));
  }, [rows]);

  const filteredRows = useMemo(() => {
    const query = String(searchQuery || '').trim().toLowerCase();
    const nowMs = Date.now();
    const thresholdMs = getTimeThresholdMs(timeWindowFilter, nowMs);
    return rows.filter((row) => {
      const level = normalizeLevel(row?.level);
      const kind = String(row?.kind || '');
      const rowClient = String(row?.clientId || '').trim();
      if (severityFilter !== 'all' && level !== severityFilter) return false;
      if (sourceFilter !== 'all' && kind !== sourceFilter) return false;
      if (clientFilter !== 'all' && rowClient !== clientFilter) return false;
      if (thresholdMs !== null && toDateMs(row?.createdAt) < thresholdMs) return false;
      if (!query) return true;
      const haystack = [
        row?.title,
        row?.subtitle,
        row?.clientName,
        row?.actorName,
        row?.entityId,
        row?.entityName,
        row?.domain,
        row?.service,
        row?.summary,
      ].map((value) => String(value || '').toLowerCase()).join(' ');
      return haystack.includes(query);
    });
  }, [clientFilter, rows, searchQuery, severityFilter, sourceFilter, timeWindowFilter]);

  const selectedRow = useMemo(() => {
    if (!selectedRowId) return null;
    return rows.find((row) => String(row?.id || '') === selectedRowId) || null;
  }, [rows, selectedRowId]);

  useEffect(() => {
    if (!selectedRowId) return;
    if (!selectedRow) setSelectedRowId('');
  }, [selectedRow, selectedRowId]);

  const sourceOptions = useMemo(() => ([
    { value: 'all', label: tr(t, 'globalTimeline.filter.source.all', 'All sources') },
    { value: 'app_action', label: tr(t, 'globalTimeline.source.appAction', 'App actions') },
    { value: 'dashboard_save', label: tr(t, 'globalTimeline.source.dashboardSave', 'Dashboard saves') },
    { value: 'session_activity', label: tr(t, 'globalTimeline.source.session', 'Sessions') },
    { value: 'connection_issue', label: tr(t, 'globalTimeline.source.connectionIssue', 'Connection issues') },
  ]), [t]);

  const severityOptions = useMemo(() => ([
    { value: 'all', label: tr(t, 'globalTimeline.filter.severity.all', 'All severities') },
    { value: 'critical', label: tr(t, 'globalTimeline.filter.severity.critical', 'Critical') },
    { value: 'error', label: tr(t, 'globalTimeline.filter.severity.error', 'Error') },
    { value: 'warning', label: tr(t, 'globalTimeline.filter.severity.warning', 'Warning') },
    { value: 'info', label: tr(t, 'globalTimeline.filter.severity.info', 'Info') },
    { value: 'success', label: tr(t, 'globalTimeline.filter.severity.success', 'Success') },
  ]), [t]);

  const timeWindowOptions = useMemo(() => ([
    { value: 'all', label: tr(t, 'globalTimeline.filter.time.all', 'All time') },
    { value: '24h', label: tr(t, 'globalTimeline.filter.time.24h', 'Last 24h') },
    { value: '7d', label: tr(t, 'globalTimeline.filter.time.7d', 'Last 7 days') },
  ]), [t]);

  const detailModal = selectedRow && typeof document !== 'undefined'
    ? createPortal(
      <div
        className="fixed inset-0 z-[150] flex items-center justify-center p-3 sm:p-5"
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.55)', backdropFilter: 'blur(6px)' }}
        onClick={() => setSelectedRowId('')}
      >
        <div
          className="w-full max-w-3xl max-h-[84vh] rounded-3xl border overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, var(--card-bg) 0%, var(--modal-bg) 100%)',
            borderColor: 'var(--glass-border)',
          }}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-[var(--glass-border)]">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-secondary)] font-bold">
                {tr(t, 'globalTimeline.details', 'Timeline details')}
              </p>
              <p className="text-base font-semibold text-[var(--text-primary)] truncate mt-1">
                {String(selectedRow?.title || tr(t, 'globalTimeline.untitled', 'Timeline item'))}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedRowId('')}
              className="w-9 h-9 rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center justify-center"
              title={tr(t, 'globalTimeline.close', 'Close')}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-4 space-y-3 max-h-[calc(84vh-70px)] overflow-y-auto custom-scrollbar">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-2.5">
                <p className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-bold">
                  {tr(t, 'globalTimeline.field.source', 'Source')}
                </p>
                <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
                  {sourceOptions.find((option) => option.value === selectedRow?.kind)?.label || selectedRow?.kind || '-'}
                </p>
              </div>
              <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-2.5">
                <p className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-bold">
                  {tr(t, 'globalTimeline.field.createdAt', 'Created')}
                </p>
                <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
                  {formatDateTime(selectedRow?.createdAt, locale, true)}
                </p>
              </div>
              <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-2.5">
                <p className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-bold">
                  {tr(t, 'globalTimeline.field.client', 'Client')}
                </p>
                <p className="mt-1 text-sm text-[var(--text-primary)]">
                  {selectedRow?.clientName || selectedRow?.clientId || '-'}
                </p>
              </div>
              <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-2.5">
                <p className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-bold">
                  {tr(t, 'globalTimeline.field.actor', 'Actor')}
                </p>
                <p className="mt-1 text-sm text-[var(--text-primary)]">
                  {selectedRow?.actorName || '-'}
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-2.5">
              <p className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-bold">
                {tr(t, 'globalTimeline.field.subtitle', 'Details')}
              </p>
              <p className="mt-1 text-sm whitespace-pre-wrap break-words text-[var(--text-primary)]">
                {String(selectedRow?.subtitle || '-')}
              </p>
            </div>

            <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-2.5">
              <p className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-bold">
                {tr(t, 'globalTimeline.field.id', 'Entry ID')}
              </p>
              <p className="mt-1 text-xs font-mono break-all text-[var(--text-primary)]">
                {String(selectedRow?.id || '-')}
              </p>
            </div>

            {selectedRow?.raw ? (
              <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-2.5">
                <p className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-bold">
                  {tr(t, 'globalTimeline.field.raw', 'Raw payload')}
                </p>
                <pre className="mt-1 text-[11px] whitespace-pre-wrap break-words text-[var(--text-primary)] font-mono">
                  {JSON.stringify(selectedRow.raw, null, 2)}
                </pre>
              </div>
            ) : null}
          </div>
        </div>
      </div>,
      document.body,
    )
    : null;

  return (
    <>
      <div
        {...dragProps}
        className={`touch-feedback w-full rounded-3xl border relative overflow-hidden p-4 sm:p-5 font-sans break-inside-avoid ${
          editMode ? 'cursor-move' : ''
        }`}
        style={{
          ...cardStyle,
          background: 'linear-gradient(135deg, var(--card-bg) 0%, var(--modal-bg) 100%)',
          borderColor: 'var(--glass-border)',
        }}
      >
        {controls}

        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.26em] font-bold text-[var(--text-secondary)] truncate">
              {heading}
            </p>
            <p className="text-xs mt-1 text-[var(--text-secondary)]">
              {filteredRows.length}/{rows.length} {tr(t, 'globalTimeline.entries', 'entries')}
            </p>
            {generatedAt ? (
              <p className="text-[10px] mt-1 text-[var(--text-muted)]">
                {tr(t, 'globalTimeline.updatedAt', 'Updated')}: {formatDateTime(generatedAt, locale)}
              </p>
            ) : null}
          </div>

          <button
            type="button"
            onClick={() => void fetchTimeline({ silent: true })}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg)] text-[10px] uppercase tracking-wider font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-bg-hover)] transition-colors disabled:opacity-60"
            disabled={loading || refreshing || !isPlatformAdmin}
            title={tr(t, 'globalTimeline.refresh', 'Refresh')}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${(loading || refreshing) ? 'animate-spin' : ''}`} />
            <span>{tr(t, 'globalTimeline.refresh', 'Refresh')}</span>
          </button>
        </div>

        {!editMode && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 mb-3">
            <label className="relative sm:col-span-2 lg:col-span-2">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="w-full h-9 pl-8 pr-3 rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg)] text-xs text-[var(--text-primary)] outline-none focus:border-blue-500/40"
                placeholder={tr(t, 'globalTimeline.filter.search', 'Search timeline')}
              />
            </label>
            <select
              value={sourceFilter}
              onChange={(event) => setSourceFilter(event.target.value)}
              className="h-9 px-2.5 rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg)] text-xs text-[var(--text-primary)] outline-none focus:border-blue-500/40"
            >
              {sourceOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <select
              value={severityFilter}
              onChange={(event) => setSeverityFilter(event.target.value)}
              className="h-9 px-2.5 rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg)] text-xs text-[var(--text-primary)] outline-none focus:border-blue-500/40"
            >
              {severityOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <select
              value={clientFilter}
              onChange={(event) => setClientFilter(event.target.value)}
              className="h-9 px-2.5 rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg)] text-xs text-[var(--text-primary)] outline-none focus:border-blue-500/40"
            >
              <option value="all">{tr(t, 'globalTimeline.filter.client.all', 'All clients')}</option>
              {clientOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <select
              value={timeWindowFilter}
              onChange={(event) => setTimeWindowFilter(event.target.value)}
              className="h-9 px-2.5 rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg)] text-xs text-[var(--text-primary)] outline-none focus:border-blue-500/40 sm:col-span-2 lg:col-span-5"
            >
              {timeWindowOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
        )}

        {loading ? (
          <div className="rounded-2xl border border-dashed border-[var(--glass-border)] bg-[var(--glass-bg)] px-4 py-6 text-center">
            <p className="text-xs font-bold uppercase tracking-widest text-[var(--text-secondary)]">
              {tr(t, 'common.loading', 'Loading')}
            </p>
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-xs text-red-200">
            {error}
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--glass-border)] bg-[var(--glass-bg)] px-4 py-6 text-center">
            <p className="text-xs font-bold uppercase tracking-widest text-[var(--text-secondary)]">
              {tr(t, 'globalTimeline.emptyTitle', 'No timeline entries yet')}
            </p>
            <p className="text-[11px] mt-1 text-[var(--text-muted)]">
              {tr(t, 'globalTimeline.emptyHint', 'Client actions and logs will appear here.')}
            </p>
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--glass-border)] bg-[var(--glass-bg)] px-4 py-6 text-center">
            <p className="text-xs font-bold uppercase tracking-widest text-[var(--text-secondary)]">
              {tr(t, 'globalTimeline.noMatch', 'No entries match your filters')}
            </p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[420px] overflow-y-auto custom-scrollbar pr-1">
            {filteredRows.map((row) => {
              const source = sourceMeta[row?.kind] || { icon: Database, chipClass: 'border-[var(--glass-border)] bg-[var(--glass-bg)] text-[var(--text-secondary)]' };
              const level = levelMeta(row?.level);
              const SourceIcon = source.icon || Database;
              const LevelIcon = level.icon || AlertCircle;
              return (
                <div
                  key={row.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedRowId(String(row?.id || ''))}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setSelectedRowId(String(row?.id || ''));
                    }
                  }}
                  className="w-full text-left rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-2.5 hover:bg-[var(--glass-bg-hover)] transition-colors cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 min-w-0 flex-wrap">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wider ${source.chipClass}`}>
                          <SourceIcon className="w-3 h-3" />
                          {sourceOptions.find((option) => option.value === row?.kind)?.label || row?.kind}
                        </span>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wider ${level.chipClass}`}>
                          <LevelIcon className="w-3 h-3" />
                          {String(normalizeLevel(row?.level)).toUpperCase()}
                        </span>
                        <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
                          {String(row?.title || tr(t, 'globalTimeline.untitled', 'Timeline item'))}
                        </p>
                      </div>
                      {row?.subtitle ? (
                        <p className="mt-1.5 text-xs text-[var(--text-secondary)] whitespace-pre-wrap break-words">
                          {String(row.subtitle)}
                        </p>
                      ) : null}
                    </div>

                    <div className="inline-flex items-center gap-1 text-[10px] text-[var(--text-secondary)] shrink-0 mt-0.5">
                      <Clock className="w-3 h-3" />
                      <span>{formatDateTime(row?.createdAt, locale)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {detailModal}
    </>
  );
}
