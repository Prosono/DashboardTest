import { useCallback, useEffect, useState } from 'react';
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
} from '../../icons';

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

function StatCard({ icon: Icon, label, value, tone = 'neutral' }) {
  const toneClass = tone === 'good'
    ? 'text-green-300 border-green-500/30 bg-green-500/10'
    : tone === 'warn'
      ? 'text-amber-300 border-amber-500/30 bg-amber-500/10'
      : 'text-[var(--text-primary)] border-[var(--glass-border)] bg-[var(--glass-bg)]';

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
      const payload = await userAdminApi.fetchPlatformOverview(60);
      setOverview(payload && typeof payload === 'object' ? payload : null);
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

  const totals = overview?.totals || {};
  const clients = Array.isArray(overview?.clients) ? overview.clients : [];
  const recentLogs = Array.isArray(overview?.recentLogs) ? overview.recentLogs : [];
  const generatedAt = overview?.generatedAt || null;

  const statCards = [
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
      key: 'logs',
      icon: Activity,
      label: t('superAdminOverview.stats.logs'),
      value: totals.logs || 0,
      tone: 'neutral',
    },
  ];

  return (
    <div className="page-transition flex flex-col gap-4 md:gap-6 font-sans">
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
              />
            ))}
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

                      <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2">
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
                      </div>

                      <div className="mt-3">
                        <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)] mb-2">
                          {t('superAdminOverview.client.connections')}
                        </p>
                        <div className="space-y-2">
                          {(Array.isArray(client.connections) ? client.connections : []).map((connection) => {
                            const status = statusTheme[connection.status] || statusTheme.missing_url;
                            return (
                              <div
                                key={`${client.id}-${connection.id}`}
                                className="rounded-xl border border-[var(--glass-border)] bg-[var(--card-bg)] px-3 py-2 flex flex-wrap items-center justify-between gap-2"
                              >
                                <div className="min-w-0">
                                  <p className="text-xs font-semibold text-[var(--text-primary)] truncate">
                                    {connection.name || connection.id}
                                  </p>
                                  <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
                                    {connection.id}
                                    {connection.isPrimary ? ` • ${t('superAdminOverview.connection.primary')}` : ''}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="px-2 py-1 rounded-full text-[10px] uppercase tracking-[0.14em] border border-[var(--glass-border)] bg-[var(--glass-bg)] text-[var(--text-secondary)]">
                                    {connection.authMethod === 'token'
                                      ? t('superAdminOverview.connection.auth.token')
                                      : t('superAdminOverview.connection.auth.oauth')}
                                  </span>
                                  <span className={`px-2 py-1 rounded-full text-[10px] uppercase tracking-[0.14em] ${status.className}`}>
                                    {t(status.labelKey)}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>

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
                <div className="space-y-2 max-h-[62vh] overflow-y-auto custom-scrollbar pr-1">
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
          </section>
        </>
      )}
    </div>
  );
}
