import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Check,
  ChevronDown,
  Database,
  Download,
  Globe,
  HardDrive,
  Link,
  MapPin,
  Monitor,
  Plus,
  RefreshCw,
  Router,
  Server,
  Shield,
  Wifi,
} from '../../icons';

const NEW_LOCATION_KEY = '__new__';

const triggerBlobDownload = (blob, fileName) => {
  const url = globalThis.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => globalThis.URL.revokeObjectURL(url), 1000);
};

const buildEmptyForm = (clientId = '') => ({
  clientId,
  locationId: '',
  displayName: '',
  backupLocationId: '',
  lanSubnet: '',
  routerIp: '',
  haIp: '',
  tunnelIp: '',
  domainLabel: '',
  domainFqdn: '',
});

const pickSiteFormState = (site) => ({
  clientId: String(site?.clientId || '').trim(),
  locationId: String(site?.locationId || '').trim(),
  displayName: String(site?.displayName || site?.name || '').trim(),
  backupLocationId: String(site?.backupLocationId || '').trim(),
  lanSubnet: String(site?.lanSubnet || '').trim(),
  routerIp: String(site?.routerIp || '').trim(),
  haIp: String(site?.haIp || '').trim(),
  tunnelIp: String(site?.tunnelIp || '').trim(),
  domainLabel: String(site?.domainLabel || '').trim(),
  domainFqdn: String(site?.domainFqdn || '').trim(),
});

const textInputClass = 'w-full rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-color)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--accent-color)_22%,transparent)] transition-colors';
const fieldLabelClass = 'text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]';

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

