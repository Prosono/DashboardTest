import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Building2,
  Check,
  Clock,
  Database,
  RefreshCw,
  Server,
  Shield,
  User,
  Wifi,
  X,
} from '../../icons';

const KPI_HISTORY_STORAGE_KEY = 'tunet_super_admin_kpi_history_v1';
const MAX_HISTORY_POINTS = 800;
const HISTORY_WINDOWS = [
  { key: '24h', hours: 24 },
  { key: '7d', hours: 24 * 7 },
  { key: '30d', hours: 24 * 30 },
];

const localeByLanguage = {
  en: 'en-US',
  nb: 'nb-NO',
  nn: 'nn-NO',
};

const statusTheme = {
  ready: {
    labelKey: 'superAdminOverview.connection.status.ready',
    className: 'bg-green-500/15 text-green-300 border border-green-500/30',
  },
  missing_url: {
    labelKey: 'superAdminOverview.connection.status.missing_url',
    className: 'bg-red-500/15 text-red-300 border border-red-500/30',
  },
  missing_token: {
    labelKey: 'superAdminOverview.connection.status.missing_token',
    className: 'bg-amber-500/15 text-amber-300 border border-amber-500/30',
  },
  missing_oauth: {
    labelKey: 'superAdminOverview.connection.status.missing_oauth',
    className: 'bg-amber-500/15 text-amber-300 border border-amber-500/30',
  },
};

const formatNumber = (value) => {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return '0';
  return num.toLocaleString('en-US');
};

const formatDateTime = (value, language) => {
  if (!value) return '-';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return '-';
  try {
    return dt.toLocaleString(localeByLanguage[language] || 'en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return dt.toISOString();
  }
};

const toMetricSnapshot = (payload) => {
  const generatedAt = Date.parse(String(payload?.generatedAt || ''));
  if (!Number.isFinite(generatedAt)) return null;
  const totals = payload?.totals && typeof payload.totals === 'object' ? payload.totals : {};
  return {
    ts: generatedAt,
    totals: {
      clients: Number(totals.clients || 0),
      users: Number(totals.users || 0),
      loggedInUsers: Number(totals.loggedInUsers || 0),
      connections: Number(totals.connections || 0),
      readyConnections: Number(totals.readyConnections || 0),
      issueConnections: Number(totals.issueConnections || 0),
      dashboards: Number(totals.dashboards || 0),
      activeSessions: Number(totals.activeSessions || 0),
      onlineSessions: Number(totals.onlineSessions || 0),
      logs: Number(totals.logs || 0),
      appActions: Number(totals.appActions || 0),
    },
  };
};

const readKpiHistory = () => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KPI_HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => ({
        ts: Number(item?.ts || 0),
        totals: item?.totals && typeof item.totals === 'object' ? item.totals : {},
      }))
      .filter((item) => Number.isFinite(item.ts) && item.ts > 0)
      .slice(-MAX_HISTORY_POINTS);
  } catch {
    return [];
  }
};

const writeKpiHistory = (history) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      KPI_HISTORY_STORAGE_KEY,
      JSON.stringify(Array.isArray(history) ? history.slice(-MAX_HISTORY_POINTS) : []),
    );
  } catch {
    // ignore storage errors
  }
};

const appendKpiHistory = (history, snapshot) => {
  if (!snapshot) return history;
  const base = Array.isArray(history) ? [...history] : [];
  const prev = base[base.length - 1];
  if (prev && prev.ts === snapshot.ts) {
    base[base.length - 1] = snapshot;
    return base.slice(-MAX_HISTORY_POINTS);
  }
  base.push(snapshot);
  return base.slice(-MAX_HISTORY_POINTS);
};

const buildHistorySeries = (history, metricKey, windowHours) => {
  const points = windowHours <= 24 ? 24 : 28;
  const now = Date.now();
  const windowMs = windowHours * 60 * 60 * 1000;
  const cutoff = now - windowMs;
  const bucketMs = windowMs / points;
  const buckets = Array.from({ length: points }, (_, index) => ({
    index,
    ts: cutoff + (index + 1) * bucketMs,
    value: null,
  }));

  const source = Array.isArray(history)
    ? history
      .filter((item) => item.ts >= cutoff)
      .sort((a, b) => a.ts - b.ts)
    : [];

  source.forEach((item) => {
    const value = Number(item?.totals?.[metricKey]);
    if (!Number.isFinite(value)) return;
    const relative = Math.max(0, item.ts - cutoff);
    const index = Math.min(points - 1, Math.floor(relative / bucketMs));
    buckets[index].value = value;
  });

  let lastValue = 0;
  return buckets.map((bucket) => {
    if (Number.isFinite(bucket.value)) {
      lastValue = bucket.value;
      return { ...bucket, value: bucket.value };
    }
    return { ...bucket, value: lastValue };
  });
};

