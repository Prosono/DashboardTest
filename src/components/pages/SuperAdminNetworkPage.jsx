import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Check,
  Cpu,
  Download,
  Globe,
  HardDrive,
  MapPin,
  Monitor,
  Plus,
  Radio,
  RefreshCw,
  Router,
  Search,
  Server,
  Shield,
  Trash2,
  Wifi,
  Wrench,
  Zap,
} from '../../icons';

const NEW_LOCATION_KEY = '__new__';

const emptyForm = (clientId = '') => ({
  clientId,
  locationId: '',
  displayName: '',
  backupLocationId: '',
  lanSubnet: '',
  routerIp: '',
  umrMac: '',
  mobilityWorkspaceId: '',
  mobilityDeviceId: '',
  switchIp: '',
  switchMac: '',
  haIp: '',
  haMac: '',
  knxIp: '',
  knxMac: '',
  tunnelIp: '',
  domainLabel: '',
  domainFqdn: '',
});

const formFromSite = (site) => ({
  clientId: String(site?.clientId || '').trim(),
  locationId: String(site?.locationId || '').trim(),
  displayName: String(site?.displayName || site?.name || '').trim(),
  backupLocationId: String(site?.backupLocationId || '').trim(),
  lanSubnet: String(site?.lanSubnet || '').trim(),
  routerIp: String(site?.umrLanIp || site?.routerIp || '').trim(),
  umrMac: String(site?.umrMac || '').trim(),
  mobilityWorkspaceId: String(site?.mobilityWorkspaceId || '').trim(),
  mobilityDeviceId: String(site?.mobilityDeviceId || '').trim(),
  switchIp: String(site?.switchIp || '').trim(),
  switchMac: String(site?.switchMac || '').trim(),
  haIp: String(site?.haIp || '').trim(),
  haMac: String(site?.haMac || '').trim(),
  knxIp: String(site?.knxIp || '').trim(),
  knxMac: String(site?.knxMac || '').trim(),
  tunnelIp: String(site?.tunnelIp || '').trim(),
  domainLabel: String(site?.domainLabel || '').trim(),
  domainFqdn: String(site?.domainFqdn || '').trim(),
});

const normalizeMac = (value) => String(value || '').trim().toLowerCase().replace(/-/g, ':');

const triggerBlobDownload = (blob, fileName) => {
  const url = globalThis.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  globalThis.setTimeout(() => globalThis.URL.revokeObjectURL(url), 1000);
};

const inputClass = 'w-full rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-3.5 py-3 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent-color)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--accent-color)_20%,transparent)]';
const labelClass = 'text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]';

function StatusBadge({ tone = 'neutral', children }) {
  const tones = {
    good: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100',
    warning: 'border-amber-400/30 bg-amber-400/10 text-amber-100',
    danger: 'border-red-400/30 bg-red-400/10 text-red-100',
    info: 'border-sky-400/30 bg-sky-400/10 text-sky-100',
    neutral: 'border-[var(--glass-border)] bg-[var(--glass-bg)] text-[var(--text-secondary)]',
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.14em] ${tones[tone] || tones.neutral}`}>
      {children}
    </span>
  );
}

const statusTone = (status) => {
  if (status === 'live') return 'good';
  if (status === 'ready') return 'info';
  if (status === 'conflict') return 'danger';
  if (status === 'partial' || status === 'drifted') return 'warning';
  return 'neutral';
};

function NodeStatusBadge({ status = 'draft', t }) {
  return (
    <StatusBadge tone={statusTone(status)}>
      {t(`superAdminNetwork.nodeStatus.${status}`)}
    </StatusBadge>
  );
}

function Metric({ icon: Icon, label, value, hint, tone = 'neutral' }) {
  const border = tone === 'good'
    ? 'border-emerald-400/25 bg-emerald-400/[0.07]'
    : tone === 'warning'
      ? 'border-amber-400/25 bg-amber-400/[0.07]'
      : 'border-[var(--glass-border)] bg-[var(--glass-bg)]';
  return (
    <div className={`min-w-0 rounded-2xl border px-4 py-3 ${border}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.17em] text-[var(--text-muted)]">{label}</p>
          <p className="mt-1.5 text-2xl font-semibold tracking-tight text-[var(--text-primary)]">{value}</p>
          <p className="mt-1 truncate text-[11px] text-[var(--text-secondary)]">{hint}</p>
        </div>
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-muted)]" />
      </div>
    </div>
  );
}

function DeviceNode({
  icon: Icon,
  label,
  value,
  detail,
  status,
  ready = false,
  emphasized = false,
}) {
  return (
    <div className={`min-w-0 rounded-2xl border px-4 py-4 ${
      emphasized
        ? 'border-[color-mix(in_srgb,var(--accent-color)_42%,var(--glass-border))] bg-[color-mix(in_srgb,var(--accent-color)_10%,var(--glass-bg))]'
        : ready
          ? 'border-emerald-400/25 bg-emerald-400/[0.06]'
          : 'border-[var(--glass-border)] bg-[var(--glass-bg)]'
    }`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[9px] font-semibold uppercase tracking-[0.17em] text-[var(--text-muted)]">{label}</p>
          <p className="mt-2 truncate text-sm font-semibold text-[var(--text-primary)]">{value || '-'}</p>
          <p className="mt-1 truncate text-[11px] text-[var(--text-secondary)]">{detail || '-'}</p>
        </div>
        <Icon className="h-4 w-4 shrink-0 text-[var(--text-secondary)]" />
      </div>
      <div className="mt-3">
        <StatusBadge tone={ready ? 'good' : 'neutral'}>{status}</StatusBadge>
      </div>
    </div>
  );
}

function Connector({ label, active = false }) {
  return (
    <div className="hidden min-w-12 items-center gap-2 xl:flex">
      <div className={`h-px flex-1 ${active ? 'bg-emerald-400/55' : 'bg-[var(--glass-border)]'}`} />
      <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">{label}</span>
      <div className={`h-px flex-1 ${active ? 'bg-emerald-400/55' : 'bg-[var(--glass-border)]'}`} />
    </div>
  );
}

function Field({ label, value, onChange, placeholder = '', readOnly = false, hint = '' }) {
  return (
    <label className="flex min-w-0 flex-col gap-2">
      <span className={labelClass}>{label}</span>
      <input
        className={`${inputClass} ${readOnly ? 'cursor-not-allowed opacity-65' : ''}`}
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
        placeholder={placeholder}
        readOnly={readOnly}
      />
      {hint ? <span className="text-[11px] leading-4 text-[var(--text-muted)]">{hint}</span> : null}
    </label>
  );
}

function StepTab({ step, title, subtitle, ready, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-w-[190px] flex-1 rounded-2xl border px-4 py-3 text-left transition-colors ${
        active
          ? 'border-[var(--accent-color)] bg-[color-mix(in_srgb,var(--accent-color)_13%,var(--glass-bg))]'
          : 'border-[var(--glass-border)] bg-[var(--glass-bg)] hover:bg-[var(--glass-bg-hover)]'
      }`}
    >
      <div className="flex items-start gap-3">
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
          ready
            ? 'bg-emerald-400/15 text-emerald-100'
            : active
              ? 'bg-[color-mix(in_srgb,var(--accent-color)_22%,transparent)] text-[var(--text-primary)]'
              : 'bg-[var(--glass-border)] text-[var(--text-secondary)]'
        }`}>
          {ready ? <Check className="h-3.5 w-3.5" /> : step}
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-[var(--text-primary)]">{title}</p>
          <p className="mt-1 text-[10px] leading-4 text-[var(--text-muted)]">{subtitle}</p>
        </div>
      </div>
    </button>
  );
}

