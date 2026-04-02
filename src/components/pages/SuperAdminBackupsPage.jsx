import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Archive,
  Check,
  Clock,
  Download,
  HardDrive,
  RefreshCw,
  Server,
  Trash2,
  AlertTriangle,
  Plus,
  Workflow,
  MapPin,
} from '../../icons';

const formatDateTime = (value, language) => {
  if (!value) return '-';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return '-';
  try {
    return dt.toLocaleString(language === 'en' ? 'en-US' : 'nb-NO', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return dt.toISOString();
  }
};

const formatBytes = (value) => {
  const size = Number(value || 0);
  if (!Number.isFinite(size) || size <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let unitIndex = 0;
  let current = size;
  while (current >= 1024 && unitIndex < units.length - 1) {
    current /= 1024;
    unitIndex += 1;
  }
  return `${current.toFixed(current >= 100 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
};

const triggerBlobDownload = (blob, fileName) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

function SummaryCard({ icon: Icon, label, value, tone = 'neutral', hint }) {
  const toneClass = tone === 'good'
    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
    : tone === 'warn'
      ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
      : 'border-[var(--glass-border)] bg-[var(--glass-bg)] text-[var(--text-primary)]';

  return (
    <div className={`rounded-2xl border px-4 py-3 ${toneClass}`}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10px] uppercase tracking-[0.18em] opacity-80">{label}</span>
        <Icon className="w-4 h-4 opacity-80" />
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
      <div className="mt-1 text-[10px] uppercase tracking-[0.12em] opacity-70">{hint}</div>
    </div>
  );
}

const getStatusClasses = (ready) => (
  ready
    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
    : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
);

export default function SuperAdminBackupsPage({
  t,
  language,
  userAdminApi,
  isMobile,
}) {
  const [overview, setOverview] = useState(null);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [selectedLocationId, setSelectedLocationId] = useState('');
  const [locationFiles, setLocationFiles] = useState(null);
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [actionMessage, setActionMessage] = useState('');
  const [error, setError] = useState('');
  const [busyFileName, setBusyFileName] = useState('');
  const [provisioning, setProvisioning] = useState(false);

  const loadOverview = useCallback(async (isRefresh = false) => {
    if (!userAdminApi?.fetchClientBackupOverview) {
      setError(t('superAdminBackups.loadFailed'));
      setLoadingOverview(false);
      return null;
    }

    if (isRefresh) setRefreshing(true);
    else setLoadingOverview(true);
    setError('');

    try {
      const payload = await userAdminApi.fetchClientBackupOverview();
      setOverview(payload);
      return payload;
    } catch (loadError) {
      setError(loadError?.message || t('superAdminBackups.loadFailed'));
      return null;
    } finally {
      setLoadingOverview(false);
      setRefreshing(false);
    }
  }, [userAdminApi, t]);

  const loadLocationFiles = useCallback(async (clientId, locationId) => {
    const normalizedClientId = String(clientId || '').trim();
    const normalizedLocationId = String(locationId || '').trim();
    if (!normalizedClientId || !normalizedLocationId || !userAdminApi?.fetchClientBackupFiles) {
      setLocationFiles(null);
      return;
    }

    setLoadingFiles(true);
    setError('');
    try {
      const payload = await userAdminApi.fetchClientBackupFiles(normalizedClientId, normalizedLocationId);
      setLocationFiles(payload);
    } catch (loadError) {
      setLocationFiles(null);
      setError(loadError?.message || t('superAdminBackups.loadFailed'));
    } finally {
      setLoadingFiles(false);
    }
  }, [userAdminApi, t]);

  useEffect(() => {
    void loadOverview(false);
  }, [loadOverview]);

  const clients = useMemo(
    () => (Array.isArray(overview?.clients) ? overview.clients : []),
    [overview?.clients],
  );

  useEffect(() => {
    if (!clients.length) {
      setSelectedClientId('');
      setLocationFiles(null);
      return;
    }
    if (clients.some((client) => client.id === selectedClientId)) return;
    setSelectedClientId(clients[0].id);
  }, [clients, selectedClientId]);

  const selectedClientSummary = useMemo(
    () => clients.find((client) => client.id === selectedClientId) || null,
    [clients, selectedClientId],
  );

  const locations = useMemo(
    () => (Array.isArray(selectedClientSummary?.locations) ? selectedClientSummary.locations : []),
    [selectedClientSummary?.locations],
  );

  useEffect(() => {
    if (!selectedClientSummary) {
      setSelectedLocationId('');
      setLocationFiles(null);
      return;
    }

    if (!locations.length) {
      setSelectedLocationId('');
      setLocationFiles(null);
      return;
    }

    const nextLocationId = locations.some((location) => location.id === selectedLocationId)
      ? selectedLocationId
      : locations[0].id;

    if (nextLocationId !== selectedLocationId) {
      setSelectedLocationId(nextLocationId);
      return;
    }

    void loadLocationFiles(selectedClientSummary.id, nextLocationId);
  }, [selectedClientSummary, locations, selectedLocationId, loadLocationFiles]);

  const selectedLocationSummary = useMemo(
    () => locations.find((location) => location.id === selectedLocationId) || null,
    [locations, selectedLocationId],
  );

  const totals = overview?.totals && typeof overview.totals === 'object' ? overview.totals : {};
  const files = Array.isArray(locationFiles?.files) ? locationFiles.files : [];
  const selectedDirectoryExists = Boolean(
    locationFiles?.directory?.exists
    ?? selectedLocationSummary?.backupDirectoryExists
    ?? false,
  );
  const selectedLocationLabel = locationFiles?.location?.name || selectedLocationSummary?.name || '-';
  const selectedLocationCode = locationFiles?.location?.id || selectedLocationSummary?.id || '';
  const selectedPath = locationFiles?.directory?.path || selectedLocationSummary?.backupDirectoryPath || '-';

  const handleRefresh = useCallback(async () => {
    const payload = await loadOverview(true);
    const nextClientId = selectedClientId || payload?.clients?.[0]?.id || '';
    const nextClient = Array.isArray(payload?.clients)
      ? payload.clients.find((client) => client.id === nextClientId) || payload.clients[0]
      : null;
    const nextLocationId = nextClient?.locations?.some((location) => location.id === selectedLocationId)
      ? selectedLocationId
      : nextClient?.locations?.[0]?.id || '';

    if (nextClient?.id && nextLocationId) {
      await loadLocationFiles(nextClient.id, nextLocationId);
    }
  }, [loadOverview, loadLocationFiles, selectedClientId, selectedLocationId]);

  const handleProvisionDirectory = useCallback(async () => {
    if (!selectedClientId || !selectedLocationId || !userAdminApi?.provisionClientBackupDirectory) return;
    setProvisioning(true);
    setActionMessage('');
    setError('');
    try {
      await userAdminApi.provisionClientBackupDirectory(selectedClientId, selectedLocationId);
      setActionMessage(t('superAdminBackups.provisionSuccess'));
      await loadOverview(true);
      await loadLocationFiles(selectedClientId, selectedLocationId);
    } catch (provisionError) {
      setError(provisionError?.message || t('superAdminBackups.provisionFailed'));
    } finally {
      setProvisioning(false);
    }
  }, [selectedClientId, selectedLocationId, userAdminApi, t, loadOverview, loadLocationFiles]);

  const handleDownload = useCallback(async (fileName) => {
    if (!selectedClientId || !selectedLocationId || !fileName || !userAdminApi?.downloadClientBackupFile) return;
    setBusyFileName(fileName);
    setActionMessage('');
    setError('');
    try {
      const result = await userAdminApi.downloadClientBackupFile(selectedClientId, fileName, selectedLocationId);
      triggerBlobDownload(result.blob, result.fileName || fileName);
      setActionMessage(t('superAdminBackups.downloadStarted'));
    } catch (downloadError) {
      setError(downloadError?.message || t('superAdminBackups.downloadFailed'));
    } finally {
      setBusyFileName('');
    }
  }, [selectedClientId, selectedLocationId, userAdminApi, t]);

  const handleDelete = useCallback(async (fileName) => {
    if (!selectedClientId || !selectedLocationId || !fileName || !userAdminApi?.deleteClientBackupFile) return;
    const confirmText = String(t('superAdminBackups.deleteConfirm') || '').replace('{{fileName}}', fileName);
    const confirmed = window.confirm(confirmText);
    if (!confirmed) return;

    setBusyFileName(fileName);
    setActionMessage('');
    setError('');
    try {
      await userAdminApi.deleteClientBackupFile(selectedClientId, fileName, selectedLocationId);
      setActionMessage(t('superAdminBackups.deleteSuccess'));
      await loadOverview(true);
      await loadLocationFiles(selectedClientId, selectedLocationId);
    } catch (deleteError) {
      setError(deleteError?.message || t('superAdminBackups.deleteFailed'));
    } finally {
      setBusyFileName('');
    }
  }, [selectedClientId, selectedLocationId, userAdminApi, t, loadOverview, loadLocationFiles]);

  return (
    <div className="page-transition flex flex-col gap-4 md:gap-6 font-sans" data-disable-pull-refresh="true">
      <section className="popup-surface rounded-3xl p-4 md:p-6 border border-[var(--glass-border)]">
        <div className={`flex ${isMobile ? 'flex-col gap-4' : 'items-start justify-between gap-6'}`}>
          <div className="max-w-3xl">
            <p className="text-[10px] uppercase tracking-[0.22em] text-[var(--text-muted)]">
              {t('superAdminBackups.eyebrow')}
            </p>
            <h2 className="mt-2 text-lg md:text-xl font-semibold uppercase tracking-[0.14em] text-[var(--text-primary)]">
              {t('superAdminBackups.title')}
            </h2>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              {t('superAdminBackups.subtitle')}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={loadingOverview || refreshing}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] text-[var(--text-primary)] text-xs font-bold uppercase tracking-[0.18em] hover:bg-[var(--glass-bg-hover)] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? t('common.saving') : t('superAdminBackups.refresh')}
            </button>
          </div>
        </div>
      </section>

      {error && (
        <section className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </section>
      )}

      {actionMessage && !error && (
        <section className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {actionMessage}
        </section>
      )}

      <section className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <SummaryCard
          icon={Server}
          label={t('superAdminBackups.stats.clients')}
          value={String(Number(totals.clients || 0))}
          hint={t('superAdminBackups.stats.clientsHint')}
        />
        <SummaryCard
          icon={Workflow}
          label={t('superAdminBackups.stats.locations')}
          value={String(Number(totals.locations || 0))}
          hint={t('superAdminBackups.stats.locationsHint')}
        />
        <SummaryCard
          icon={Check}
          label={t('superAdminBackups.stats.ready')}
          value={String(Number(totals.readyDirectories || 0))}
          tone={Number(totals.missingDirectories || 0) > 0 ? 'warn' : 'good'}
          hint={t('superAdminBackups.stats.readyHint')}
        />
        <SummaryCard
          icon={Archive}
          label={t('superAdminBackups.stats.files')}
          value={String(Number(totals.backupFiles || 0))}
          hint={t('superAdminBackups.stats.filesHint')}
        />
        <SummaryCard
          icon={HardDrive}
          label={t('superAdminBackups.stats.storage')}
          value={formatBytes(totals.totalBackupBytes || 0)}
          hint={t('superAdminBackups.stats.storageHint')}
        />
      </section>

      {loadingOverview ? (
        <section className="popup-surface rounded-3xl p-6 border border-[var(--glass-border)]">
          <p className="text-sm text-[var(--text-secondary)]">{t('superAdminBackups.loading')}</p>
        </section>
      ) : (
        <section className="grid grid-cols-1 xl:grid-cols-[0.72fr_1.28fr] gap-4 items-start">
          <aside className="popup-surface rounded-3xl p-4 md:p-5 border border-[var(--glass-border)]">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <p className="text-xs md:text-sm font-bold uppercase tracking-[0.2em] text-[var(--text-secondary)]">
                  {t('superAdminBackups.clientsTitle')}
                </p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  {t('superAdminBackups.clientsSubtitle')}
                </p>
              </div>
              <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
                {clients.length}
              </span>
            </div>

            {clients.length === 0 ? (
              <p className="text-sm text-[var(--text-secondary)]">{t('superAdminBackups.emptyClients')}</p>
            ) : (
              <div className="space-y-2 max-h-[65vh] overflow-y-auto custom-scrollbar pr-1">
                {clients.map((client) => {
                  const isActive = client.id === selectedClientId;
                  const hasMissingLocations = Number(client.missingLocationCount || 0) > 0;
                  return (
                    <button
                      key={client.id}
                      type="button"
                      onClick={() => setSelectedClientId(client.id)}
                      className={`w-full text-left rounded-2xl border px-4 py-3 transition-colors ${
                        isActive
                          ? 'border-[var(--accent-color)] bg-[color-mix(in_srgb,var(--accent-color)_16%,transparent)]'
                          : 'border-[var(--glass-border)] bg-[var(--glass-bg)] hover:bg-[var(--glass-bg-hover)]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
                            {client.name || client.id}
                          </p>
                          <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)] truncate">
                            {client.id}
                          </p>
                        </div>
                        <span className={`px-2 py-1 rounded-full text-[10px] uppercase tracking-[0.14em] border ${getStatusClasses(!hasMissingLocations)}`}>
                          {hasMissingLocations ? t('superAdminBackups.directoryMissing') : t('superAdminBackups.directoryReady')}
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-[var(--text-secondary)]">
                        <span>{t('superAdminBackups.stats.locations')}: {client.locationCount || 0}</span>
                        <span>{t('superAdminBackups.fileCount')}: {client.backupFileCount || 0}</span>
                        <span>{formatBytes(client.totalBackupBytes || 0)}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </aside>

          <div className="flex flex-col gap-4">
            <section className="popup-surface rounded-3xl p-4 md:p-5 border border-[var(--glass-border)]">
              {selectedClientSummary ? (
                <>
                  <div className={`flex ${isMobile ? 'flex-col gap-3' : 'items-start justify-between gap-4'}`}>
                    <div className="max-w-3xl">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">
                        {t('superAdminBackups.selectedClient')}
                      </p>
                      <h3 className="mt-1 text-base md:text-lg font-semibold text-[var(--text-primary)]">
                        {selectedClientSummary.name || selectedClientSummary.id}
                      </h3>
                      <p className="mt-2 text-sm text-[var(--text-secondary)]">
                        {t('superAdminBackups.selectedLocation')}: <span className="text-[var(--text-primary)]">{selectedLocationLabel}</span>
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {!selectedDirectoryExists && selectedLocationId && (
                        <button
                          type="button"
                          onClick={handleProvisionDirectory}
                          disabled={provisioning}
                          className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-200 text-xs font-bold uppercase tracking-[0.16em] hover:bg-emerald-500/15 transition-colors disabled:opacity-60"
                        >
                          <Plus className="w-4 h-4" />
                          {provisioning ? t('common.saving') : t('superAdminBackups.provisionButton')}
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="mt-5 rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-4 py-4">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-[var(--text-muted)]" />
                      <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">
                        {t('superAdminBackups.locationsTitle')}
                      </p>
                    </div>
                    <p className="mt-2 text-xs text-[var(--text-secondary)]">
                      {t('superAdminBackups.locationsSubtitle')}
                    </p>

                    {!locations.length ? (
                      <p className="mt-3 text-sm text-[var(--text-secondary)]">{t('superAdminBackups.emptyLocations')}</p>
                    ) : (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {locations.map((location) => {
                          const isActive = location.id === selectedLocationId;
                          return (
                            <button
                              key={location.id}
                              type="button"
                              onClick={() => setSelectedLocationId(location.id)}
                              className={`rounded-2xl border px-3 py-2 text-left transition-colors ${
                                isActive
                                  ? 'border-[var(--accent-color)] bg-[color-mix(in_srgb,var(--accent-color)_16%,transparent)]'
                                  : 'border-[var(--glass-border)] bg-[var(--glass-bg)] hover:bg-[var(--glass-bg-hover)]'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold text-[var(--text-primary)]">{location.name || location.id}</span>
                                <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase tracking-[0.14em] border ${getStatusClasses(location.backupDirectoryExists)}`}>
                                  {location.backupDirectoryExists ? t('superAdminBackups.directoryReady') : t('superAdminBackups.directoryMissing')}
                                </span>
                              </div>
                              <div className="mt-1 text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
                                {location.id}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                    <div className="rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-4 py-3">
                      <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">{t('superAdminBackups.remotePathLabel')}</p>
                      <p className="mt-2 text-sm font-medium text-[var(--text-primary)] break-all">{selectedPath}</p>
                    </div>
                    <div className="rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-4 py-3">
                      <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">{t('superAdminBackups.locationIdLabel')}</p>
                      <p className="mt-2 text-sm font-medium text-[var(--text-primary)]">{selectedLocationCode || '-'}</p>
                    </div>
                    <div className="rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-4 py-3">
                      <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">{t('superAdminBackups.fileCount')}</p>
                      <p className="mt-2 text-xl font-semibold text-[var(--text-primary)]">{locationFiles?.summary?.fileCount || 0}</p>
                    </div>
                    <div className="rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-4 py-3">
                      <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">{t('superAdminBackups.totalSize')}</p>
                      <p className="mt-2 text-xl font-semibold text-[var(--text-primary)]">{formatBytes(locationFiles?.summary?.totalBytes || 0)}</p>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-4 py-3">
                      <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">{t('superAdminBackups.lastBackup')}</p>
                      <p className="mt-2 text-sm font-medium text-[var(--text-primary)]">{formatDateTime(locationFiles?.summary?.latestBackupAt, language)}</p>
                    </div>
                    <div className="rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-4 py-3">
                      <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">{t('superAdminBackups.clientPathLabel')}</p>
                      <p className="mt-2 text-sm font-medium text-[var(--text-primary)] break-all">{locationFiles?.directory?.clientPath || '-'}</p>
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-sm text-[var(--text-secondary)]">{t('superAdminBackups.emptyClients')}</p>
              )}
            </section>

            <section className="popup-surface rounded-3xl p-4 md:p-5 border border-[var(--glass-border)]">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div>
                  <h3 className="text-xs md:text-sm font-bold uppercase tracking-[0.2em] text-[var(--text-secondary)]">
                    {t('superAdminBackups.filesTitle')}
                  </h3>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    {t('superAdminBackups.filesSubtitle')}
                  </p>
                </div>
                <Archive className="w-4 h-4 text-[var(--text-muted)]" />
              </div>

              {loadingFiles ? (
                <p className="text-sm text-[var(--text-secondary)]">{t('superAdminBackups.loadingFiles')}</p>
              ) : !selectedLocationId ? (
                <div className="rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-4 py-6">
                  <p className="text-sm text-[var(--text-secondary)]">{t('superAdminBackups.emptyLocations')}</p>
                </div>
              ) : !selectedDirectoryExists ? (
                <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-300 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-amber-100">{t('superAdminBackups.directoryMissing')}</p>
                      <p className="mt-1 text-sm text-amber-200/90">{t('superAdminBackups.directoryMissingHelp')}</p>
                    </div>
                  </div>
                </div>
              ) : files.length === 0 ? (
                <div className="rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-4 py-6">
                  <p className="text-sm text-[var(--text-secondary)]">{t('superAdminBackups.emptyFiles')}</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[62vh] overflow-y-auto custom-scrollbar pr-1">
                  {files.map((file) => {
                    const isBusy = busyFileName === file.name;
                    return (
                      <article
                        key={file.name}
                        className="rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-4 py-3"
                      >
                        <div className={`flex ${isMobile ? 'flex-col gap-3' : 'items-start justify-between gap-4'}`}>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
                              {file.name}
                            </p>
                            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-[var(--text-secondary)]">
                              <span className="inline-flex items-center gap-1">
                                <HardDrive className="w-3.5 h-3.5" />
                                {formatBytes(file.sizeBytes)}
                              </span>
                              <span className="inline-flex items-center gap-1">
                                <Clock className="w-3.5 h-3.5" />
                                {formatDateTime(file.modifiedAt, language)}
                              </span>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleDownload(file.name)}
                              disabled={isBusy}
                              className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] text-[var(--text-primary)] text-xs font-bold uppercase tracking-[0.14em] hover:bg-[var(--glass-bg-hover)] transition-colors disabled:opacity-60"
                            >
                              <Download className="w-4 h-4" />
                              {t('superAdminBackups.download')}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(file.name)}
                              disabled={isBusy}
                              className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-red-500/25 bg-red-500/10 text-red-200 text-xs font-bold uppercase tracking-[0.14em] hover:bg-red-500/15 transition-colors disabled:opacity-60"
                            >
                              <Trash2 className="w-4 h-4" />
                              {t('superAdminBackups.delete')}
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        </section>
      )}
    </div>
  );
}