function StatCard({ icon: Icon, label, value, tone = 'neutral', onClick, hint }) {
  const toneClass = tone === 'good'
    ? 'text-green-300 border-green-500/30 bg-green-500/10'
    : tone === 'warn'
      ? 'text-amber-300 border-amber-500/30 bg-amber-500/10'
      : 'text-[var(--text-primary)] border-[var(--glass-border)] bg-[var(--glass-bg)]';
  const interactiveClass = onClick
    ? 'hover:bg-[var(--glass-bg-hover)] cursor-pointer transition-colors'
    : '';

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`popup-surface rounded-2xl px-4 py-3 border text-left ${toneClass} ${interactiveClass}`}
      >
        <div className="flex items-center justify-between gap-3">
          <span className="text-[10px] uppercase tracking-[0.2em] font-bold opacity-80">{label}</span>
          <Icon className="w-4 h-4 opacity-80" />
        </div>
        <div className="mt-2 text-2xl font-semibold tracking-tight">{formatNumber(value)}</div>
        <div className="mt-1 text-[10px] uppercase tracking-[0.14em] opacity-70">{hint}</div>
      </button>
    );
  }

  return (
    <div className={`popup-surface rounded-2xl px-4 py-3 border ${toneClass}`}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10px] uppercase tracking-[0.2em] font-bold opacity-80">{label}</span>
        <Icon className="w-4 h-4 opacity-80" />
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight">{formatNumber(value)}</div>
    </div>
  );
}

