import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Database,
  Download,
  LogIn,
  RefreshCw,
  Server,
} from '../../icons';

const localeByLanguage = {
  en: 'en-US',
  nb: 'nb-NO',
  nn: 'nn-NO',
};

const statusClass = {
  success: 'bg-[var(--status-success-bg)] text-[var(--status-success-text)] border border-[var(--status-success-border)]',
  blocked: 'bg-[var(--status-warning-bg)] text-[var(--status-warning-text)] border border-[var(--status-warning-border)]',
  failed: 'bg-[var(--status-danger-bg)] text-[var(--status-danger-text)] border border-[var(--status-danger-border)]',
};

const loginStatusLabelKeys = {
  success: 'superAdminOverview.loginAttempts.status.success',
  blocked: 'superAdminOverview.loginAttempts.status.blocked',
  failed: 'superAdminOverview.loginAttempts.status.failed',
};

const loginReasonLabelKeys = {
  missing_fields: 'superAdminOverview.loginAttempts.reason.missing_fields',
  rate_limited: 'superAdminOverview.loginAttempts.reason.rate_limited',
  super_admin_wrong_client: 'superAdminOverview.loginAttempts.reason.super_admin_wrong_client',
  super_admin: 'superAdminOverview.loginAttempts.reason.super_admin',
  password_login: 'superAdminOverview.loginAttempts.reason.password_login',
  client_not_found: 'superAdminOverview.loginAttempts.reason.client_not_found',
  user_not_found: 'superAdminOverview.loginAttempts.reason.user_not_found',
  password_mismatch: 'superAdminOverview.loginAttempts.reason.password_mismatch',
  invalid_login: 'superAdminOverview.loginAttempts.reason.invalid_login',
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

const formatLoginReason = (reason, t) => {
  const normalized = String(reason || '').trim();
  if (!normalized) return '-';
  const labelKey = loginReasonLabelKeys[normalized];
  return labelKey ? t(labelKey) : normalized.replace(/_/g, ' ');
};

const triggerBlobDownload = (blob, fileName) => {
  if (typeof document === 'undefined' || !blob) return;
  const url = globalThis.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName || 'smart-sauna-raw-log.log';
  document.body.appendChild(link);
  link.click();
  link.remove();
  globalThis.URL.revokeObjectURL(url);
};

function SummaryCard({ icon: Icon, label, value, hint, tone = 'neutral' }) {
  const toneClass = tone === 'warn'
    ? 'border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[var(--status-warning-text)]'
    : tone === 'danger'
      ? 'border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] text-[var(--status-danger-text)]'
      : 'border-[var(--glass-border)] bg-[var(--glass-bg)] text-[var(--text-primary)]';

  return (
    <div className={`rounded-2xl border px-4 py-3 ${toneClass}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.18em] opacity-75">{label}</p>
          <p className="mt-2 text-2xl md:text-3xl leading-none font-semibold tracking-tight">{value}</p>
          {hint ? <p className="mt-2 text-[11px] opacity-70 truncate">{hint}</p> : null}
        </div>
        <div className="rounded-2xl border border-current/10 bg-black/5 p-2">
          <Icon className="w-4 h-4 opacity-75" />
        </div>
      </div>
    </div>
  );
}

function Panel({ title, icon: Icon, children, action }) {
  return (
    <section className="popup-surface rounded-3xl p-4 md:p-5 border border-[var(--glass-border)]">
      <div className="flex items-start justify-between gap-3 mb-4">
        <h3 className="text-xs md:text-sm font-bold uppercase tracking-[0.2em] text-[var(--text-secondary)]">
          {title}
        </h3>
        {action || (Icon ? <Icon className="w-4 h-4 text-[var(--text-muted)]" /> : null)}
      </div>
      {children}
    </section>
  );
}

export default function SuperAdminLoggingPage({
  t,
  language,
  userAdminApi,
  isMobile,
}) {
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [downloadingRawLog, setDownloadingRawLog] = useState(false);

  const loadOverview = useCallback(async (isRefresh = false, options = {}) => {
    const showRefreshSpinner = Boolean(isRefresh && options.showSpinner !== false);
    const shouldShowError = options.showError !== false;

    if (!userAdminApi?.fetchPlatformOverview) {
      if (shouldShowError) setError(t('superAdminLogging.loadFailed'));
      setLoading(false);
      if (showRefreshSpinner) setRefreshing(false);
      return;
    }

    if (showRefreshSpinner) setRefreshing(true);
    if (!isRefresh) setLoading(true);
    if (shouldShowError) setError('');
    try {
      const payload = await userAdminApi.fetchPlatformOverview(120);
      setOverview(payload && typeof payload === 'object' ? payload : null);
    } catch (loadError) {
      if (shouldShowError) setError(loadError?.message || t('superAdminLogging.loadFailed'));
    } finally {
      if (!isRefresh) setLoading(false);
      if (showRefreshSpinner) setRefreshing(false);
    }
  }, [userAdminApi, t]);

  useEffect(() => {
    loadOverview(false);
  }, [loadOverview]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const intervalId = window.setInterval(() => {
      loadOverview(true, { showSpinner: false, showError: false });
    }, 10000);
    return () => window.clearInterval(intervalId);
  }, [loadOverview]);

  const handleDownloadRawLog = useCallback(async () => {
    if (!userAdminApi?.downloadPlatformRawLog) return;
    setDownloadingRawLog(true);
    setError('');
    try {
      const result = await userAdminApi.downloadPlatformRawLog();
      triggerBlobDownload(result.blob, result.fileName || 'smart-sauna-raw-log.log');
    } catch (downloadError) {
      setError(downloadError?.message || t('superAdminOverview.rawLog.downloadFailed'));
    } finally {
      setDownloadingRawLog(false);
    }
  }, [userAdminApi, t]);

  const totals = useMemo(
    () => (overview?.totals && typeof overview.totals === 'object' ? overview.totals : {}),
    [overview?.totals],
  );
  const recentLogs = useMemo(
    () => (Array.isArray(overview?.recentLogs) ? overview.recentLogs : []),
    [overview?.recentLogs],
  );
  const recentAppActions = useMemo(
    () => (Array.isArray(overview?.recentAppActions) ? overview.recentAppActions : []),
    [overview?.recentAppActions],
  );
  const recentLoginAttempts = useMemo(
    () => (Array.isArray(overview?.recentLoginAttempts) ? overview.recentLoginAttempts : []),
    [overview?.recentLoginAttempts],
  );
  const recentRawLogLines = useMemo(
    () => (Array.isArray(overview?.recentRawLogLines) ? overview.recentRawLogLines : []),
    [overview?.recentRawLogLines],
  );
  const rawLogMaxLines = Number(overview?.rawLogMaxLines || 2000);
  const failedLoginAttemptCount = useMemo(
    () => recentLoginAttempts.filter((attempt) => attempt?.status !== 'success').length,
    [recentLoginAttempts],
  );
  const generatedAt = overview?.generatedAt || null;

  const statCards = useMemo(() => ([
    {
      key: 'loginAttempts',
      icon: LogIn,
      label: t('superAdminOverview.stats.loginAttempts'),
      value: totals.loginAttempts || recentLoginAttempts.length || 0,
      hint: t('superAdminOverview.loginAttempts.live'),
      tone: failedLoginAttemptCount > 0 ? 'warn' : 'neutral',
    },
    {
      key: 'failedAttempts',
      icon: AlertTriangle,
      label: t('superAdminLogging.stats.failedAttempts'),
      value: failedLoginAttemptCount,
      hint: t('superAdminOverview.loginAttempts.status.failed'),
      tone: failedLoginAttemptCount > 0 ? 'danger' : 'neutral',
    },
    {
      key: 'rawLogLines',
      icon: Database,
      label: t('superAdminOverview.sections.rawLog'),
      value: totals.rawLogLines || recentRawLogLines.length || 0,
      hint: `${t('superAdminOverview.rawLog.maxLines')}: ${formatNumber(rawLogMaxLines)}`,
      tone: 'neutral',
    },
    {
      key: 'logs',
      icon: Server,
      label: t('superAdminOverview.stats.logs'),
      value: totals.logs || recentLogs.length || 0,
      hint: t('superAdminOverview.sections.logs'),
      tone: 'neutral',
    },
    {
      key: 'appActions',
      icon: Activity,
      label: t('superAdminOverview.stats.appActions'),
      value: totals.appActions || recentAppActions.length || 0,
      hint: t('superAdminOverview.sections.appActions'),
      tone: 'neutral',
    },
  ]), [
    failedLoginAttemptCount,
    rawLogMaxLines,
    recentAppActions.length,
    recentLoginAttempts.length,
    recentLogs.length,
    recentRawLogLines.length,
    t,
    totals,
  ]);

  return (
    <div className="page-transition flex flex-col gap-4 md:gap-6 font-sans" data-disable-pull-refresh="true">
      <section className="popup-surface rounded-3xl p-4 md:p-6 border border-[var(--glass-border)]">
        <div className={`flex ${isMobile ? 'flex-col gap-3' : 'items-start justify-between gap-4'}`}>
          <div>
            <p className="text-[10px] uppercase tracking-[0.22em] text-[var(--text-muted)]">
              {t('superAdminLogging.eyebrow')}
            </p>
            <h2 className="mt-2 text-lg md:text-xl font-semibold uppercase tracking-[0.14em] text-[var(--text-primary)]">
              {t('superAdminLogging.title')}
            </h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)] max-w-3xl">
              {t('superAdminLogging.subtitle')}
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
            {refreshing ? t('common.saving') : t('superAdminLogging.refresh')}
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
          <p className="text-sm text-[var(--text-secondary)]">{t('superAdminLogging.loading')}</p>
        </section>
      ) : (
        <>
          <section className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {statCards.map((card) => (
              <SummaryCard
                key={card.key}
                icon={card.icon}
                label={card.label}
                value={formatNumber(card.value)}
                hint={card.hint}
                tone={card.tone}
              />
            ))}
          </section>

          <section className="grid grid-cols-1 xl:grid-cols-[0.9fr_1.1fr] gap-4">
            <Panel title={t('superAdminOverview.sections.loginAttempts')} icon={LogIn}>
              <p className="mb-3 inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                {t('superAdminOverview.loginAttempts.live')}
              </p>

              {recentLoginAttempts.length === 0 ? (
                <p className="text-sm text-[var(--text-secondary)]">{t('superAdminOverview.loginAttempts.empty')}</p>
              ) : (
                <div className="space-y-2 max-h-[54vh] overflow-y-auto custom-scrollbar pr-1">
                  {recentLoginAttempts.map((attempt, index) => {
                    const statusKey = attempt?.status === 'success' || attempt?.status === 'blocked' ? attempt.status : 'failed';
                    return (
                      <div
                        key={attempt.id || attempt.requestId || `login-${index}`}
                        className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-3 py-2.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-[var(--text-primary)] truncate">
                              {attempt.username || '-'}
                            </p>
                            <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)] truncate">
                              {t('superAdminOverview.client.id')}: {attempt.clientId || '-'}
                            </p>
                          </div>
                          <span className={`shrink-0 px-2 py-1 rounded-full text-[10px] uppercase tracking-[0.14em] ${statusClass[statusKey]}`}>
                            {t(loginStatusLabelKeys[statusKey])}
                          </span>
                        </div>

                        <p className="mt-2 text-[11px] text-[var(--text-secondary)]">
                          {t('superAdminOverview.loginAttempts.reasonLabel')}: {formatLoginReason(attempt.reason, t)}
                        </p>
                        <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                          <div className="rounded-lg border border-[var(--glass-border)] bg-[var(--card-bg)] px-2 py-1.5">
                            <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--text-muted)]">{t('superAdminOverview.loginAttempts.ip')}</p>
                            <p className="text-[var(--text-primary)] truncate">{attempt.ipAddress || '-'}</p>
                          </div>
                          <div className="rounded-lg border border-[var(--glass-border)] bg-[var(--card-bg)] px-2 py-1.5">
                            <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--text-muted)]">{t('superAdminOverview.loginAttempts.device')}</p>
                            <p className="text-[var(--text-primary)] truncate">{attempt.deviceLabel || attempt.deviceType || '-'}</p>
                          </div>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10px] uppercase tracking-[0.12em] text-[var(--text-muted)]">
                          <span>{formatDateTime(attempt.createdAt, language)}</span>
                          <span>{t('superAdminOverview.loginAttempts.requestId')}: {attempt.requestId || '-'}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Panel>

            <Panel
              title={t('superAdminOverview.sections.rawLog')}
              action={(
                <button
                  type="button"
                  onClick={handleDownloadRawLog}
                  disabled={downloadingRawLog || !userAdminApi?.downloadPlatformRawLog}
                  className="shrink-0 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] text-[var(--text-primary)] text-[10px] font-bold uppercase tracking-[0.16em] hover:bg-[var(--glass-bg-hover)] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {downloadingRawLog ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                  {downloadingRawLog ? t('superAdminOverview.rawLog.downloading') : t('superAdminOverview.rawLog.download')}
                </button>
              )}
            >
              <p className="mb-3 text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
                {t('superAdminOverview.rawLog.maxLines')}: {formatNumber(totals.rawLogLines || recentRawLogLines.length || 0)} / {formatNumber(rawLogMaxLines)}
              </p>
              {recentRawLogLines.length === 0 ? (
                <p className="text-sm text-[var(--text-secondary)]">{t('superAdminOverview.rawLog.empty')}</p>
              ) : (
                <pre className="max-h-[54vh] overflow-auto custom-scrollbar rounded-xl border border-[var(--glass-border)] bg-black/30 p-3 text-[10px] leading-relaxed text-[var(--text-secondary)] whitespace-pre-wrap break-words">
                  {recentRawLogLines.join('\n')}
                </pre>
              )}
            </Panel>
          </section>

          <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <Panel title={t('superAdminOverview.sections.logs')} icon={Server}>
              {recentLogs.length === 0 ? (
                <p className="text-sm text-[var(--text-secondary)]">{t('superAdminOverview.logs.empty')}</p>
              ) : (
                <div className="space-y-2 max-h-[42vh] overflow-y-auto custom-scrollbar pr-1">
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
            </Panel>

            <Panel title={t('superAdminOverview.sections.appActions')} icon={Activity}>
              {recentAppActions.length === 0 ? (
                <p className="text-sm text-[var(--text-secondary)]">{t('superAdminOverview.appActions.empty')}</p>
              ) : (
                <div className="space-y-2 max-h-[42vh] overflow-y-auto custom-scrollbar pr-1">
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
            </Panel>
          </section>
        </>
      )}
    </div>
  );
}