function CodePanel({ title, value, empty, minHeight = '170px' }) {
  return (
    <div className="min-w-0 rounded-2xl border border-[var(--glass-border)] bg-[color-mix(in_srgb,var(--bg-primary)_72%,transparent)] p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">{title}</p>
      <pre
        className="mt-3 overflow-auto whitespace-pre-wrap break-all rounded-xl border border-[var(--glass-border)] bg-[color-mix(in_srgb,var(--bg-primary)_85%,transparent)] p-3 text-[11px] leading-5 text-[var(--text-secondary)]"
        style={{ minHeight }}
      >
        {value || empty}
      </pre>
    </div>
  );
}

function Instruction({ number, title, text }) {
  return (
    <div className="flex gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg)] text-xs font-bold text-[var(--text-primary)]">
        {number}
      </span>
      <div>
        <p className="text-sm font-semibold text-[var(--text-primary)]">{title}</p>
        <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{text}</p>
      </div>
    </div>
  );
}

export default function SuperAdminNetworkPage({ t, userAdminApi, isMobile }) {
  const [overview, setOverview] = useState(null);
  const [detail, setDetail] = useState(null);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [selectedLocationId, setSelectedLocationId] = useState('');
  const [form, setForm] = useState(() => emptyForm());
  const [activeStep, setActiveStep] = useState(1);
  const [nodeSearch, setNodeSearch] = useState('');
  const [nodeFilter, setNodeFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [mobilityInventory, setMobilityInventory] = useState(null);
  const [mobilitySnapshot, setMobilitySnapshot] = useState(null);
  const [mobilityLoading, setMobilityLoading] = useState(false);
  const [mobilityError, setMobilityError] = useState('');

  const loadOverview = useCallback(async (refresh = false) => {
    if (!userAdminApi?.fetchNetworkOverview) return null;
    if (refresh) setRefreshing(true);
    else setLoading(true);
    try {
      const payload = await userAdminApi.fetchNetworkOverview();
      setOverview(payload);
      return payload;
    } catch (loadError) {
      setError(loadError?.message || t('superAdminNetwork.loadFailed'));
      return null;
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [t, userAdminApi]);

  const loadMobilityInventory = useCallback(async (refresh = false) => {
    if (!userAdminApi?.fetchUnifiMobilityInventory) return null;
    setMobilityLoading(true);
    setMobilityError('');
    try {
      const payload = await userAdminApi.fetchUnifiMobilityInventory(refresh);
      setMobilityInventory(payload);
      return payload;
    } catch (loadError) {
      setMobilityError(loadError?.message || t('superAdminNetwork.mobility.loadFailed'));
      return null;
    } finally {
      setMobilityLoading(false);
    }
  }, [t, userAdminApi]);

  const loadDetail = useCallback(async (clientId, locationId) => {
    if (!clientId || !locationId || locationId === NEW_LOCATION_KEY || !userAdminApi?.fetchNetworkSite) {
      setDetail(null);
      return null;
    }
    setLoadingDetail(true);
    try {
      const payload = await userAdminApi.fetchNetworkSite(clientId, locationId);
      setDetail(payload);
      setForm(formFromSite(payload?.site));
      return payload;
    } catch (loadError) {
      setError(loadError?.message || t('superAdminNetwork.detailLoadFailed'));
      return null;
    } finally {
      setLoadingDetail(false);
    }
  }, [t, userAdminApi]);

  const loadMobilityDevice = useCallback(async (workspaceId, deviceId) => {
    if (!workspaceId || !deviceId || !userAdminApi?.fetchUnifiMobilityDevice) {
      setMobilitySnapshot(null);
      return null;
    }
    setMobilityLoading(true);
    setMobilityError('');
    try {
      const payload = await userAdminApi.fetchUnifiMobilityDevice(workspaceId, deviceId);
      setMobilitySnapshot(payload);
      return payload;
    } catch (loadError) {
      setMobilitySnapshot(null);
      setMobilityError(loadError?.message || t('superAdminNetwork.mobility.deviceFailed'));
      return null;
    } finally {
      setMobilityLoading(false);
    }
  }, [t, userAdminApi]);

  useEffect(() => {
    void loadOverview();
    void loadMobilityInventory();
  }, [loadMobilityInventory, loadOverview]);

  const clients = useMemo(
    () => (Array.isArray(overview?.clients) ? overview.clients : []),
    [overview?.clients],
  );
  const mobilityDevices = useMemo(
    () => (Array.isArray(mobilityInventory?.devices) ? mobilityInventory.devices : []),
    [mobilityInventory?.devices],
  );

  useEffect(() => {
    if (!clients.length) {
      setSelectedClientId('');
      setSelectedLocationId('');
      setDetail(null);
      setForm(emptyForm());
      return;
    }
    if (!clients.some((client) => client.id === selectedClientId)) {
      setSelectedClientId(clients[0].id);
    }
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
    if (!selectedClient) return;
    if (selectedLocationId === NEW_LOCATION_KEY) return;
    if (!locations.length) {
      setSelectedLocationId(NEW_LOCATION_KEY);
      setForm(emptyForm(selectedClient.id));
      setDetail(null);
      return;
    }
    if (!locations.some((location) => location.locationId === selectedLocationId)) {
      setSelectedLocationId(locations[0].locationId);
    }
  }, [locations, selectedClient, selectedLocationId]);

  useEffect(() => {
    if (!selectedClient || !selectedLocationId) return;
    if (selectedLocationId === NEW_LOCATION_KEY) {
      setDetail(null);
      setForm(emptyForm(selectedClient.id));
      setMobilitySnapshot(null);
      return;
    }
    void loadDetail(selectedClient.id, selectedLocationId);
  }, [loadDetail, selectedClient, selectedLocationId]);

  useEffect(() => {
    if (form.mobilityWorkspaceId && form.mobilityDeviceId) {
      void loadMobilityDevice(form.mobilityWorkspaceId, form.mobilityDeviceId);
    } else {
      setMobilitySnapshot(null);
    }
  }, [form.mobilityDeviceId, form.mobilityWorkspaceId, loadMobilityDevice]);

  useEffect(() => {
    setActiveStep(1);
    setError('');
    setMessage('');
  }, [selectedClientId, selectedLocationId]);

  const selectedSummary = useMemo(
    () => locations.find((location) => location.locationId === selectedLocationId) || null,
    [locations, selectedLocationId],
  );
  const isNew = selectedLocationId === NEW_LOCATION_KEY;
  const locationName = isNew
    ? t('superAdminNetwork.newLocation')
    : (detail?.site?.displayName || selectedSummary?.displayName || selectedLocationId);

  const domainSuffix = String(overview?.server?.domainSuffix || '').trim();
  const domainFqdn = useMemo(() => {
    const direct = String(form.domainFqdn || '').trim().toLowerCase();
    if (direct) return direct;
    const label = String(form.domainLabel || '').trim().toLowerCase();
    return label && domainSuffix ? `${label}.${domainSuffix}` : '';
  }, [domainSuffix, form.domainFqdn, form.domainLabel]);

  const backupPath = useMemo(() => {
    const root = String(overview?.server?.backupRoot || '').replace(/\/$/, '');
    const locationId = String(form.backupLocationId || form.locationId || '').trim();
    return root && selectedClientId && locationId ? `${root}/${selectedClientId}/${locationId}` : '-';
  }, [form.backupLocationId, form.locationId, overview?.server?.backupRoot, selectedClientId]);

  const wireGuardApplied = Boolean(detail?.site?.runtime?.wireGuardApplied);
  const caddyApplied = Boolean(detail?.site?.runtime?.caddyApplied);
  const selectedMobilitySummary = useMemo(
    () => mobilityDevices.find((device) => (
      device.workspaceId === form.mobilityWorkspaceId && device.id === form.mobilityDeviceId
    )) || null,
    [form.mobilityDeviceId, form.mobilityWorkspaceId, mobilityDevices],
  );
  const umrOnline = Boolean(mobilitySnapshot?.device?.online || selectedMobilitySummary?.online);

  const mobilityClientsByMac = useMemo(() => new Map(
    (Array.isArray(mobilitySnapshot?.clients) ? mobilitySnapshot.clients : [])
      .filter((client) => normalizeMac(client.macAddress))
      .map((client) => [normalizeMac(client.macAddress), client]),
  ), [mobilitySnapshot?.clients]);
  const switchClient = mobilityClientsByMac.get(normalizeMac(form.switchMac)) || null;
  const hubClient = mobilityClientsByMac.get(normalizeMac(form.haMac)) || null;
  const knxClient = mobilityClientsByMac.get(normalizeMac(form.knxMac)) || null;

  const stepReady = useMemo(() => ({
    1: Boolean(form.locationId && form.displayName && form.lanSubnet && form.routerIp && form.haIp && form.knxIp),
    2: Boolean(form.tunnelIp && form.lanSubnet && detail?.site?.hasWireGuardKeys),
    3: Boolean(domainFqdn && form.haIp && form.backupLocationId),
    4: Boolean(wireGuardApplied && caddyApplied),
  }), [
    caddyApplied,
    detail?.site?.hasWireGuardKeys,
    domainFqdn,
    form.backupLocationId,
    form.displayName,
    form.haIp,
    form.knxIp,
    form.lanSubnet,
    form.locationId,
    form.routerIp,
    form.tunnelIp,
    wireGuardApplied,
  ]);
  const configurationPercent = Math.round(
    [stepReady[1], stepReady[2], stepReady[3]].filter(Boolean).length / 3 * 100,
  );

  const allNodes = useMemo(() => clients.flatMap((client) => (
    (Array.isArray(client.locations) ? client.locations : []).map((location) => {
      const mobility = mobilityDevices.find((device) => (
        device.workspaceId === location.mobilityWorkspaceId && device.id === location.mobilityDeviceId
      ));
      return {
        ...location,
        clientId: client.id,
        clientName: client.name || client.id,
        mobility,
      };
    })
  )), [clients, mobilityDevices]);
  const filteredNodes = useMemo(() => {
    const query = nodeSearch.trim().toLowerCase();
    return allNodes.filter((node) => {
      const matchesSearch = !query || [
        node.displayName,
        node.locationId,
        node.clientName,
        node.domainFqdn,
        node.tunnelIp,
        node.mobility?.name,
      ].some((value) => String(value || '').toLowerCase().includes(query));
      const matchesFilter = nodeFilter === 'all'
        || (nodeFilter === 'attention'
          ? !['live', 'ready'].includes(node.status)
          : node.status === nodeFilter);
      return matchesSearch && matchesFilter;
    });
  }, [allNodes, nodeFilter, nodeSearch]);

  const totals = useMemo(() => ({
    locations: Number(overview?.totals?.locations || 0),
    live: Number(overview?.totals?.live || 0),
    attention: Number(overview?.totals?.attention || 0),
    conflicts: Array.isArray(overview?.diagnostics?.conflicts) ? overview.diagnostics.conflicts.length : 0,
    mobilityOnline: mobilityDevices.filter((device) => device.online).length,
  }), [mobilityDevices, overview]);

  const wireGuardPeerPreview = useMemo(() => {
    const publicKey = detail?.site?.wireGuardPublicKey || t('superAdminNetwork.preview.generatedOnSave');
    return `[Peer]
# ${form.displayName || form.locationId || 'SMARTi site'}
PublicKey = ${publicKey}
AllowedIPs = ${form.tunnelIp || '<tunnel-ip>'}/32, ${form.lanSubnet || '<lan-subnet>'}`;
  }, [detail?.site?.wireGuardPublicKey, form.displayName, form.lanSubnet, form.locationId, form.tunnelIp, t]);
  const caddyPreview = `${domainFqdn || '<domain>'} {
    encode gzip
    reverse_proxy ${form.haIp || '<smarti-hub-ip>'}:8123
}`;

  const updateField = useCallback((key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
  }, []);

  const handleNew = useCallback(() => {
    if (!selectedClientId) return;
    setSelectedLocationId(NEW_LOCATION_KEY);
    setDetail(null);
    setForm(emptyForm(selectedClientId));
    setMobilitySnapshot(null);
    setActiveStep(1);
  }, [selectedClientId]);

  const handleSave = useCallback(async () => {
    if (!userAdminApi?.saveNetworkSite) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const payload = await userAdminApi.saveNetworkSite({
        ...form,
        clientId: selectedClientId || form.clientId,
        domainFqdn: form.domainFqdn || domainFqdn,
      });
      setDetail(payload);
      setForm(formFromSite(payload?.site));
      setSelectedLocationId(payload?.site?.locationId || form.locationId);
      setMessage(t('superAdminNetwork.saveSuccess'));
      await loadOverview(true);
    } catch (saveError) {
      setError(saveError?.message || t('superAdminNetwork.saveFailed'));
    } finally {
      setSaving(false);
    }
  }, [domainFqdn, form, loadOverview, selectedClientId, t, userAdminApi]);

  const handleApply = useCallback(async (target) => {
    if (!userAdminApi?.applyNetworkSite || !selectedClientId || !form.locationId) return;
    setApplying(target);
    setError('');
    setMessage('');
    try {
      const payload = await userAdminApi.applyNetworkSite(selectedClientId, form.locationId, target);
      setDetail((current) => ({ ...(current || {}), ...payload }));
      setMessage(
        payload?.result?.manualReloadRequired?.length
          ? `${t('superAdminNetwork.applySuccess')} ${t('superAdminNetwork.manualReload')}: ${payload.result.manualReloadRequired.join(', ')}`
          : t('superAdminNetwork.applySuccess'),
      );
      await loadOverview(true);
      await loadDetail(selectedClientId, form.locationId);
    } catch (applyError) {
      setError(applyError?.message || t('superAdminNetwork.applyFailed'));
    } finally {
      setApplying('');
    }
  }, [form.locationId, loadDetail, loadOverview, selectedClientId, t, userAdminApi]);

  const handleDownload = useCallback(async () => {
    if (!userAdminApi?.downloadNetworkUmrConfig || !selectedClientId || !form.locationId) return;
    setDownloading(true);
    setError('');
    try {
      const result = await userAdminApi.downloadNetworkUmrConfig(selectedClientId, form.locationId);
      triggerBlobDownload(result.blob, result.fileName);
      setMessage(t('superAdminNetwork.downloadStarted'));
    } catch (downloadError) {
      setError(downloadError?.message || t('superAdminNetwork.downloadFailed'));
    } finally {
      setDownloading(false);
    }
  }, [form.locationId, selectedClientId, t, userAdminApi]);

  const handleDelete = useCallback(async () => {
    if (!detail?.persisted || !userAdminApi?.deleteNetworkSite) return;
    if (!globalThis.confirm?.(t('superAdminNetwork.deleteConfirm'))) return;
    setDeleting(true);
    try {
      await userAdminApi.deleteNetworkSite(selectedClientId, form.locationId, true);
      setMessage(t('superAdminNetwork.deleteSuccess'));
      setDetail(null);
      await loadOverview(true);
      await loadDetail(selectedClientId, form.locationId);
    } catch (deleteError) {
      setError(deleteError?.message || t('superAdminNetwork.deleteFailed'));
    } finally {
      setDeleting(false);
    }
  }, [detail?.persisted, form.locationId, loadDetail, loadOverview, selectedClientId, t, userAdminApi]);

  const handleRefresh = useCallback(async () => {
    setError('');
    await Promise.all([
      loadOverview(true),
      loadMobilityInventory(true),
    ]);
    if (selectedClientId && selectedLocationId && selectedLocationId !== NEW_LOCATION_KEY) {
      await loadDetail(selectedClientId, selectedLocationId);
    }
    if (form.mobilityWorkspaceId && form.mobilityDeviceId) {
      await loadMobilityDevice(form.mobilityWorkspaceId, form.mobilityDeviceId);
    }
  }, [
    form.mobilityDeviceId,
    form.mobilityWorkspaceId,
    loadDetail,
    loadMobilityDevice,
    loadMobilityInventory,
    loadOverview,
    selectedClientId,
    selectedLocationId,
  ]);

  const workspaceDevices = mobilityDevices.filter(
    (device) => device.workspaceId === form.mobilityWorkspaceId,
  );

  return (
    <div className="page-transition flex flex-col gap-4 md:gap-5" data-disable-pull-refresh="true">
      <section className="popup-surface rounded-3xl border border-[var(--glass-border)] p-4 md:p-6">
        <div className={`flex gap-5 ${isMobile ? 'flex-col' : 'items-start justify-between'}`}>
          <div className="max-w-3xl">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--text-muted)]">
              {t('superAdminNetwork.eyebrow')}
            </p>
            <h2 className="mt-2 text-lg font-semibold uppercase tracking-[0.13em] text-[var(--text-primary)] md:text-xl">
              {t('superAdminNetwork.title')}
            </h2>
            <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
              {t('superAdminNetwork.subtitle')}
            </p>
          </div>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-4 py-2.5 text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-primary)] transition-colors hover:bg-[var(--glass-bg-hover)] disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            {t('superAdminNetwork.refresh')}
          </button>
        </div>
      </section>

      {error ? (
        <div className="rounded-2xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-100">
          {error}
        </div>
      ) : null}
      {message && !error ? (
        <div className="rounded-2xl border border-emerald-400/25 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
          {message}
        </div>
      ) : null}

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Metric
          icon={Shield}
          label={t('superAdminNetwork.stats.liveNodes')}
          value={`${totals.live}/${totals.locations}`}
          hint={t('superAdminNetwork.stats.runtimeHint')}
          tone={totals.live > 0 ? 'good' : 'neutral'}
        />
        <Metric
          icon={Radio}
          label={t('superAdminNetwork.mobility.onlineUmr')}
          value={overview?.mobility?.configured ? `${totals.mobilityOnline}/${mobilityDevices.length}` : '-'}
          hint={overview?.mobility?.configured
            ? t('superAdminNetwork.mobility.connectedHint')
            : t('superAdminNetwork.mobility.notConfiguredShort')}
          tone={totals.mobilityOnline > 0 ? 'good' : 'neutral'}
        />
        <Metric
          icon={AlertTriangle}
          label={t('superAdminNetwork.stats.attention')}
          value={String(totals.attention)}
          hint={t('superAdminNetwork.stats.attentionHint')}
          tone={totals.attention > 0 ? 'warning' : 'good'}
        />
        <Metric
          icon={Zap}
          label={t('superAdminNetwork.stats.conflicts')}
          value={String(totals.conflicts)}
          hint={t('superAdminNetwork.stats.conflictsHint')}
          tone={totals.conflicts > 0 ? 'warning' : 'good'}
        />
      </section>

      {loading ? (
        <section className="popup-surface rounded-3xl border border-[var(--glass-border)] p-6 text-sm text-[var(--text-secondary)]">
          {t('superAdminNetwork.loading')}
        </section>
      ) : (
        <section className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(300px,0.62fr)_minmax(0,1.38fr)]">
          <aside className="popup-surface rounded-3xl border border-[var(--glass-border)] p-4 xl:sticky xl:top-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--text-secondary)]">
                  {t('superAdminNetwork.fleetTitle')}
                </h3>
                <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">
                  {t('superAdminNetwork.fleetSubtitle')}
                </p>
              </div>
              <span className="text-[10px] text-[var(--text-muted)]">{filteredNodes.length}/{allNodes.length}</span>
            </div>

            <div className="relative mt-4">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                className={`${inputClass} py-2.5 pl-10`}
                value={nodeSearch}
                onChange={(event) => setNodeSearch(event.target.value)}
                placeholder={t('superAdminNetwork.searchNodes')}
              />
            </div>
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {['all', 'live', 'attention', 'conflict'].map((filter) => (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setNodeFilter(filter)}
                  className={`shrink-0 rounded-full border px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.13em] ${
                    nodeFilter === filter
                      ? 'border-[var(--accent-color)] bg-[color-mix(in_srgb,var(--accent-color)_14%,transparent)] text-[var(--text-primary)]'
                      : 'border-[var(--glass-border)] text-[var(--text-secondary)]'
                  }`}
                >
                  {t(`superAdminNetwork.filter.${filter}`)}
                </button>
              ))}
            </div>

            <div className="mt-4 flex gap-2 border-t border-[var(--glass-border)] pt-4">
              <select
                className={`${inputClass} min-w-0 py-2.5`}
                value={selectedClientId}
                onChange={(event) => setSelectedClientId(event.target.value)}
              >
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>{client.name || client.id}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleNew}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] hover:bg-[var(--glass-bg-hover)]"
                title={t('superAdminNetwork.newLocation')}
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 max-h-[64vh] space-y-2 overflow-y-auto pr-1 custom-scrollbar">
              {filteredNodes.map((node) => {
                const active = node.clientId === selectedClientId && node.locationId === selectedLocationId;
                return (
                  <button
                    key={`${node.clientId}/${node.locationId}`}
                    type="button"
                    onClick={() => {
                      setSelectedClientId(node.clientId);
                      setSelectedLocationId(node.locationId);
                    }}
                    className={`w-full rounded-2xl border px-4 py-3 text-left transition-colors ${
                      active
                        ? 'border-[var(--accent-color)] bg-[color-mix(in_srgb,var(--accent-color)_13%,var(--glass-bg))]'
                        : 'border-[var(--glass-border)] bg-[var(--glass-bg)] hover:bg-[var(--glass-bg-hover)]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{node.displayName}</p>
                        <p className="mt-1 truncate text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
                          {node.clientName} · {node.locationId}
                        </p>
                      </div>
                      <NodeStatusBadge status={node.status} t={t} />
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <span className="truncate text-[11px] text-[var(--text-secondary)]">
                        {node.domainFqdn || node.tunnelIp || t('superAdminNetwork.noAddress')}
                      </span>
                      {node.mobility ? (
                        <span className={`h-2 w-2 shrink-0 rounded-full ${node.mobility.online ? 'bg-emerald-400' : 'bg-red-400'}`} />
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          <div className="min-w-0 space-y-4">
            <section className="popup-surface rounded-3xl border border-[var(--glass-border)] p-4 md:p-5">
              <div className={`flex gap-4 ${isMobile ? 'flex-col' : 'items-start justify-between'}`}>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                    {selectedClient?.name || selectedClientId}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-semibold text-[var(--text-primary)]">{locationName}</h3>
                    {!isNew ? <NodeStatusBadge status={detail?.site?.status || selectedSummary?.status} t={t} /> : null}
                    {umrOnline ? <StatusBadge tone="good">{t('superAdminNetwork.mobility.umrOnline')}</StatusBadge> : null}
                  </div>
                  <p className="mt-2 text-xs text-[var(--text-secondary)]">
                    {t('superAdminNetwork.configuration')}: {configurationPercent}%
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleNew}
                    className="inline-flex items-center gap-2 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-3 py-2 text-xs font-bold uppercase tracking-[0.12em] hover:bg-[var(--glass-bg-hover)]"
                  >
                    <Plus className="h-4 w-4" />
                    {t('superAdminNetwork.newLocation')}
                  </button>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving || !form.locationId}
                    className="inline-flex items-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] text-emerald-100 disabled:opacity-45"
                  >
                    {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    {t('superAdminNetwork.save')}
                  </button>
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={!detail?.persisted || deleting}
                    className="inline-flex items-center rounded-xl border border-red-400/25 bg-red-400/[0.07] px-3 py-2 text-red-100 disabled:opacity-30"
                    title={t('superAdminNetwork.deleteConfig')}
                  >
                    {deleting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </section>

            <section className="popup-surface rounded-3xl border border-[var(--glass-border)] p-4 md:p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--text-secondary)]">
                    {t('superAdminNetwork.physical.title')}
                  </h3>
                  <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">
                    {t('superAdminNetwork.physical.subtitle')}
                  </p>
                </div>
                <MapPin className="h-4 w-4 text-[var(--text-muted)]" />
              </div>

              <div className="mt-4 flex flex-col gap-3 xl:flex-row xl:items-stretch">
                <DeviceNode
                  icon={Radio}
                  label={t('superAdminNetwork.physical.mobile')}
                  value={mobilitySnapshot?.device?.cellular?.carrier || t('superAdminNetwork.physical.fourG')}
                  detail={mobilitySnapshot?.device?.cellular?.technology || mobilitySnapshot?.device?.wan?.ipAddress}
                  status={umrOnline ? t('superAdminNetwork.map.live') : t('superAdminNetwork.map.missing')}
                  ready={umrOnline}
                />
                <Connector label="4G" active={umrOnline} />
                <DeviceNode
                  icon={Router}
                  label="UMR"
                  value={selectedMobilitySummary?.name || form.routerIp}
                  detail={form.umrMac || form.lanSubnet}
                  status={umrOnline
                    ? t('superAdminNetwork.mobility.umrOnline')
                    : (form.routerIp || form.umrMac
                      ? t('superAdminNetwork.map.configured')
                      : t('superAdminNetwork.map.missing'))}
                  ready={Boolean(form.routerIp)}
                  emphasized
                />
                <Connector label="LAN" active={Boolean(form.routerIp && form.lanSubnet)} />
                <DeviceNode
                  icon={Server}
                  label={t('superAdminNetwork.physical.switch')}
                  value={form.switchIp}
                  detail={form.switchMac}
                  status={switchClient?.online
                    ? t('superAdminNetwork.map.live')
                    : (form.switchIp || form.switchMac
                      ? t('superAdminNetwork.map.configured')
                      : t('superAdminNetwork.map.missing'))}
                  ready={Boolean(switchClient?.online || form.switchIp || form.switchMac)}
                />
                <Connector label="PoE" active={Boolean(form.haIp || form.knxIp)} />
                <div className="grid min-w-0 flex-[1.4] grid-cols-1 gap-3 sm:grid-cols-2">
                  <DeviceNode
                    icon={Cpu}
                    label="SMARTi Hub / HA"
                    value={form.haIp}
                    detail={form.haMac}
                    status={hubClient?.online
                      ? t('superAdminNetwork.map.live')
                      : (form.haIp || form.haMac
                        ? t('superAdminNetwork.map.configured')
                        : t('superAdminNetwork.map.missing'))}
                    ready={Boolean(hubClient?.online || form.haIp)}
                  />
                  <DeviceNode
                    icon={Zap}
                    label={t('superAdminNetwork.physical.knx')}
                    value={form.knxIp}
                    detail={form.knxMac}
                    status={knxClient?.online
                      ? t('superAdminNetwork.map.live')
                      : (form.knxIp || form.knxMac
                        ? t('superAdminNetwork.map.configured')
                        : t('superAdminNetwork.map.missing'))}
                    ready={Boolean(knxClient?.online || form.knxIp)}
                  />
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 rounded-2xl border border-[var(--glass-border)] bg-[color-mix(in_srgb,var(--bg-primary)_72%,transparent)] p-4 md:grid-cols-[1fr_auto_1fr_auto_1fr] md:items-center">
                <div>
                  <p className={labelClass}>{t('superAdminNetwork.logical.tunnel')}</p>
                  <p className="mt-1.5 text-sm text-[var(--text-primary)]">{form.tunnelIp || '-'} → {overview?.server?.publicHost || '-'}</p>
                </div>
                <span className="hidden text-[var(--text-muted)] md:block">→</span>
                <div>
                  <p className={labelClass}>{t('superAdminNetwork.logical.server')}</p>
                  <div className="mt-1.5 flex gap-2">
                    <StatusBadge tone={wireGuardApplied ? 'good' : 'neutral'}>WireGuard</StatusBadge>
                    <StatusBadge tone={caddyApplied ? 'good' : 'neutral'}>Caddy</StatusBadge>
                  </div>
                </div>
                <span className="hidden text-[var(--text-muted)] md:block">→</span>
                <div>
                  <p className={labelClass}>{t('superAdminNetwork.logical.access')}</p>
                  <p className="mt-1.5 truncate text-sm text-[var(--text-primary)]">{domainFqdn || '-'} → {form.haIp || '-'}:8123</p>
                </div>
              </div>
            </section>

            <section className="popup-surface rounded-3xl border border-[var(--glass-border)] p-3 md:p-4">
              <div className="flex gap-2 overflow-x-auto pb-1">
                <StepTab
                  step="1"
                  title={t('superAdminNetwork.steps.site')}
                  subtitle={t('superAdminNetwork.steps.siteHint')}
                  ready={stepReady[1]}
                  active={activeStep === 1}
                  onClick={() => setActiveStep(1)}
                />
                <StepTab
                  step="2"
                  title={t('superAdminNetwork.steps.wireGuard')}
                  subtitle={t('superAdminNetwork.steps.wireGuardHint')}
                  ready={stepReady[2]}
                  active={activeStep === 2}
                  onClick={() => setActiveStep(2)}
                />
                <StepTab
                  step="3"
                  title={t('superAdminNetwork.steps.server')}
                  subtitle={t('superAdminNetwork.steps.serverHint')}
                  ready={stepReady[3]}
                  active={activeStep === 3}
                  onClick={() => setActiveStep(3)}
                />
                <StepTab
                  step="4"
                  title={t('superAdminNetwork.steps.operations')}
                  subtitle={t('superAdminNetwork.steps.operationsHint')}
                  ready={stepReady[4]}
                  active={activeStep === 4}
                  onClick={() => setActiveStep(4)}
                />
              </div>
            </section>

            {activeStep === 1 ? (
              <section className="popup-surface rounded-3xl border border-[var(--glass-border)] p-4 md:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-[var(--text-primary)]">{t('superAdminNetwork.siteSetup.title')}</h3>
                    <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{t('superAdminNetwork.siteSetup.subtitle')}</p>
                  </div>
                  {loadingDetail ? <RefreshCw className="h-4 w-4 animate-spin text-[var(--text-muted)]" /> : <Wrench className="h-4 w-4 text-[var(--text-muted)]" />}
                </div>

                <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Field
                    label={t('superAdminNetwork.form.locationId')}
                    value={form.locationId}
                    onChange={(value) => setForm((current) => ({
                      ...current,
                      locationId: value,
                      backupLocationId: current.backupLocationId || value,
                    }))}
                    readOnly={!isNew}
                    placeholder="oslo-sentrum"
                  />
                  <Field label={t('superAdminNetwork.form.displayName')} value={form.displayName} onChange={(value) => updateField('displayName', value)} placeholder="Oslo Sentrum" />
                  <Field label={t('superAdminNetwork.form.lanSubnet')} value={form.lanSubnet} onChange={(value) => updateField('lanSubnet', value)} placeholder="192.168.107.0/24" />
                  <Field label={t('superAdminNetwork.form.umrLanIp')} value={form.routerIp} onChange={(value) => updateField('routerIp', value)} placeholder="192.168.107.1" />
                  <Field label={t('superAdminNetwork.form.umrMac')} value={form.umrMac} onChange={(value) => updateField('umrMac', value)} placeholder="aa:bb:cc:dd:ee:ff" />
                  <div className="hidden md:block" />
                </div>

                <div className="my-5 border-t border-[var(--glass-border)]" />
                <p className={labelClass}>{t('superAdminNetwork.siteSetup.equipment')}</p>
                <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Field label={t('superAdminNetwork.form.switchIp')} value={form.switchIp} onChange={(value) => updateField('switchIp', value)} placeholder="192.168.107.2" />
                  <Field label={t('superAdminNetwork.form.switchMac')} value={form.switchMac} onChange={(value) => updateField('switchMac', value)} placeholder="aa:bb:cc:dd:ee:ff" />
                  <Field label={t('superAdminNetwork.form.haIp')} value={form.haIp} onChange={(value) => updateField('haIp', value)} placeholder="192.168.107.120" />
                  <Field label={t('superAdminNetwork.form.haMac')} value={form.haMac} onChange={(value) => updateField('haMac', value)} placeholder="aa:bb:cc:dd:ee:ff" />
                  <Field label={t('superAdminNetwork.form.knxIp')} value={form.knxIp} onChange={(value) => updateField('knxIp', value)} placeholder="192.168.107.10" />
                  <Field label={t('superAdminNetwork.form.knxMac')} value={form.knxMac} onChange={(value) => updateField('knxMac', value)} placeholder="aa:bb:cc:dd:ee:ff" />
                </div>

                <div className="mt-6 rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[var(--text-primary)]">{t('superAdminNetwork.mobility.title')}</p>
                      <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{t('superAdminNetwork.mobility.subtitle')}</p>
                    </div>
                    <StatusBadge tone={mobilityInventory?.connected ? 'good' : 'neutral'}>
                      {mobilityInventory?.connected
                        ? t('superAdminNetwork.mobility.apiConnected')
                        : t('superAdminNetwork.mobility.apiDisconnected')}
                    </StatusBadge>
                  </div>

                  {!overview?.mobility?.configured ? (
                    <div className="mt-4 rounded-xl border border-amber-400/25 bg-amber-400/[0.07] px-4 py-3 text-xs leading-5 text-amber-100">
                      {t('superAdminNetwork.mobility.notConfigured')}
                    </div>
                  ) : (
                    <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                      <label className="flex flex-col gap-2">
                        <span className={labelClass}>{t('superAdminNetwork.mobility.workspace')}</span>
                        <select
                          className={inputClass}
                          value={form.mobilityWorkspaceId}
                          onChange={(event) => setForm((current) => ({
                            ...current,
                            mobilityWorkspaceId: event.target.value,
                            mobilityDeviceId: '',
                          }))}
                        >
                          <option value="">{t('superAdminNetwork.mobility.chooseWorkspace')}</option>
                          {(mobilityInventory?.workspaces || []).map((workspace) => (
                            <option key={workspace.id} value={workspace.id}>{workspace.name}</option>
                          ))}
                        </select>
                      </label>
                      <label className="flex flex-col gap-2">
                        <span className={labelClass}>{t('superAdminNetwork.mobility.device')}</span>
                        <select
                          className={inputClass}
                          value={form.mobilityDeviceId}
                          disabled={!form.mobilityWorkspaceId}
                          onChange={(event) => {
                            const device = workspaceDevices.find((entry) => entry.id === event.target.value);
                            setForm((current) => ({
                              ...current,
                              mobilityDeviceId: event.target.value,
                              umrMac: current.umrMac || device?.macAddress || '',
                            }));
                          }}
                        >
                          <option value="">{t('superAdminNetwork.mobility.chooseDevice')}</option>
                          {workspaceDevices.map((device) => (
                            <option key={device.id} value={device.id}>
                              {device.name}{device.model ? ` · ${device.model}` : ''}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  )}
                  {mobilityLoading ? <p className="mt-3 text-xs text-[var(--text-muted)]">{t('superAdminNetwork.mobility.loading')}</p> : null}
                  {mobilityError ? <p className="mt-3 text-xs text-red-200">{mobilityError}</p> : null}
                </div>
              </section>
            ) : null}

            {activeStep === 2 ? (
              <section className="popup-surface rounded-3xl border border-[var(--glass-border)] p-4 md:p-5">
                <div>
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">{t('superAdminNetwork.wireGuardSetup.title')}</h3>
                  <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{t('superAdminNetwork.wireGuardSetup.subtitle')}</p>
                </div>

                <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Field label={t('superAdminNetwork.form.tunnelIp')} value={form.tunnelIp} onChange={(value) => updateField('tunnelIp', value)} placeholder="10.88.0.5" />
                  <Field label={t('superAdminNetwork.form.lanSubnet')} value={form.lanSubnet} onChange={(value) => updateField('lanSubnet', value)} placeholder="192.168.107.0/24" />
                </div>

                <div className="mt-5 grid grid-cols-1 gap-4 2xl:grid-cols-[0.8fr_1.2fr]">
                  <div className="rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-4">
                    <p className={labelClass}>{t('superAdminNetwork.wireGuardSetup.flowTitle')}</p>
                    <div className="mt-4 space-y-5">
                      <Instruction number="1" title={t('superAdminNetwork.wireGuardSetup.saveTitle')} text={t('superAdminNetwork.wireGuardSetup.saveText')} />
                      <Instruction number="2" title={t('superAdminNetwork.wireGuardSetup.downloadTitle')} text={t('superAdminNetwork.wireGuardSetup.downloadText')} />
                      <Instruction number="3" title={t('superAdminNetwork.wireGuardSetup.importTitle')} text={t('superAdminNetwork.wireGuardSetup.importText')} />
                    </div>
                    <div className="mt-5 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={handleDownload}
                        disabled={!detail?.persisted || downloading || !detail?.artifacts?.umrConfig}
                        className="inline-flex items-center gap-2 rounded-xl border border-[var(--accent-color)] bg-[color-mix(in_srgb,var(--accent-color)_14%,transparent)] px-4 py-2.5 text-xs font-bold uppercase tracking-[0.12em] disabled:opacity-40"
                      >
                        {downloading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                        {t('superAdminNetwork.downloadUmr')}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleApply('wireguard')}
                        disabled={!detail?.persisted || !stepReady[2] || applying === 'wireguard'}
                        className="inline-flex items-center gap-2 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-4 py-2.5 text-xs font-bold uppercase tracking-[0.12em] disabled:opacity-40"
                      >
                        {applying === 'wireguard' ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Wifi className="h-4 w-4" />}
                        {t('superAdminNetwork.applyWireGuard')}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    <CodePanel
                      title={t('superAdminNetwork.preview.umr')}
                      value={detail?.artifacts?.umrConfig}
                      empty={detail?.artifacts?.umrConfigError || t('superAdminNetwork.preview.umrUnavailable')}
                    />
                    <CodePanel
                      title={t('superAdminNetwork.preview.wireGuard')}
                      value={wireGuardPeerPreview}
                      empty={t('superAdminNetwork.preview.empty')}
                    />
                  </div>
                </div>
              </section>
            ) : null}

            {activeStep === 3 ? (
              <section className="popup-surface rounded-3xl border border-[var(--glass-border)] p-4 md:p-5">
                <div>
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">{t('superAdminNetwork.serverSetup.title')}</h3>
                  <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{t('superAdminNetwork.serverSetup.subtitle')}</p>
                </div>

                <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Field label={t('superAdminNetwork.form.domainLabel')} value={form.domainLabel} onChange={(value) => updateField('domainLabel', value)} placeholder="oslo-sentrum" />
                  <Field label={t('superAdminNetwork.form.domainFqdn')} value={form.domainFqdn} onChange={(value) => updateField('domainFqdn', value)} placeholder={domainSuffix ? `oslo-sentrum.${domainSuffix}` : 'oslo-sentrum.smarti.dev'} />
                  <Field label={t('superAdminNetwork.form.haIp')} value={form.haIp} onChange={(value) => updateField('haIp', value)} placeholder="192.168.107.120" />
                  <Field label={t('superAdminNetwork.form.backupLocationId')} value={form.backupLocationId} onChange={(value) => updateField('backupLocationId', value)} placeholder={form.locationId} />
                </div>

                <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[0.8fr_1.2fr]">
                  <div className="space-y-3">
                    <div className="rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-4">
                      <p className={labelClass}>{t('superAdminNetwork.runtime.aRecord')}</p>
                      <p className="mt-2 break-all text-sm text-[var(--text-primary)]">{domainFqdn || '-'} → {overview?.server?.publicHost || '-'}</p>
                    </div>
                    <div className="rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-4">
                      <p className={labelClass}>{t('superAdminNetwork.runtime.backupPath')}</p>
                      <p className="mt-2 break-all text-sm text-[var(--text-primary)]">{backupPath}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handleApply('caddy')}
                        disabled={!detail?.persisted || !domainFqdn || !form.haIp || applying === 'caddy'}
                        className="inline-flex items-center gap-2 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-4 py-2.5 text-xs font-bold uppercase tracking-[0.12em] disabled:opacity-40"
                      >
                        {applying === 'caddy' ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
                        {t('superAdminNetwork.applyCaddy')}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleApply('all')}
                        disabled={!detail?.persisted || !stepReady[2] || !domainFqdn || !form.haIp || applying === 'all'}
                        className="inline-flex items-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-2.5 text-xs font-bold uppercase tracking-[0.12em] text-emerald-100 disabled:opacity-40"
                      >
                        {applying === 'all' ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Server className="h-4 w-4" />}
                        {t('superAdminNetwork.applyAll')}
                      </button>
                    </div>
                  </div>
                  <CodePanel
                    title={t('superAdminNetwork.preview.caddy')}
                    value={caddyPreview}
                    empty={t('superAdminNetwork.preview.empty')}
                  />
                </div>
              </section>
            ) : null}

            {activeStep === 4 ? (
              <section className="popup-surface rounded-3xl border border-[var(--glass-border)] p-4 md:p-5">
                <div>
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">{t('superAdminNetwork.operations.title')}</h3>
                  <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{t('superAdminNetwork.operations.subtitle')}</p>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <Metric
                    icon={Radio}
                    label={t('superAdminNetwork.operations.carrier')}
                    value={mobilitySnapshot?.device?.cellular?.carrier || '-'}
                    hint={mobilitySnapshot?.device?.cellular?.technology || '-'}
                    tone={umrOnline ? 'good' : 'neutral'}
                  />
                  <Metric
                    icon={Activity}
                    label={t('superAdminNetwork.operations.signal')}
                    value={mobilitySnapshot?.device?.cellular?.rsrp || mobilitySnapshot?.device?.cellular?.signal || '-'}
                    hint={mobilitySnapshot?.device?.cellular?.sinr ? `SINR ${mobilitySnapshot.device.cellular.sinr}` : '-'}
                  />
                  <Metric
                    icon={Globe}
                    label={t('superAdminNetwork.operations.wan')}
                    value={mobilitySnapshot?.device?.wan?.status || selectedMobilitySummary?.status || '-'}
                    hint={mobilitySnapshot?.device?.wan?.ipAddress || '-'}
                    tone={umrOnline ? 'good' : 'neutral'}
                  />
                  <Metric
                    icon={Monitor}
                    label={t('superAdminNetwork.operations.clients')}
                    value={String(mobilitySnapshot?.clients?.filter((client) => client.online).length || 0)}
                    hint={`${mobilitySnapshot?.clients?.length || 0} ${t('superAdminNetwork.operations.clientsKnown')}`}
                  />
                </div>

                {!form.mobilityDeviceId ? (
                  <div className="mt-4 rounded-2xl border border-dashed border-[var(--glass-border)] px-4 py-6 text-center text-sm text-[var(--text-secondary)]">
                    {t('superAdminNetwork.operations.connectUmr')}
                  </div>
                ) : null}

                {mobilitySnapshot?.clients?.length ? (
                  <div className="mt-4 overflow-hidden rounded-2xl border border-[var(--glass-border)]">
                    <div className="grid grid-cols-[1.2fr_0.8fr_0.8fr] gap-3 border-b border-[var(--glass-border)] bg-[var(--glass-bg)] px-4 py-2 text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                      <span>{t('superAdminNetwork.operations.device')}</span>
                      <span>IP</span>
                      <span>{t('superAdminNetwork.operations.status')}</span>
                    </div>
                    {mobilitySnapshot.clients.map((client) => (
                      <div key={client.id || client.macAddress} className="grid grid-cols-[1.2fr_0.8fr_0.8fr] gap-3 border-b border-[var(--glass-border)] px-4 py-3 text-xs last:border-b-0">
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-[var(--text-primary)]">{client.name}</p>
                          <p className="mt-1 truncate text-[10px] text-[var(--text-muted)]">{client.macAddress}</p>
                        </div>
                        <span className="truncate text-[var(--text-secondary)]">{client.ipAddress || '-'}</span>
                        <span><StatusBadge tone={client.online ? 'good' : client.blocked ? 'danger' : 'neutral'}>{client.status}</StatusBadge></span>
                      </div>
                    ))}
                  </div>
                ) : null}

                <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-2">
                  <CodePanel
                    title={t('superAdminNetwork.active.wireGuard')}
                    value={detail?.site?.runtime?.matchedPeer?.raw}
                    empty={t('superAdminNetwork.active.none')}
                  />
                  <CodePanel
                    title={t('superAdminNetwork.active.caddy')}
                    value={detail?.site?.runtime?.matchedCaddy?.raw}
                    empty={t('superAdminNetwork.active.none')}
                  />
                  <CodePanel
                    title={t('superAdminNetwork.operations.vpn')}
                    value={mobilitySnapshot?.device?.vpn ? JSON.stringify(mobilitySnapshot.device.vpn, null, 2) : ''}
                    empty={t('superAdminNetwork.operations.noVpnData')}
                    minHeight="120px"
                  />
                  <div className="rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-4">
                    <p className={labelClass}>{t('superAdminNetwork.operations.serverReadiness')}</p>
                    <div className="mt-4 space-y-3">
                      <div className="flex items-center justify-between gap-3 text-xs">
                        <span className="text-[var(--text-secondary)]">WireGuard</span>
                        <StatusBadge tone={wireGuardApplied ? 'good' : 'neutral'}>{wireGuardApplied ? t('superAdminNetwork.applied') : t('superAdminNetwork.pending')}</StatusBadge>
                      </div>
                      <div className="flex items-center justify-between gap-3 text-xs">
                        <span className="text-[var(--text-secondary)]">Caddy</span>
                        <StatusBadge tone={caddyApplied ? 'good' : 'neutral'}>{caddyApplied ? t('superAdminNetwork.applied') : t('superAdminNetwork.pending')}</StatusBadge>
                      </div>
                      <div className="flex items-center justify-between gap-3 text-xs">
                        <span className="text-[var(--text-secondary)]">{t('superAdminNetwork.runtime.backupPath')}</span>
                        <HardDrive className="h-4 w-4 text-[var(--text-muted)]" />
                      </div>
                      <p className="break-all text-[11px] text-[var(--text-muted)]">{backupPath}</p>
                    </div>
                  </div>
                </div>
              </section>
            ) : null}
          </div>
        </section>
      )}
    </div>
  );
}