export default function SuperAdminOverview({
  t,
  language,
  userAdminApi,
  isMobile,
}) {
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [activeKpiKey, setActiveKpiKey] = useState('');
  const [historyWindowKey, setHistoryWindowKey] = useState('24h');
  const [kpiHistory, setKpiHistory] = useState(() => readKpiHistory());

  const loadOverview = useCallback(async (isRefresh = false) => {
    if (!userAdminApi?.fetchPlatformOverview) {
      setError(t('superAdminOverview.loadFailed'));
      setLoading(false);
      setRefreshing(false);
      return;
    }

    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const payload = await userAdminApi.fetchPlatformOverview(80);
      setOverview(payload && typeof payload === 'object' ? payload : null);
      const snapshot = toMetricSnapshot(payload);
      setKpiHistory((prev) => {
        const next = appendKpiHistory(prev, snapshot);
        writeKpiHistory(next);
        return next;
      });
    } catch (loadError) {
      setError(loadError?.message || t('superAdminOverview.loadFailed'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userAdminApi, t]);

  useEffect(() => {
    loadOverview(false);
  }, [loadOverview]);

  const totals = useMemo(
    () => (overview?.totals && typeof overview.totals === 'object' ? overview.totals : {}),
    [overview?.totals],
  );
  const clients = useMemo(
    () => (Array.isArray(overview?.clients) ? overview.clients : []),
    [overview?.clients],
  );
  const sessions = useMemo(() => {
    if (Array.isArray(overview?.sessions)) return overview.sessions;
    return clients.flatMap((client) => (Array.isArray(client?.sessions) ? client.sessions : []));
  }, [overview?.sessions, clients]);
  const onlineSessions = useMemo(
    () => sessions.filter((session) => Boolean(session?.isOnline)),
    [sessions],
  );
  const sortedSessions = useMemo(
    () => sessions
      .slice()
      .sort((a, b) => {
        const aTs = Date.parse(String(a?.lastActivityAt || a?.lastSeenAt || a?.createdAt || ''));
        const bTs = Date.parse(String(b?.lastActivityAt || b?.lastSeenAt || b?.createdAt || ''));
        return (Number.isFinite(bTs) ? bTs : 0) - (Number.isFinite(aTs) ? aTs : 0);
      }),
    [sessions],
  );
  const recentLogs = useMemo(
    () => (Array.isArray(overview?.recentLogs) ? overview.recentLogs : []),
    [overview?.recentLogs],
  );
  const recentAppActions = useMemo(
    () => (Array.isArray(overview?.recentAppActions) ? overview.recentAppActions : []),
    [overview?.recentAppActions],
  );
  const generatedAt = overview?.generatedAt || null;

  const instances = useMemo(() => {
    if (Array.isArray(overview?.instances) && overview.instances.length) return overview.instances;
    return clients.flatMap((client) => (
      (Array.isArray(client.connections) ? client.connections : []).map((connection) => ({
        clientId: client.id,
        clientName: client.name,
        connectionId: connection.id,
        connectionName: connection.name,
        isPrimary: Boolean(connection.isPrimary),
        authMethod: connection.authMethod,
        status: connection.status,
        ready: Boolean(connection.ready),
        urlHost: connection.urlHost || '',
        fallbackUrlHost: connection.fallbackUrlHost || '',
        updatedAt: connection.updatedAt || client.updatedAt || null,
      }))
    ));
  }, [overview?.instances, clients]);

  const issues = useMemo(() => {
    if (Array.isArray(overview?.issues)) return overview.issues;
    return instances.filter((instance) => instance.status !== 'ready');
  }, [overview?.issues, instances]);

  const statCards = useMemo(() => ([
    {
      key: 'clients',
      icon: Building2,
      label: t('superAdminOverview.stats.clients'),
      value: totals.clients || 0,
      tone: 'neutral',
    },
    {
      key: 'users',
      icon: User,
      label: t('superAdminOverview.stats.users'),
      value: totals.users || 0,
      tone: 'neutral',
    },
    {
      key: 'loggedInUsers',
      icon: Shield,
      label: t('superAdminOverview.stats.loggedInUsers'),
      value: totals.loggedInUsers || 0,
      tone: 'good',
    },
    {
      key: 'connections',
      icon: Wifi,
      label: t('superAdminOverview.stats.connections'),
      value: totals.connections || 0,
      tone: 'neutral',
    },
    {
      key: 'readyConnections',
      icon: Check,
      label: t('superAdminOverview.stats.readyConnections'),
      value: totals.readyConnections || 0,
      tone: 'good',
    },
    {
      key: 'issueConnections',
      icon: AlertTriangle,
      label: t('superAdminOverview.stats.issueConnections'),
      value: totals.issueConnections || 0,
      tone: Number(totals.issueConnections || 0) > 0 ? 'warn' : 'good',
    },
    {
      key: 'dashboards',
      icon: Database,
      label: t('superAdminOverview.stats.dashboards'),
      value: totals.dashboards || 0,
      tone: 'neutral',
    },
    {
      key: 'activeSessions',
      icon: Shield,
      label: t('superAdminOverview.stats.activeSessions'),
      value: totals.activeSessions || 0,
      tone: 'neutral',
    },
    {
      key: 'onlineSessions',
      icon: Activity,
      label: t('superAdminOverview.stats.onlineSessions'),
      value: totals.onlineSessions || 0,
      tone: Number(totals.onlineSessions || 0) > 0 ? 'good' : 'neutral',
    },
    {
      key: 'logs',
      icon: Activity,
      label: t('superAdminOverview.stats.logs'),
      value: totals.logs || 0,
      tone: 'neutral',
    },
    {
      key: 'appActions',
      icon: Activity,
      label: t('superAdminOverview.stats.appActions'),
      value: totals.appActions || 0,
      tone: 'neutral',
    },
  ]), [t, totals]);

  const kpiMap = useMemo(
    () => Object.fromEntries(statCards.map((card) => [card.key, card])),
    [statCards],
  );

  const activeKpi = activeKpiKey ? (kpiMap[activeKpiKey] || null) : null;
  const activeWindow = HISTORY_WINDOWS.find((entry) => entry.key === historyWindowKey) || HISTORY_WINDOWS[0];
  const historySeries = useMemo(() => {
    if (!activeKpiKey) return [];
    return buildHistorySeries(kpiHistory, activeKpiKey, activeWindow.hours);
  }, [kpiHistory, activeKpiKey, activeWindow.hours]);
  const historyValues = historySeries.map((point) => Number(point.value || 0));
  const historyMin = historyValues.length ? Math.min(...historyValues) : 0;
  const historyMax = historyValues.length ? Math.max(...historyValues) : 0;
  const historyRange = Math.max(1, historyMax - historyMin);

  const activeKpiRows = useMemo(() => {
    switch (activeKpiKey) {
      case 'clients':
        return clients.map((client) => ({
          id: client.id,
          title: client.name || client.id,
          subtitle: `${t('superAdminOverview.client.id')}: ${client.id}`,
          value: `${t('superAdminOverview.client.users')}: ${formatNumber(client.userCount || 0)}`,
          date: client.updatedAt,
        }));
      case 'users':
        return clients
          .map((client) => ({
            id: client.id,
            title: client.name || client.id,
            subtitle: `${t('superAdminOverview.client.id')}: ${client.id}`,
            value: `${formatNumber(client.userCount || 0)}`,
            date: client.updatedAt,
          }))
          .sort((a, b) => Number(b.value || 0) - Number(a.value || 0));
      case 'loggedInUsers':
        return clients
          .map((client) => ({
            id: client.id,
            title: client.name || client.id,
            subtitle: `${t('superAdminOverview.client.id')}: ${client.id}`,
            value: `${formatNumber(client.loggedInUserCount || 0)}`,
            date: client.updatedAt,
          }))
          .sort((a, b) => Number(b.value || 0) - Number(a.value || 0));
      case 'connections':
        return instances.map((instance) => ({
          id: `${instance.clientId}:${instance.connectionId}`,
          title: `${instance.clientName || instance.clientId} / ${instance.connectionName || instance.connectionId}`,
          subtitle: `${t('superAdminOverview.connection.authLabel')}: ${instance.authMethod === 'token' ? t('superAdminOverview.connection.auth.token') : t('superAdminOverview.connection.auth.oauth')}`,
          value: t((statusTheme[instance.status] || statusTheme.missing_url).labelKey),
          status: instance.status,
          date: instance.updatedAt,
        }));
      case 'readyConnections':
        return instances
          .filter((instance) => instance.status === 'ready')
          .map((instance) => ({
            id: `${instance.clientId}:${instance.connectionId}`,
            title: `${instance.clientName || instance.clientId} / ${instance.connectionName || instance.connectionId}`,
            subtitle: `${t('superAdminOverview.connection.authLabel')}: ${instance.authMethod === 'token' ? t('superAdminOverview.connection.auth.token') : t('superAdminOverview.connection.auth.oauth')}`,
            value: t((statusTheme[instance.status] || statusTheme.ready).labelKey),
            status: instance.status,
            date: instance.updatedAt,
          }));
      case 'issueConnections':
        return issues.map((issue, index) => ({
          id: `${issue.clientId}:${issue.connectionId}:${index}`,
          title: `${issue.clientName || issue.clientId} / ${issue.connectionName || issue.connectionId}`,
          subtitle: t(`superAdminOverview.connection.reason.${issue.status}`),
          value: t((statusTheme[issue.status] || statusTheme.missing_url).labelKey),
          status: issue.status,
          date: issue.updatedAt,
        }));
      case 'dashboards':
        return clients
          .map((client) => ({
            id: client.id,
            title: client.name || client.id,
            subtitle: `${t('superAdminOverview.client.id')}: ${client.id}`,
            value: `${formatNumber(client.dashboardCount || 0)}`,
            date: client.updatedAt,
          }))
          .sort((a, b) => Number(b.value || 0) - Number(a.value || 0));
      case 'activeSessions':
        return sortedSessions.map((session) => ({
          id: session.id || `${session.clientId}:${session.userId}:${session.lastSeenAt || ''}`,
          title: `${session.username || '-'} / ${session.clientId || '-'}`,
          subtitle: `${t('superAdminOverview.sessions.from')}: ${session.ipAddress || '-'} • ${session.deviceLabel || session.deviceType || '-'}`,
          value: session.lastActivityLabel || session.lastActivityPath || t('superAdminOverview.sessions.unknownActivity'),
          date: session.lastSeenAt || session.lastActivityAt || session.createdAt,
        }));
      case 'onlineSessions':
        return sortedSessions
          .filter((session) => Boolean(session.isOnline))
          .map((session) => ({
            id: session.id || `${session.clientId}:${session.userId}:${session.lastSeenAt || ''}`,
            title: `${session.username || '-'} / ${session.clientId || '-'}`,
            subtitle: `${t('superAdminOverview.sessions.from')}: ${session.ipAddress || '-'} • ${session.deviceLabel || session.deviceType || '-'}`,
            value: session.lastActivityLabel || session.lastActivityPath || t('superAdminOverview.sessions.unknownActivity'),
            date: session.lastSeenAt || session.lastActivityAt || session.createdAt,
          }));
      case 'logs':
        return recentLogs.map((log) => ({
          id: log.id,
          title: `${log.clientId} / ${log.dashboardId}`,
          subtitle: `${t('superAdminOverview.logs.savedBy')}: ${log.createdByUsername || log.createdBy || '-'}`,
          value: log.type || 'log',
          date: log.createdAt,
        }));
      case 'appActions':
        return recentAppActions.map((entry, index) => ({
          id: entry.id || `${entry.clientId || 'client'}_${entry.createdAt || index}`,
          title: `${entry.clientName || entry.clientId || '-'} / ${entry.entityName || entry.entityId || '-'}`,
          subtitle: `${t('superAdminOverview.appActions.actor')}: ${entry?.actor?.username || entry?.actor?.id || '-'}`,
          value: [entry.domain, entry.service].filter(Boolean).join('.') || t('superAdminOverview.appActions.fallback'),
          date: entry.createdAt || null,
        }));
      default:
        return [];
    }
  }, [activeKpiKey, clients, instances, issues, recentLogs, recentAppActions, sortedSessions, t]);

  return (
    <div className="page-transition flex flex-col gap-4 md:gap-6 font-sans" data-disable-pull-refresh="true">
      <section className="popup-surface rounded-3xl p-4 md:p-6 border border-[var(--glass-border)]">
        <div className={`flex ${isMobile ? 'flex-col gap-3' : 'items-start justify-between gap-4'}`}>
          <div>
            <h2 className="text-lg md:text-xl font-semibold uppercase tracking-[0.14em] text-[var(--text-primary)]">
              {t('superAdminOverview.title')}
            </h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)] max-w-3xl">
              {t('superAdminOverview.subtitle')}
            </p>
            <p className="mt-2 text-[11px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
              {t('superAdminOverview.lastUpdated')}: {formatDateTime(generatedAt, language)}
            </p>
          </div>

          <button
            type="button"
            onClick={() => loadOverview(true)}
            disabled={loading || refreshing}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] text-[var(--text-primary)] text-xs font-bold uppercase tracking-[0.18em] hover:bg-[var(--glass-bg-hover)] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? t('common.saving') : t('superAdminOverview.refresh')}
          </button>
        </div>
      </section>

      {error && (
        <section className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </section>
      )}

      {loading ? (
        <section className="popup-surface rounded-3xl p-6 border border-[var(--glass-border)]">
          <p className="text-sm text-[var(--text-secondary)]">{t('superAdminOverview.loading')}</p>
        </section>
      ) : (
        <>
          <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {statCards.map((card) => (
              <StatCard
                key={card.key}
                icon={card.icon}
                label={card.label}
                value={card.value}
                tone={card.tone}
                onClick={() => setActiveKpiKey(card.key)}
                hint={t('superAdminOverview.kpi.viewHistory')}
              />
            ))}
          </section>

          <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="popup-surface rounded-3xl p-4 md:p-5 border border-[var(--glass-border)]">
              <div className="flex items-center justify-between gap-3 mb-4">
                <h3 className="text-xs md:text-sm font-bold uppercase tracking-[0.2em] text-[var(--text-secondary)]">
                  {t('superAdminOverview.issues.title')}
                </h3>
                <span className={`px-2 py-1 rounded-full text-[10px] uppercase tracking-[0.14em] ${issues.length > 0 ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30' : 'bg-green-500/15 text-green-300 border border-green-500/30'}`}>
                  {formatNumber(issues.length)}
                </span>
              </div>

              {issues.length === 0 ? (
                <p className="text-sm text-[var(--text-secondary)]">{t('superAdminOverview.issues.none')}</p>
              ) : (
                <div className="space-y-2 max-h-[44vh] overflow-y-auto custom-scrollbar pr-1">
                  {issues.map((issue, index) => (
                    <div
                      key={`${issue.clientId}-${issue.connectionId}-${index}`}
                      className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2.5"
                    >
                      <p className="text-xs font-semibold text-[var(--text-primary)]">
                        {(issue.clientName || issue.clientId)} / {(issue.connectionName || issue.connectionId)}
                      </p>
                      <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                        {t(`superAdminOverview.connection.reason.${issue.status}`)}
                      </p>
                      <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)] mt-1">
                        {t((statusTheme[issue.status] || statusTheme.missing_url).labelKey)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="popup-surface rounded-3xl p-4 md:p-5 border border-[var(--glass-border)]">
              <div className="flex items-center justify-between gap-3 mb-4">
                <h3 className="text-xs md:text-sm font-bold uppercase tracking-[0.2em] text-[var(--text-secondary)]">
                  {t('superAdminOverview.instances.title')}
                </h3>
                <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-[0.18em]">
                  {formatNumber(instances.length)}
                </span>
              </div>

              {instances.length === 0 ? (
                <p className="text-sm text-[var(--text-secondary)]">{t('superAdminOverview.instances.empty')}</p>
              ) : (
                <div className="space-y-2 max-h-[44vh] overflow-y-auto custom-scrollbar pr-1">
                  {instances.map((instance) => {
                    const status = statusTheme[instance.status] || statusTheme.missing_url;
                    return (
                      <div
                        key={`${instance.clientId}:${instance.connectionId}`}
                        className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-3 py-2.5"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs font-semibold text-[var(--text-primary)]">
                            {(instance.clientName || instance.clientId)} / {(instance.connectionName || instance.connectionId)}
                          </p>
                          <span className={`px-2 py-1 rounded-full text-[10px] uppercase tracking-[0.14em] ${status.className}`}>
                            {t(status.labelKey)}
                          </span>
                        </div>
                        <p className="text-[11px] text-[var(--text-secondary)] mt-1">
                          {t('superAdminOverview.connection.authLabel')}: {instance.authMethod === 'token' ? t('superAdminOverview.connection.auth.token') : t('superAdminOverview.connection.auth.oauth')}
                        </p>
                        <p className="text-[11px] text-[var(--text-secondary)]">
                          {t('superAdminOverview.instances.url')}: {instance.urlHost || '-'}
                        </p>
                        <p className="text-[11px] text-[var(--text-secondary)]">
                          {t('superAdminOverview.instances.fallback')}: {instance.fallbackUrlHost || '-'}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          <section className="grid grid-cols-1 xl:grid-cols-[1.35fr_0.65fr] gap-4">
            <div className="popup-surface rounded-3xl p-4 md:p-5 border border-[var(--glass-border)]">
              <div className="flex items-center justify-between gap-3 mb-4">
                <h3 className="text-xs md:text-sm font-bold uppercase tracking-[0.2em] text-[var(--text-secondary)]">
                  {t('superAdminOverview.sections.clients')}
                </h3>
                <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-[0.18em]">
                  {formatNumber(clients.length)}
                </span>
              </div>

              {clients.length === 0 ? (
                <p className="text-sm text-[var(--text-secondary)]">{t('superAdminOverview.noData')}</p>
              ) : (
                <div className="space-y-3 max-h-[62vh] overflow-y-auto custom-scrollbar pr-1">
                  {clients.map((client) => (
                    <article
                      key={client.id}
                      className="rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <h4 className="text-sm md:text-base font-semibold text-[var(--text-primary)]">
                            {client.name || client.id}
                          </h4>
                          <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
                            {t('superAdminOverview.client.id')}: {client.id}
                          </p>
                        </div>
                        <div className="text-[10px] uppercase tracking-[0.15em] text-[var(--text-muted)]">
                          <Clock className="w-3 h-3 inline mr-1 align-[-1px]" />
                          {formatDateTime(client.updatedAt, language)}
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-2 md:grid-cols-5 gap-2">
                        <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--card-bg)] px-2.5 py-2">
                          <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">{t('superAdminOverview.client.users')}</p>
                          <p className="text-base font-semibold text-[var(--text-primary)]">{formatNumber(client.userCount)}</p>
                        </div>
                        <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--card-bg)] px-2.5 py-2">
                          <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">{t('superAdminOverview.client.admins')}</p>
                          <p className="text-base font-semibold text-[var(--text-primary)]">{formatNumber(client.adminCount)}</p>
                        </div>
                        <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--card-bg)] px-2.5 py-2">
                          <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">{t('superAdminOverview.client.dashboards')}</p>
                          <p className="text-base font-semibold text-[var(--text-primary)]">{formatNumber(client.dashboardCount)}</p>
                        </div>
                        <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--card-bg)] px-2.5 py-2">
                          <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">{t('superAdminOverview.client.sessions')}</p>
                          <p className="text-base font-semibold text-[var(--text-primary)]">{formatNumber(client.activeSessionCount)}</p>
                        </div>
                        <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--card-bg)] px-2.5 py-2">
                          <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">{t('superAdminOverview.client.loggedInUsers')}</p>
                          <p className="text-base font-semibold text-[var(--text-primary)]">{formatNumber(client.loggedInUserCount)}</p>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-4">
              <div className="popup-surface rounded-3xl p-4 md:p-5 border border-[var(--glass-border)]">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <h3 className="text-xs md:text-sm font-bold uppercase tracking-[0.2em] text-[var(--text-secondary)]">
                    {t('superAdminOverview.sections.logs')}
                  </h3>
                  <Server className="w-4 h-4 text-[var(--text-muted)]" />
                </div>

                {recentLogs.length === 0 ? (
                  <p className="text-sm text-[var(--text-secondary)]">{t('superAdminOverview.logs.empty')}</p>
                ) : (
                  <div className="space-y-2 max-h-[28vh] overflow-y-auto custom-scrollbar pr-1">
                    {recentLogs.map((log) => (
                      <div
                        key={log.id}
                        className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-3 py-2.5"
                      >
                        <p className="text-xs font-semibold text-[var(--text-primary)]">
                          {log.clientId} / {log.dashboardId}
                        </p>
                        <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                          {t('superAdminOverview.logs.savedBy')}: {log.createdByUsername || log.createdBy || '-'}
                        </p>
                        <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)] mt-1">
                          {formatDateTime(log.createdAt, language)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="popup-surface rounded-3xl p-4 md:p-5 border border-[var(--glass-border)]">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <h3 className="text-xs md:text-sm font-bold uppercase tracking-[0.2em] text-[var(--text-secondary)]">
                    {t('superAdminOverview.sections.appActions')}
                  </h3>
                  <Activity className="w-4 h-4 text-[var(--text-muted)]" />
                </div>

                {recentAppActions.length === 0 ? (
                  <p className="text-sm text-[var(--text-secondary)]">{t('superAdminOverview.appActions.empty')}</p>
                ) : (
                  <div className="space-y-2 max-h-[30vh] overflow-y-auto custom-scrollbar pr-1">
                    {recentAppActions.map((entry, index) => (
                      <div
                        key={entry.id || `${entry.clientId || 'client'}_${entry.createdAt || index}`}
                        className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-3 py-2.5"
                      >
                        <p className="text-xs font-semibold text-[var(--text-primary)]">
                          {entry.clientName || entry.clientId || '-'} / {entry.entityName || entry.entityId || '-'}
                        </p>
                        <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                          {[entry.domain, entry.service].filter(Boolean).join('.') || t('superAdminOverview.appActions.fallback')}
                        </p>
                        <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                          {t('superAdminOverview.appActions.actor')}: {entry?.actor?.username || entry?.actor?.id || '-'}
                        </p>
                        <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)] mt-1">
                          {formatDateTime(entry.createdAt, language)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="popup-surface rounded-3xl p-4 md:p-5 border border-[var(--glass-border)]">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <h3 className="text-xs md:text-sm font-bold uppercase tracking-[0.2em] text-[var(--text-secondary)]">
                {t('superAdminOverview.sections.liveSessions')}
              </h3>
              <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
                <span className="px-2 py-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
                  {t('superAdminOverview.sessions.online')}: {formatNumber(onlineSessions.length)}
                </span>
                <span className="px-2 py-1 rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg)] text-[var(--text-secondary)]">
                  {t('superAdminOverview.client.sessions')}: {formatNumber(sortedSessions.length)}
                </span>
              </div>
            </div>

            {sortedSessions.length === 0 ? (
              <p className="text-sm text-[var(--text-secondary)]">{t('superAdminOverview.sessions.empty')}</p>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 max-h-[52vh] overflow-y-auto custom-scrollbar pr-1">
                {sortedSessions.map((session) => (
                  <article
                    key={`${session.id || session.userId}-${session.lastSeenAt || session.createdAt || ''}`}
                    className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-3 py-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-[var(--text-primary)] truncate">
                          {session.username || '-'}
                        </p>
                        <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)] truncate">
                          {t('superAdminOverview.client.id')}: {session.clientId || '-'}
                        </p>
                      </div>
                      <span className={`px-2 py-1 rounded-full text-[10px] uppercase tracking-[0.14em] border ${
                        session.isOnline
                          ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                          : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                      }`}>
                        {session.isOnline ? t('superAdminOverview.sessions.online') : t('superAdminOverview.sessions.idle')}
                      </span>
                    </div>

                    <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                      <div className="rounded-lg border border-[var(--glass-border)] bg-[var(--card-bg)] px-2 py-1.5">
                        <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--text-muted)]">{t('superAdminOverview.sessions.ip')}</p>
                        <p className="text-[var(--text-primary)] truncate">{session.ipAddress || '-'}</p>
                      </div>
                      <div className="rounded-lg border border-[var(--glass-border)] bg-[var(--card-bg)] px-2 py-1.5">
                        <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--text-muted)]">{t('superAdminOverview.sessions.device')}</p>
                        <p className="text-[var(--text-primary)] truncate">{session.deviceLabel || session.deviceType || '-'}</p>
                      </div>
                    </div>

                    <div className="mt-2 rounded-lg border border-[var(--glass-border)] bg-[var(--card-bg)] px-2 py-1.5">
                      <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--text-muted)]">{t('superAdminOverview.sessions.activity')}</p>
                      <p className="text-[11px] text-[var(--text-primary)] truncate">
                        {session.lastActivityLabel || t('superAdminOverview.sessions.unknownActivity')}
                      </p>
                      <p className="mt-0.5 text-[10px] uppercase tracking-[0.12em] text-[var(--text-muted)] truncate">
                        {session.lastActivityPath || '-'}
                      </p>
                    </div>

                    <div className="mt-2 flex items-center justify-between gap-2 text-[10px] uppercase tracking-[0.12em] text-[var(--text-muted)]">
                      <span>{t('superAdminOverview.sessions.lastActivity')}: {formatDateTime(session.lastActivityAt, language)}</span>
                      <span>{t('superAdminOverview.sessions.lastSeen')}: {formatDateTime(session.lastSeenAt, language)}</span>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {activeKpi && (
        <div className="fixed inset-0 z-[120] bg-black/65 backdrop-blur-md p-3 md:p-6 overflow-y-auto">
          <div className="max-w-5xl mx-auto mt-2 md:mt-6 popup-surface rounded-3xl border border-[var(--glass-border)]">
            <div className="px-4 md:px-6 py-4 border-b border-[var(--glass-border)] flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">{t('superAdminOverview.kpi.history')}</p>
                <h3 className="text-sm md:text-base font-semibold text-[var(--text-primary)]">{activeKpi.label}</h3>
              </div>
              <button
                type="button"
                onClick={() => setActiveKpiKey('')}
                className="w-10 h-10 rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg)] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                title={t('common.close')}
                aria-label={t('common.close')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 md:p-6 grid grid-cols-1 lg:grid-cols-[1fr_0.95fr] gap-4">
              <div className="rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-4">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <p className="text-xs font-semibold text-[var(--text-primary)]">
                    {t('superAdminOverview.kpi.history')}
                  </p>
                  <div className="flex items-center gap-1">
                    {HISTORY_WINDOWS.map((windowOption) => (
                      <button
                        key={windowOption.key}
                        type="button"
                        onClick={() => setHistoryWindowKey(windowOption.key)}
                        className={`px-2 py-1 rounded-full text-[10px] uppercase tracking-[0.14em] border ${
                          historyWindowKey === windowOption.key
                            ? 'bg-[var(--glass-bg-hover)] text-[var(--text-primary)] border-[var(--glass-border)]'
                            : 'bg-[var(--glass-bg)] text-[var(--text-secondary)] border-[var(--glass-border)]'
                        }`}
                      >
                        {t(`superAdminOverview.kpi.window.${windowOption.key}`)}
                      </button>
                    ))}
                  </div>
                </div>

                {historySeries.length === 0 ? (
                  <p className="text-sm text-[var(--text-secondary)]">{t('superAdminOverview.kpi.historyEmpty')}</p>
                ) : (
                  <div className="grid grid-cols-[42px_1fr] gap-3 items-stretch">
                    <div className="flex flex-col justify-between py-1 text-[10px] text-[var(--text-muted)] uppercase tracking-[0.12em]">
                      <span>{formatNumber(historyMax)}</span>
                      <span>{formatNumber(historyMin)}</span>
                    </div>
                    <div className="h-40 border border-[var(--glass-border)] rounded-xl bg-[var(--card-bg)] px-2 py-2 flex items-end gap-1">
                      {historySeries.map((point) => {
                        const normalizedHeight = ((Number(point.value || 0) - historyMin) / historyRange) * 100;
                        const clamped = Math.max(3, Math.min(100, normalizedHeight));
                        return (
                          <div
                            key={`history-${point.index}`}
                            className="flex-1 rounded-t-sm bg-blue-400/70"
                            style={{ height: `${clamped}%` }}
                            title={`${formatDateTime(point.ts, language)} • ${formatNumber(point.value)}`}
                          />
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-4">
                <p className="text-xs font-semibold text-[var(--text-primary)] mb-3">
                  {t('superAdminOverview.kpi.details')}
                </p>
                {activeKpiRows.length === 0 ? (
                  <p className="text-sm text-[var(--text-secondary)]">{t('superAdminOverview.kpi.noRows')}</p>
                ) : (
                  <div className="space-y-2 max-h-[50vh] overflow-y-auto custom-scrollbar pr-1">
                    {activeKpiRows.map((row) => (
                      <div
                        key={row.id}
                        className={`rounded-xl border px-3 py-2 ${
                          row.status && statusTheme[row.status]
                            ? statusTheme[row.status].className
                            : 'border-[var(--glass-border)] bg-[var(--card-bg)] text-[var(--text-primary)]'
                        }`}
                      >
                        <p className="text-xs font-semibold">{row.title}</p>
                        <p className="text-[11px] mt-0.5 opacity-90">{row.subtitle}</p>
                        <div className="mt-1 flex items-center justify-between gap-2">
                          <p className="text-[11px] uppercase tracking-[0.12em] opacity-90">{row.value}</p>
                          <p className="text-[10px] uppercase tracking-[0.12em] opacity-70">
                            {formatDateTime(row.date, language)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