function SummaryCard({ icon: Icon, label, value, hint, tone = 'neutral' }) {
  const toneClass = tone === 'good'
    ? 'border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-text)]'
    : 'border-[var(--glass-border)] bg-[var(--glass-bg)] text-[var(--text-primary)]';
  return (
    <div className={`rounded-2xl border px-4 py-3 ${toneClass}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="text-[10px] uppercase tracking-[0.18em] opacity-75">{label}</span>
          <div className="mt-2 flex items-end gap-2">
            <span className="text-[28px] leading-none font-semibold tracking-tight">{value}</span>
          </div>
          {hint ? <div className="mt-2 text-[11px] opacity-70">{hint}</div> : null}
        </div>
        <div className="rounded-2xl border border-current/10 bg-black/5 p-2">
          <Icon className="w-4 h-4 opacity-75" />
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ ready, readyLabel, pendingLabel }) {
  return (
    <span
      className={`px-2 py-1 rounded-full text-[10px] uppercase tracking-[0.14em] border ${
        ready
          ? 'border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-text)]'
          : 'border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[var(--status-warning-text)]'
      }`}
    >
      {ready ? readyLabel : pendingLabel}
    </span>
  );
}

function InfoField({ label, value, accent = false }) {
  return (
    <div className={`rounded-2xl border px-4 py-3 ${accent ? 'border-[var(--status-success-border)] bg-[var(--status-success-bg)]' : 'border-[var(--glass-border)] bg-[var(--glass-bg)]'}`}>
      <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">{label}</p>
      <p className="mt-2 text-sm font-medium text-[var(--text-primary)] break-all">{value || '-'}</p>
    </div>
  );
}

function PreviewPanel({ title, subtitle, value, emptyLabel, tone = 'neutral' }) {
  const borderTone = tone === 'warn'
    ? 'border-[var(--status-warning-border)] bg-[var(--status-warning-bg)]'
    : 'border-[var(--glass-border)] bg-[var(--glass-bg)]';

  return (
    <div className={`rounded-2xl border ${borderTone} px-4 py-4`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">{title}</p>
          {subtitle ? <p className="mt-1 text-xs text-[var(--text-secondary)]">{subtitle}</p> : null}
        </div>
      </div>
      <textarea
        readOnly
        value={value || emptyLabel}
        className="mt-3 min-h-[170px] w-full resize-y rounded-2xl border border-[var(--glass-border)] bg-[color-mix(in_srgb,var(--bg-primary)_72%,transparent)] px-4 py-3 text-xs leading-6 text-[var(--text-primary)] outline-none"
      />
    </div>
  );
}

function WorkflowChip({ step, label }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg)] px-3 py-1.5 text-[11px] text-[var(--text-secondary)]">
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--accent-color)_18%,transparent)] text-[10px] font-semibold text-[var(--text-primary)]">
        {step}
      </span>
      <span>{label}</span>
    </div>
  );
}

function TopologyNode({ icon: Icon, title, primary, secondary, status, ready = false, accent = false }) {
  const toneClass = ready
    ? 'border-[var(--status-success-border)] bg-[color-mix(in_srgb,var(--status-success-bg)_82%,transparent)]'
    : 'border-[var(--glass-border)] bg-[var(--glass-bg)]';

  return (
    <div className={`relative min-w-0 rounded-3xl border px-4 py-4 ${toneClass}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">{title}</p>
          <p className="mt-2 text-sm font-semibold text-[var(--text-primary)] break-all">{primary || '-'}</p>
          {secondary ? (
            <p className="mt-1 text-xs text-[var(--text-secondary)] break-all">{secondary}</p>
          ) : null}
        </div>
        <div className={`rounded-2xl border p-2 ${accent ? 'border-[var(--accent-color)]/20 bg-[color-mix(in_srgb,var(--accent-color)_14%,transparent)]' : 'border-current/10 bg-black/5'}`}>
          <Icon className="h-4 w-4 text-[var(--text-primary)] opacity-80" />
        </div>
      </div>

      <div className="mt-4">
        <StatusBadge
          ready={ready}
          readyLabel={status}
          pendingLabel={status}
        />
      </div>
    </div>
  );
}

function TopologyConnector({ label, active = false }) {
  return (
    <div className="hidden xl:flex min-w-[72px] flex-col items-center justify-center gap-2 px-1">
      <div className={`h-px w-full ${active ? 'bg-[var(--status-success-border)]' : 'bg-[var(--glass-border)]'}`} />
      <span className="text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">{label}</span>
    </div>
  );
}

export default function SuperAdminNetworkPage({
  t,
  language,
  userAdminApi,
  isMobile,
}) {
  const [overview, setOverview] = useState(null);
  const [detail, setDetail] = useState(null);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [selectedLocationId, setSelectedLocationId] = useState('');
  const [formState, setFormState] = useState(() => buildEmptyForm(''));
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [applyingTarget, setApplyingTarget] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [showAdvancedFields, setShowAdvancedFields] = useState(false);
  const [showInspector, setShowInspector] = useState(false);
  const [inspectorTab, setInspectorTab] = useState('preview');
  const [error, setError] = useState('');
  const [actionMessage, setActionMessage] = useState('');

  const loadOverview = useCallback(async (isRefresh = false) => {
    if (!userAdminApi?.fetchNetworkOverview) {
      setError(t('superAdminNetwork.loadFailed'));
      setLoadingOverview(false);
      return null;
    }

    if (isRefresh) setRefreshing(true);
    else setLoadingOverview(true);
    setError('');

    try {
      const payload = await userAdminApi.fetchNetworkOverview();
      setOverview(payload);
      return payload;
    } catch (loadError) {
      setError(loadError?.message || t('superAdminNetwork.loadFailed'));
      return null;
    } finally {
      setLoadingOverview(false);
      setRefreshing(false);
    }
  }, [userAdminApi, t]);

  const loadDetail = useCallback(async (clientId, locationId) => {
    if (!clientId || !locationId || locationId === NEW_LOCATION_KEY) {
      setDetail(null);
      return null;
    }
    if (!userAdminApi?.fetchNetworkSite) {
      setError(t('superAdminNetwork.detailLoadFailed'));
      return null;
    }

    setLoadingDetail(true);
    setError('');
    try {
      const payload = await userAdminApi.fetchNetworkSite(clientId, locationId);
      setDetail(payload);
      setFormState(pickSiteFormState(payload?.site));
      return payload;
    } catch (loadError) {
      setDetail(null);
      setError(loadError?.message || t('superAdminNetwork.detailLoadFailed'));
      return null;
    } finally {
      setLoadingDetail(false);
    }
  }, [userAdminApi, t]);

  useEffect(() => {
    void loadOverview(false);
  }, [loadOverview]);

  const clients = useMemo(
    () => (Array.isArray(overview?.clients) ? overview.clients : []),
    [overview?.clients],
  );
  const totals = useMemo(() => ({
    clients: Number(overview?.totals?.clients || 0),
    locations: Number(overview?.totals?.locations || 0),
    appliedWireGuard: Number(overview?.totals?.appliedWireGuard || 0),
    appliedCaddy: Number(overview?.totals?.appliedCaddy || 0),
    activePeers: Number(overview?.files?.wireGuard?.peerCount || 0),
    activeSites: Number(overview?.files?.caddy?.siteCount || 0),
  }), [overview]);

  useEffect(() => {
    if (!clients.length) {
      setSelectedClientId('');
      setSelectedLocationId('');
      setDetail(null);
      setFormState(buildEmptyForm(''));
      return;
    }
    if (clients.some((client) => client.id === selectedClientId)) return;
    setSelectedClientId(clients[0].id);
  }, [clients, selectedClientId]);

  const selectedClient = useMemo(
    () => clients.find((client) => client.id === selectedClientId) || null,
    [clients, selectedClientId],
  );
  const locations = useMemo(
    () => (Array.isArray(selectedClient?.locations) ? selectedClient.locations : []),
    [selectedClient?.locations],
  );

  useEffect(() => {
    if (!selectedClient) {
      setSelectedLocationId('');
      return;
    }
    if (!locations.length) {
      setSelectedLocationId(NEW_LOCATION_KEY);
      setDetail(null);
      setFormState(buildEmptyForm(selectedClient.id));
      return;
    }
    if (selectedLocationId === NEW_LOCATION_KEY) return;
    if (locations.some((location) => location.locationId === selectedLocationId)) return;
    setSelectedLocationId(locations[0].locationId);
  }, [selectedClient, locations, selectedLocationId]);

  useEffect(() => {
    if (!selectedClient) return;
    if (selectedLocationId === NEW_LOCATION_KEY) {
      setDetail(null);
      setFormState(buildEmptyForm(selectedClient.id));
      return;
    }
    if (!selectedLocationId) return;
    void loadDetail(selectedClient.id, selectedLocationId);
  }, [selectedClient, selectedLocationId, loadDetail]);

  const selectedLocationSummary = useMemo(
    () => locations.find((location) => location.locationId === selectedLocationId) || null,
    [locations, selectedLocationId],
  );
  const isNewLocation = selectedLocationId === NEW_LOCATION_KEY;
  const selectedLocationName = isNewLocation
    ? t('superAdminNetwork.newLocation')
    : (detail?.site?.displayName || selectedLocationSummary?.displayName || '-');
  const wireGuardApplied = Boolean(detail?.site?.runtime?.wireGuardApplied);
  const caddyApplied = Boolean(detail?.site?.runtime?.caddyApplied);
  const hasPublishedConfig = wireGuardApplied || caddyApplied;

  const domainSuffix = String(overview?.server?.domainSuffix || '').trim();
  const domainFqdnPreview = useMemo(() => {
    const direct = String(formState.domainFqdn || '').trim().toLowerCase();
    if (direct) return direct;
    const label = String(formState.domainLabel || '').trim().toLowerCase();
    if (!label || !domainSuffix) return '';
    return `${label}.${domainSuffix}`;
  }, [formState.domainFqdn, formState.domainLabel, domainSuffix]);

  const wireGuardPeerPreview = useMemo(() => {
    const displayName = formState.displayName || formState.locationId || t('superAdminNetwork.preview.unnamed');
    const publicKey = detail?.site?.wireGuardPublicKey || t('superAdminNetwork.preview.generatedOnSave');
    const tunnelIpPart = formState.tunnelIp ? `${formState.tunnelIp}/32` : '<tunnel-ip>/32';
    const subnetPart = formState.lanSubnet || '<lan-subnet>';
    return `# ${displayName}
[Peer]
# ${displayName}
PublicKey = ${publicKey}
AllowedIPs = ${tunnelIpPart}, ${subnetPart}`;
  }, [detail?.site?.wireGuardPublicKey, formState.displayName, formState.locationId, formState.tunnelIp, formState.lanSubnet, t]);

  const caddyPreview = useMemo(() => {
    const fqdn = domainFqdnPreview || '<subdomain>.smarti.dev';
    const haIp = formState.haIp || '<ha-ip>';
    return `${fqdn} {
    encode gzip
    reverse_proxy ${haIp}:8123
}`;
  }, [domainFqdnPreview, formState.haIp]);

  const backupPathPreview = useMemo(() => {
    const root = String(overview?.server?.backupRoot || '').replace(/\/$/, '');
    const clientId = String(formState.clientId || selectedClientId || '').trim();
    const backupLocationId = String(formState.backupLocationId || formState.locationId || '').trim();
    if (!root || !clientId || !backupLocationId) return '-';
    return `${root}/${clientId}/${backupLocationId}`;
  }, [overview?.server?.backupRoot, formState.clientId, formState.backupLocationId, formState.locationId, selectedClientId]);
  const routerConfigured = Boolean(formState.routerIp && formState.lanSubnet);
  const haConfigured = Boolean(formState.haIp);
  const tunnelConfigured = Boolean(formState.tunnelIp);
  const domainConfigured = Boolean(domainFqdnPreview);
  const backupConfigured = backupPathPreview !== '-';

  useEffect(() => {
    setShowAdvancedFields(false);
    setShowInspector(false);
    setInspectorTab('preview');
  }, [selectedClientId, selectedLocationId]);

  const handleRefresh = useCallback(async () => {
    const payload = await loadOverview(true);
    if (!payload) return;
    if (selectedClientId && selectedLocationId && selectedLocationId !== NEW_LOCATION_KEY) {
      await loadDetail(selectedClientId, selectedLocationId);
    }
  }, [loadOverview, loadDetail, selectedClientId, selectedLocationId]);

  const updateField = useCallback((key, value) => {
    setFormState((prev) => ({
      ...prev,
      [key]: value,
    }));
  }, []);

  const handleNewLocation = useCallback(() => {
    if (!selectedClientId) return;
    setSelectedLocationId(NEW_LOCATION_KEY);
    setDetail(null);
    setActionMessage('');
    setError('');
    setFormState(buildEmptyForm(selectedClientId));
  }, [selectedClientId]);

  const handleSave = useCallback(async () => {
    if (!userAdminApi?.saveNetworkSite) return;
    setSaving(true);
    setActionMessage('');
    setError('');
    try {
      const payload = await userAdminApi.saveNetworkSite({
        ...formState,
        clientId: selectedClientId || formState.clientId,
        locationId: formState.locationId,
        domainFqdn: formState.domainFqdn || domainFqdnPreview,
      });
      setDetail(payload);
      setFormState(pickSiteFormState(payload?.site));
      setSelectedClientId(payload?.site?.clientId || selectedClientId);
      setSelectedLocationId(payload?.site?.locationId || formState.locationId);
      setActionMessage(t('superAdminNetwork.saveSuccess'));
      await loadOverview(true);
    } catch (saveError) {
      setError(saveError?.message || t('superAdminNetwork.saveFailed'));
    } finally {
      setSaving(false);
    }
  }, [userAdminApi, formState, selectedClientId, domainFqdnPreview, t, loadOverview]);

  const handleApply = useCallback(async (target) => {
    if (!userAdminApi?.applyNetworkSite || !formState.locationId || !selectedClientId) return;
    setApplyingTarget(target);
    setActionMessage('');
    setError('');
    try {
      const payload = await userAdminApi.applyNetworkSite(selectedClientId, formState.locationId, target);
      setDetail((prev) => ({
        ...(prev || {}),
        ...payload,
      }));
      setActionMessage(
        payload?.result?.manualReloadRequired?.length
          ? `${t('superAdminNetwork.applySuccess')} ${t('superAdminNetwork.manualReload')}: ${payload.result.manualReloadRequired.join(', ')}`
          : t('superAdminNetwork.applySuccess'),
      );
      await loadOverview(true);
      await loadDetail(selectedClientId, formState.locationId);
    } catch (applyError) {
      setError(applyError?.message || t('superAdminNetwork.applyFailed'));
    } finally {
      setApplyingTarget('');
    }
  }, [userAdminApi, formState.locationId, selectedClientId, t, loadOverview, loadDetail]);

  const handleDownloadUmr = useCallback(async () => {
    if (!userAdminApi?.downloadNetworkUmrConfig || !selectedClientId || !formState.locationId) return;
    setDownloading(true);
    setActionMessage('');
    setError('');
    try {
      const result = await userAdminApi.downloadNetworkUmrConfig(selectedClientId, formState.locationId);
      triggerBlobDownload(result.blob, result.fileName);
      setActionMessage(t('superAdminNetwork.downloadStarted'));
    } catch (downloadError) {
      setError(downloadError?.message || t('superAdminNetwork.downloadFailed'));
    } finally {
      setDownloading(false);
    }
  }, [userAdminApi, selectedClientId, formState.locationId, t]);

  return (
    <div className="page-transition flex flex-col gap-4 md:gap-6 font-sans" data-disable-pull-refresh="true">
      <section className="popup-surface rounded-3xl p-4 md:p-6 border border-[var(--glass-border)]">
        <div className={`flex ${isMobile ? 'flex-col gap-4' : 'items-start justify-between gap-6'}`}>
          <div className="max-w-3xl">
            <p className="text-[10px] uppercase tracking-[0.22em] text-[var(--text-muted)]">
              {t('superAdminNetwork.eyebrow')}
            </p>
            <h2 className="mt-2 text-lg md:text-xl font-semibold uppercase tracking-[0.14em] text-[var(--text-primary)]">
              {t('superAdminNetwork.title')}
            </h2>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              {t('superAdminNetwork.subtitle')}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <WorkflowChip step="1" label={t('superAdminNetwork.workflow.chooseClient')} />
              <WorkflowChip step="2" label={t('superAdminNetwork.workflow.fillBasics')} />
              <WorkflowChip step="3" label={t('superAdminNetwork.workflow.publish')} />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={loadingOverview || refreshing}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] text-[var(--text-primary)] text-xs font-bold uppercase tracking-[0.18em] hover:bg-[var(--glass-bg-hover)] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              {t('superAdminNetwork.refresh')}
            </button>
          </div>
        </div>
      </section>

      {error ? (
        <section className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </section>
      ) : null}

      {actionMessage && !error ? (
        <section className="rounded-2xl border border-[var(--status-success-border)] bg-[var(--status-success-bg)] px-4 py-3 text-sm text-[var(--status-success-text)]">
          {actionMessage}
        </section>
      ) : null}

      <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <SummaryCard
          icon={Server}
          label={t('superAdminNetwork.stats.clients')}
          value={String(totals.clients)}
          hint={t('superAdminNetwork.stats.clientsHint')}
        />
        <SummaryCard
          icon={MapPin}
          label={t('superAdminNetwork.stats.locations')}
          value={String(totals.locations)}
          hint={`${totals.activePeers} ${t('superAdminNetwork.stats.wgPeers')?.toLowerCase?.() || 'wg-peers'}`}
        />
        <SummaryCard
          icon={Check}
          label={t('superAdminNetwork.stats.applied')}
          value={String(Math.min(totals.appliedWireGuard, totals.appliedCaddy))}
          hint={`${totals.activeSites} ${t('superAdminNetwork.stats.caddySites')?.toLowerCase?.() || 'caddy-sites'}`}
          tone={(totals.appliedWireGuard + totals.appliedCaddy) > 0 ? 'good' : 'neutral'}
        />
      </section>

      {loadingOverview ? (
        <section className="popup-surface rounded-3xl p-6 border border-[var(--glass-border)]">
          <p className="text-sm text-[var(--text-secondary)]">{t('superAdminNetwork.loading')}</p>
        </section>
      ) : (
        <section className="grid grid-cols-1 xl:grid-cols-[0.72fr_1.28fr] gap-4 items-start">
          <aside className="popup-surface rounded-3xl p-4 md:p-5 border border-[var(--glass-border)]">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <p className="text-xs md:text-sm font-bold uppercase tracking-[0.2em] text-[var(--text-secondary)]">
                  {t('superAdminNetwork.clientsTitle')}
                </p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  {t('superAdminNetwork.clientsSubtitle')}
                </p>
              </div>
              <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
                {clients.length}
              </span>
            </div>

            {!clients.length ? (
              <p className="text-sm text-[var(--text-secondary)]">{t('superAdminNetwork.emptyClients')}</p>
            ) : (
              <div className="space-y-2 max-h-[65vh] overflow-y-auto custom-scrollbar pr-1">
                {clients.map((client) => {
                  const isActive = client.id === selectedClientId;
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
                        <StatusBadge
                          ready={Number(client.locationCount || 0) > 0}
                          readyLabel={t('superAdminNetwork.clientReady')}
                          pendingLabel={t('superAdminNetwork.clientEmpty')}
                        />
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-[var(--text-secondary)]">
                        <span>{t('superAdminNetwork.stats.locations')}: {client.locationCount || 0}</span>
                        <span>{t('superAdminNetwork.stats.wgPeers')}: {client.appliedWireGuardCount || 0}</span>
                        <span>{t('superAdminNetwork.stats.caddySites')}: {client.appliedCaddyCount || 0}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </aside>

          <div className="flex flex-col gap-4">
            <section className="popup-surface rounded-3xl p-4 md:p-5 border border-[var(--glass-border)]">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div>
                  <h3 className="text-xs md:text-sm font-bold uppercase tracking-[0.2em] text-[var(--text-secondary)]">
                    {t('superAdminNetwork.mapTitle')}
                  </h3>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    {t('superAdminNetwork.mapSubtitle')}
                  </p>
                </div>
                <Wifi className="w-4 h-4 text-[var(--text-muted)]" />
              </div>

              <div className="rounded-[28px] border border-[var(--glass-border)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--glass-bg)_90%,transparent),color-mix(in_srgb,var(--bg-primary)_86%,transparent))] p-4 md:p-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-stretch">
                  <TopologyNode
                    icon={Globe}
                    title={t('superAdminNetwork.map.domain')}
                    primary={domainFqdnPreview || '-'}
                    secondary={overview?.server?.publicHost || '-'}
                    status={caddyApplied ? t('superAdminNetwork.map.published') : (domainConfigured ? t('superAdminNetwork.map.configured') : t('superAdminNetwork.map.missing'))}
                    ready={domainConfigured}
                    accent
                  />
                  <TopologyConnector label="443" active={caddyApplied} />
                  <TopologyNode
                    icon={Server}
                    title={t('superAdminNetwork.map.server')}
                    primary={overview?.server?.publicHost || '-'}
                    secondary={`WG ${overview?.server?.wireGuardListenPort || '-'}`}
                    status={t('superAdminNetwork.map.live')}
                    ready={Boolean(overview?.server?.publicHost)}
                  />
                  <TopologyConnector label="WG" active={wireGuardApplied} />
                  <TopologyNode
                    icon={Wifi}
                    title={t('superAdminNetwork.map.tunnel')}
                    primary={formState.tunnelIp ? `${formState.tunnelIp}/32` : '-'}
                    secondary={wireGuardApplied ? (detail?.site?.runtime?.matchedPeer?.allowedIps?.join(', ') || '') : formState.lanSubnet}
                    status={wireGuardApplied ? t('superAdminNetwork.map.published') : (tunnelConfigured ? t('superAdminNetwork.map.configured') : t('superAdminNetwork.map.missing'))}
                    ready={tunnelConfigured}
                  />
                  <TopologyConnector label="LAN" active={routerConfigured} />
                  <TopologyNode
                    icon={Router}
                    title={t('superAdminNetwork.map.router')}
                    primary={formState.routerIp || '-'}
                    secondary={formState.lanSubnet || '-'}
                    status={routerConfigured ? t('superAdminNetwork.map.configured') : t('superAdminNetwork.map.missing')}
                    ready={routerConfigured}
                  />
                  <TopologyConnector label="8123" active={haConfigured} />
                  <TopologyNode
                    icon={Monitor}
                    title={t('superAdminNetwork.map.ha')}
                    primary={formState.haIp || '-'}
                    secondary={selectedLocationName}
                    status={haConfigured ? t('superAdminNetwork.map.configured') : t('superAdminNetwork.map.missing')}
                    ready={haConfigured}
                  />
                </div>

                <div className="mt-4 grid grid-cols-1 xl:grid-cols-[1.4fr_auto_1fr] gap-4 items-center">
                  <div className="rounded-3xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-4 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
                          {t('superAdminNetwork.map.accessPath')}
                        </p>
                        <p className="mt-2 text-sm text-[var(--text-primary)]">
                          {domainFqdnPreview || '-'} <span className="text-[var(--text-secondary)]">→</span> {formState.haIp || '-'}:8123
                        </p>
                      </div>
                      <StatusBadge
                        ready={caddyApplied && haConfigured}
                        readyLabel={t('superAdminNetwork.map.ready')}
                        pendingLabel={t('superAdminNetwork.pending')}
                      />
                    </div>
                  </div>

                  <div className="hidden xl:block h-px w-10 bg-[var(--glass-border)]" />

                  <div className="rounded-3xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-4 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
                          {t('superAdminNetwork.map.backup')}
                        </p>
                        <p className="mt-2 text-sm text-[var(--text-primary)] break-all">{backupPathPreview}</p>
                      </div>
                      <div className="rounded-2xl border border-current/10 bg-black/5 p-2">
                        <HardDrive className="h-4 w-4 text-[var(--text-primary)] opacity-80" />
                      </div>
                    </div>
                    <div className="mt-3">
                      <StatusBadge
                        ready={backupConfigured}
                        readyLabel={t('superAdminNetwork.map.configured')}
                        pendingLabel={t('superAdminNetwork.map.missing')}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className="popup-surface rounded-3xl p-4 md:p-5 border border-[var(--glass-border)]">
              {selectedClient ? (
                <>
                  <div className={`flex ${isMobile ? 'flex-col gap-3' : 'items-start justify-between gap-4'}`}>
                    <div className="max-w-3xl">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">
                        {t('superAdminNetwork.selectedClient')}
                      </p>
                      <h3 className="mt-1 text-base md:text-lg font-semibold text-[var(--text-primary)]">
                        {selectedClient.name || selectedClient.id}
                      </h3>
                      <p className="mt-2 text-sm text-[var(--text-secondary)]">
                        {t('superAdminNetwork.selectedLocation')}: <span className="text-[var(--text-primary)]">{selectedLocationName}</span>
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={handleNewLocation}
                        className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] text-[var(--text-primary)] text-xs font-bold uppercase tracking-[0.16em] hover:bg-[var(--glass-bg-hover)] transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                        {t('superAdminNetwork.newLocation')}
                      </button>
                      <button
                        type="button"
                        onClick={handleSave}
                        disabled={saving || !formState.locationId}
                        className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-text)] text-xs font-bold uppercase tracking-[0.16em] hover:brightness-[0.98] transition-colors disabled:opacity-60"
                      >
                        {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        {t('superAdminNetwork.save')}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleApply('wireguard')}
                        disabled={!detail?.persisted || applyingTarget === 'wireguard'}
                        className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] text-[var(--text-primary)] text-xs font-bold uppercase tracking-[0.14em] hover:bg-[var(--glass-bg-hover)] transition-colors disabled:opacity-60"
                      >
                        {applyingTarget === 'wireguard' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
                        {t('superAdminNetwork.applyWireGuard')}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleApply('caddy')}
                        disabled={!detail?.persisted || applyingTarget === 'caddy'}
                        className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] text-[var(--text-primary)] text-xs font-bold uppercase tracking-[0.14em] hover:bg-[var(--glass-bg-hover)] transition-colors disabled:opacity-60"
                      >
                        {applyingTarget === 'caddy' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
                        {t('superAdminNetwork.applyCaddy')}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleApply('all')}
                        disabled={!detail?.persisted || applyingTarget === 'all'}
                        className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] text-[var(--text-primary)] text-xs font-bold uppercase tracking-[0.14em] hover:bg-[var(--glass-bg-hover)] transition-colors disabled:opacity-60"
                      >
                        {applyingTarget === 'all' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Server className="w-4 h-4" />}
                        {t('superAdminNetwork.applyAll')}
                      </button>
                      <button
                        type="button"
                        onClick={handleDownloadUmr}
                        disabled={!detail?.persisted || downloading}
                        className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] text-[var(--text-primary)] text-xs font-bold uppercase tracking-[0.14em] hover:bg-[var(--glass-bg-hover)] transition-colors disabled:opacity-60"
                      >
                        {downloading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                        {t('superAdminNetwork.downloadUmr')}
                      </button>
                    </div>
                  </div>

                  <div className="mt-5 rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-4 py-4">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-[var(--text-muted)]" />
                      <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">
                        {t('superAdminNetwork.locationsTitle')}
                      </p>
                    </div>
                    <p className="mt-2 text-xs text-[var(--text-secondary)]">
                      {t('superAdminNetwork.locationsSubtitle')}
                    </p>

                    {!locations.length ? (
                      <p className="mt-3 text-sm text-[var(--text-secondary)]">{t('superAdminNetwork.emptyLocations')}</p>
                    ) : (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {locations.map((location) => {
                          const isActive = location.locationId === selectedLocationId;
                          return (
                            <button
                              key={location.locationId}
                              type="button"
                              onClick={() => setSelectedLocationId(location.locationId)}
                              className={`rounded-2xl border px-3 py-2 text-left transition-colors ${
                                isActive
                                  ? 'border-[var(--accent-color)] bg-[color-mix(in_srgb,var(--accent-color)_16%,transparent)]'
                                  : 'border-[var(--glass-border)] bg-[var(--glass-bg)] hover:bg-[var(--glass-bg-hover)]'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold text-[var(--text-primary)]">{location.displayName || location.locationId}</span>
                                <StatusBadge
                                  ready={Boolean(location.runtime?.wireGuardApplied || location.runtime?.caddyApplied)}
                                  readyLabel={t('superAdminNetwork.applied')}
                                  pendingLabel={t('superAdminNetwork.pending')}
                                />
                              </div>
                              <div className="mt-1 text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
                                {location.locationId}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-sm text-[var(--text-secondary)]">{t('superAdminNetwork.emptyClients')}</p>
              )}
            </section>

            <section className="popup-surface rounded-3xl p-4 md:p-5 border border-[var(--glass-border)]">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div>
                  <h3 className="text-xs md:text-sm font-bold uppercase tracking-[0.2em] text-[var(--text-secondary)]">
                    {t('superAdminNetwork.snapshotTitle')}
                  </h3>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    {t('superAdminNetwork.snapshotSubtitle')}
                  </p>
                </div>
                <Shield className="w-4 h-4 text-[var(--text-muted)]" />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                <InfoField
                  label={t('superAdminNetwork.runtime.domain')}
                  value={domainFqdnPreview || '-'}
                  accent={Boolean(domainFqdnPreview)}
                />
                <InfoField
                  label={t('superAdminNetwork.runtime.backupPath')}
                  value={backupPathPreview}
                />
                <div className="rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-4 py-3">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
                    {t('superAdminNetwork.runtimeTitle')}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <StatusBadge
                      ready={wireGuardApplied}
                      readyLabel={t('superAdminNetwork.runtime.wgApplied')}
                      pendingLabel={t('superAdminNetwork.pending')}
                    />
                    <StatusBadge
                      ready={caddyApplied}
                      readyLabel={t('superAdminNetwork.runtime.caddyApplied')}
                      pendingLabel={t('superAdminNetwork.pending')}
                    />
                  </div>
                  <p className="mt-3 text-xs text-[var(--text-secondary)]">
                    {detail?.site?.runtime?.matchedCaddy?.reverseProxy
                      || detail?.site?.runtime?.matchedPeer?.allowedIps?.join(', ')
                      || t('superAdminNetwork.active.none')}
                  </p>
                </div>
              </div>
            </section>

            <section className="popup-surface rounded-3xl p-4 md:p-5 border border-[var(--glass-border)]">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div>
                  <h3 className="text-xs md:text-sm font-bold uppercase tracking-[0.2em] text-[var(--text-secondary)]">
                    {t('superAdminNetwork.fieldsTitle')}
                  </h3>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    {t('superAdminNetwork.fieldsSubtitle')}
                  </p>
                </div>
                {loadingDetail ? <RefreshCw className="w-4 h-4 animate-spin text-[var(--text-muted)]" /> : <Database className="w-4 h-4 text-[var(--text-muted)]" />}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="flex flex-col gap-2">
                  <span className={fieldLabelClass}>{t('superAdminNetwork.form.locationId')}</span>
                  <input className={textInputClass} value={formState.locationId} onChange={(event) => updateField('locationId', event.target.value)} readOnly={!isNewLocation} />
                </label>
                <label className="flex flex-col gap-2">
                  <span className={fieldLabelClass}>{t('superAdminNetwork.form.displayName')}</span>
                  <input className={textInputClass} value={formState.displayName} onChange={(event) => updateField('displayName', event.target.value)} />
                </label>
                <label className="flex flex-col gap-2">
                  <span className={fieldLabelClass}>{t('superAdminNetwork.form.lanSubnet')}</span>
                  <input className={textInputClass} value={formState.lanSubnet} onChange={(event) => updateField('lanSubnet', event.target.value)} placeholder="192.168.107.0/24" />
                </label>
                <label className="flex flex-col gap-2">
                  <span className={fieldLabelClass}>{t('superAdminNetwork.form.routerIp')}</span>
                  <input className={textInputClass} value={formState.routerIp} onChange={(event) => updateField('routerIp', event.target.value)} placeholder="192.168.107.1" />
                </label>
                <label className="flex flex-col gap-2">
                  <span className={fieldLabelClass}>{t('superAdminNetwork.form.haIp')}</span>
                  <input className={textInputClass} value={formState.haIp} onChange={(event) => updateField('haIp', event.target.value)} placeholder="192.168.107.120" />
                </label>
                <label className="flex flex-col gap-2">
                  <span className={fieldLabelClass}>{t('superAdminNetwork.form.tunnelIp')}</span>
                  <input className={textInputClass} value={formState.tunnelIp} onChange={(event) => updateField('tunnelIp', event.target.value)} placeholder="10.88.0.5" />
                </label>
                <label className="flex flex-col gap-2 md:col-span-2">
                  <span className={fieldLabelClass}>{t('superAdminNetwork.form.domainLabel')}</span>
                  <input className={textInputClass} value={formState.domainLabel} onChange={(event) => updateField('domainLabel', event.target.value)} placeholder="obf1" />
                </label>
              </div>

              <div className="mt-4 rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-4 py-4">
                <button
                  type="button"
                  onClick={() => setShowAdvancedFields((current) => !current)}
                  className="flex w-full items-center justify-between gap-3 text-left"
                >
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
                      {showAdvancedFields ? t('superAdminNetwork.hideAdvanced') : t('superAdminNetwork.showAdvanced')}
                    </p>
                    <p className="mt-1 text-xs text-[var(--text-secondary)]">
                      {t('superAdminNetwork.manualActionsHint')}
                    </p>
                  </div>
                  <ChevronDown className={`h-4 w-4 text-[var(--text-muted)] transition-transform ${showAdvancedFields ? 'rotate-180' : ''}`} />
                </button>

                {showAdvancedFields ? (
                  <div className="mt-4 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <label className="flex flex-col gap-2">
                        <span className={fieldLabelClass}>{t('superAdminNetwork.form.clientId')}</span>
                        <input className={textInputClass} value={formState.clientId || selectedClientId} readOnly />
                      </label>
                      <label className="flex flex-col gap-2">
                        <span className={fieldLabelClass}>{t('superAdminNetwork.form.backupLocationId')}</span>
                        <input className={textInputClass} value={formState.backupLocationId} onChange={(event) => updateField('backupLocationId', event.target.value)} />
                      </label>
                      <label className="flex flex-col gap-2 md:col-span-2">
                        <span className={fieldLabelClass}>{t('superAdminNetwork.form.domainFqdn')}</span>
                        <input className={textInputClass} value={formState.domainFqdn} onChange={(event) => updateField('domainFqdn', event.target.value)} placeholder={domainSuffix ? `obf1.${domainSuffix}` : 'obf1.smarti.dev'} />
                      </label>
                    </div>

                    <div className="rounded-2xl border border-[var(--glass-border)] bg-[color-mix(in_srgb,var(--bg-primary)_72%,transparent)] px-4 py-4">
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div>
                          <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
                            {t('superAdminNetwork.manualActions')}
                          </p>
                          <p className="mt-1 text-xs text-[var(--text-secondary)]">
                            {t('superAdminNetwork.manualActionsHint')}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => handleApply('wireguard')}
                            disabled={!detail?.persisted || applyingTarget === 'wireguard'}
                            className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] text-[var(--text-primary)] text-xs font-bold uppercase tracking-[0.14em] hover:bg-[var(--glass-bg-hover)] transition-colors disabled:opacity-60"
                          >
                            {applyingTarget === 'wireguard' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
                            {t('superAdminNetwork.applyWireGuard')}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleApply('caddy')}
                            disabled={!detail?.persisted || applyingTarget === 'caddy'}
                            className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] text-[var(--text-primary)] text-xs font-bold uppercase tracking-[0.14em] hover:bg-[var(--glass-bg-hover)] transition-colors disabled:opacity-60"
                          >
                            {applyingTarget === 'caddy' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
                            {t('superAdminNetwork.applyCaddy')}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </section>

            <section className="popup-surface rounded-3xl p-4 md:p-5 border border-[var(--glass-border)]">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 className="text-xs md:text-sm font-bold uppercase tracking-[0.2em] text-[var(--text-secondary)]">
                    {t('superAdminNetwork.previewsTitle')}
                  </h3>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    {showInspector ? t('superAdminNetwork.activeSubtitle') : t('superAdminNetwork.previewsSubtitle')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowInspector((current) => !current)}
                  className="inline-flex items-center justify-center gap-2 self-start rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-3 py-2 text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-primary)] transition-colors hover:bg-[var(--glass-bg-hover)]"
                >
                  <Link className="h-4 w-4" />
                  {showInspector ? t('superAdminNetwork.inspectClose') : t('superAdminNetwork.inspectOpen')}
                </button>
              </div>

              {showInspector ? (
                <>
                  <div className="mt-4 inline-flex rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-1">
                    <button
                      type="button"
                      onClick={() => setInspectorTab('preview')}
                      className={`rounded-2xl px-3 py-2 text-xs font-semibold transition-colors ${inspectorTab === 'preview' ? 'bg-[color-mix(in_srgb,var(--accent-color)_16%,transparent)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}
                    >
                      {t('superAdminNetwork.inspectPreview')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setInspectorTab('live')}
                      className={`rounded-2xl px-3 py-2 text-xs font-semibold transition-colors ${inspectorTab === 'live' ? 'bg-[color-mix(in_srgb,var(--accent-color)_16%,transparent)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}
                    >
                      {t('superAdminNetwork.inspectLive')}
                    </button>
                  </div>

                  {inspectorTab === 'preview' ? (
                    <div className="mt-4 grid grid-cols-1 2xl:grid-cols-3 gap-4">
                      <PreviewPanel
                        title={t('superAdminNetwork.preview.wireGuard')}
                        subtitle={t('superAdminNetwork.preview.wireGuardSubtitle')}
                        value={wireGuardPeerPreview}
                        emptyLabel={t('superAdminNetwork.preview.empty')}
                      />
                      <PreviewPanel
                        title={t('superAdminNetwork.preview.caddy')}
                        subtitle={t('superAdminNetwork.preview.caddySubtitle')}
                        value={caddyPreview}
                        emptyLabel={t('superAdminNetwork.preview.empty')}
                      />
                      <PreviewPanel
                        title={t('superAdminNetwork.preview.umr')}
                        subtitle={t('superAdminNetwork.preview.umrSubtitle')}
                        value={detail?.artifacts?.umrConfig || ''}
                        emptyLabel={detail?.artifacts?.umrConfigError || t('superAdminNetwork.preview.umrUnavailable')}
                        tone={detail?.artifacts?.umrConfig ? 'neutral' : 'warn'}
                      />
                    </div>
                  ) : (
                    <div className="mt-4 space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                        <InfoField
                          label={t('superAdminNetwork.runtime.aRecord')}
                          value={domainFqdnPreview ? `${formState.domainLabel || formState.locationId} -> ${overview?.server?.publicHost || '-'}` : '-'}
                        />
                        <InfoField
                          label={t('superAdminNetwork.runtime.serverHost')}
                          value={overview?.server?.publicHost || '-'}
                        />
                        <InfoField
                          label={t('superAdminNetwork.runtime.serverKey')}
                          value={overview?.server?.wireGuardServerPublicKey || t('superAdminNetwork.runtime.notConfigured')}
                        />
                        <InfoField
                          label={t('superAdminNetwork.runtime.listenPort')}
                          value={String(overview?.server?.wireGuardListenPort || '-')}
                        />
                      </div>

                      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                        <PreviewPanel
                          title={t('superAdminNetwork.active.wireGuard')}
                          value={detail?.site?.runtime?.matchedPeer?.raw || ''}
                          emptyLabel={t('superAdminNetwork.active.none')}
                        />
                        <PreviewPanel
                          title={t('superAdminNetwork.active.caddy')}
                          value={detail?.site?.runtime?.matchedCaddy?.raw || ''}
                          emptyLabel={t('superAdminNetwork.active.none')}
                        />
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="mt-4 rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-4 py-4 text-sm text-[var(--text-secondary)]">
                  {hasPublishedConfig ? t('superAdminNetwork.activeSubtitle') : t('superAdminNetwork.previewsSubtitle')}
                </div>
              )}
            </section>
          </div>
        </section>
      )}
    </div>
  );
}
