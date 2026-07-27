import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Archive,
  Cloud,
  Cpu,
  Globe,
  Radio,
  Router,
  Server,
  Shield,
  Zap,
} from '../../icons';
import { buildNetworkSystemMap } from './networkSystemMapModel';

const ICONS = {
  activity: Activity,
  archive: Archive,
  cloud: Cloud,
  cpu: Cpu,
  globe: Globe,
  radio: Radio,
  router: Router,
  server: Server,
  shield: Shield,
  zap: Zap,
};

const NODE_POSITIONS = {
  cellular: { column: 1, row: 1, x: 8.33, y: 16.66 },
  umr: { column: 2, row: 1, x: 25, y: 16.66 },
  wireguard: { column: 3, row: 1, x: 41.66, y: 16.66 },
  server: { column: 4, row: 1, x: 58.33, y: 16.66 },
  caddy: { column: 5, row: 1, x: 75, y: 16.66 },
  domain: { column: 6, row: 1, x: 91.66, y: 16.66 },
  hub: { column: 2, row: 2, x: 25, y: 50 },
  knx: { column: 3, row: 2, x: 41.66, y: 50 },
  equipment: { column: 4, row: 2, x: 58.33, y: 50 },
  backup: { column: 4, row: 3, x: 58.33, y: 83.33 },
};

const MOBILE_NODE_ORDER = [
  'cellular',
  'umr',
  'hub',
  'knx',
  'equipment',
  'wireguard',
  'server',
  'caddy',
  'domain',
  'backup',
];

const statusClasses = {
  healthy: 'border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-text)]',
  configured: 'border-[color-mix(in_srgb,var(--accent-color)_35%,var(--glass-border))] bg-[color-mix(in_srgb,var(--accent-color)_11%,var(--glass-bg))] text-[var(--text-primary)]',
  degraded: 'border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[var(--status-warning-text)]',
  offline: 'border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] text-[var(--status-danger-text)]',
  unknown: 'border-[var(--status-neutral-border)] bg-[var(--status-neutral-bg)] text-[var(--status-neutral-text)]',
};

const statusDotClasses = {
  healthy: 'bg-[var(--status-success-text)]',
  configured: 'bg-[var(--accent-color)]',
  degraded: 'bg-[var(--status-warning-text)]',
  offline: 'bg-[var(--status-danger-text)]',
  unknown: 'bg-[var(--status-neutral-text)]',
};

const statusStroke = {
  healthy: 'var(--status-success-text)',
  configured: 'var(--accent-color)',
  degraded: 'var(--status-warning-text)',
  offline: 'var(--status-danger-text)',
  unknown: 'var(--glass-border)',
};

const focusClass = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-primary)]';

const formatBytes = (value) => {
  const size = Number(value || 0);
  if (!Number.isFinite(size) || size <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let current = size;
  let index = 0;
  while (current >= 1024 && index < units.length - 1) {
    current /= 1024;
    index += 1;
  }
  return `${current.toFixed(current >= 100 || index === 0 ? 0 : 1)} ${units[index]}`;
};

const formatValue = (value, format) => {
  if (format === 'bytes') return formatBytes(value);
  const text = String(value ?? '').trim();
  if (!text) return '-';
  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) {
    const date = new Date(text);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    }
  }
  return text;
};

function StatusLabel({ status, t, compact = false }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border ${compact ? 'px-2 py-1 text-[8px]' : 'px-2.5 py-1 text-[9px]'} font-bold uppercase tracking-[0.12em] ${statusClasses[status] || statusClasses.unknown}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${statusDotClasses[status] || statusDotClasses.unknown}`} />
      {t(`superAdminNetwork.systemMap.status.${status}`)}
    </span>
  );
}

function MapNode({ entry, selected, onSelect, t, compact = false }) {
  const Icon = ICONS[entry.icon] || Activity;
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onSelect(entry.id)}
      className={`relative z-10 min-w-0 text-left transition-[transform,background-color,border-color] duration-200 hover:-translate-y-0.5 ${focusClass} ${
        compact
          ? 'min-h-24 w-full rounded-2xl border px-4 py-3.5'
          : 'mx-1 min-h-28 rounded-2xl border px-3 py-3'
      } ${statusClasses[entry.status] || statusClasses.unknown} ${
        selected ? 'ring-2 ring-[var(--accent-color)] ring-offset-2 ring-offset-[var(--bg-primary)]' : ''
      }`}
      style={compact ? undefined : {
        gridColumn: NODE_POSITIONS[entry.id]?.column,
        gridRow: NODE_POSITIONS[entry.id]?.row,
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={`${compact ? 'text-[10px]' : 'text-[8px]'} font-bold uppercase tracking-[0.15em] opacity-75`}>
            {t(entry.labelKey)}
          </p>
          <p className={`mt-2 break-words font-semibold text-[var(--text-primary)] ${compact ? 'text-sm' : 'text-xs'}`}>
            {formatValue(entry.value)}
          </p>
        </div>
        <Icon className="h-4 w-4 shrink-0 opacity-80" />
      </div>
      {entry.detail ? (
        <p className={`mt-1.5 break-all leading-4 opacity-80 ${compact ? 'text-[11px]' : 'text-[9px]'}`}>
          {formatValue(entry.detail)}
        </p>
      ) : null}
      <div className="mt-3">
        <StatusLabel status={entry.status} t={t} compact />
      </div>
    </button>
  );
}

function DesktopTopology({ map, selectedNodeId, onSelect, t }) {
  return (
    <div
      className="relative hidden min-h-[570px] overflow-hidden rounded-2xl border border-[var(--glass-border)] bg-[color-mix(in_srgb,var(--bg-primary)_72%,transparent)] p-5 lg:block"
      style={{
        backgroundImage: 'linear-gradient(color-mix(in srgb, var(--glass-border) 36%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in srgb, var(--glass-border) 36%, transparent) 1px, transparent 1px)',
        backgroundSize: '28px 28px',
      }}
    >
      <svg
        className="pointer-events-none absolute inset-5 h-[calc(100%-2.5rem)] w-[calc(100%-2.5rem)]"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        role="img"
        aria-label={t('superAdminNetwork.systemMap.connectionsAria')}
      >
        <title>{t('superAdminNetwork.systemMap.connectionsAria')}</title>
        {map.edges.map((edge) => {
          const from = NODE_POSITIONS[edge.from];
          const to = NODE_POSITIONS[edge.to];
          if (!from || !to) return null;
          return (
            <line
              key={edge.id}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke={statusStroke[edge.status] || statusStroke.unknown}
              strokeWidth={edge.status === 'healthy' ? 0.34 : 0.24}
              strokeDasharray={edge.status === 'healthy' ? undefined : '1.1 0.9'}
              vectorEffect="non-scaling-stroke"
              opacity={edge.status === 'unknown' ? 0.45 : 0.72}
            />
          );
        })}
      </svg>

      <div className="relative grid min-h-[530px] grid-cols-6 grid-rows-3 gap-x-2 gap-y-10">
        {map.nodes.map((entry) => (
          <MapNode
            key={entry.id}
            entry={entry}
            selected={entry.id === selectedNodeId}
            onSelect={onSelect}
            t={t}
          />
        ))}
      </div>

      <div className="pointer-events-none absolute bottom-3 left-4 flex flex-wrap gap-x-4 gap-y-1 text-[8px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
        {map.edges.map((edge) => (
          <span key={edge.id}>{t(edge.labelKey)}</span>
        ))}
      </div>
    </div>
  );
}

function MobileTopology({ map, selectedNodeId, onSelect, t }) {
  const nodes = MOBILE_NODE_ORDER
    .map((id) => map.nodes.find((entry) => entry.id === id))
    .filter(Boolean);
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:hidden">
      {nodes.map((entry) => (
        <MapNode
          key={entry.id}
          entry={entry}
          selected={entry.id === selectedNodeId}
          onSelect={onSelect}
          t={t}
          compact
        />
      ))}
    </div>
  );
}

function NodeDetails({ entry, edges, nodes, onSelect, t }) {
  if (!entry) return null;
  const Icon = ICONS[entry.icon] || Activity;
  const connected = edges
    .filter((edge) => edge.from === entry.id || edge.to === entry.id)
    .map((edge) => {
      const peerId = edge.from === entry.id ? edge.to : edge.from;
      return {
        edge,
        peer: nodes.find((candidate) => candidate.id === peerId),
      };
    })
    .filter((item) => item.peer);
  const facts = entry.facts.filter((fact) => (
    fact.valueKey || fact.value === 0 || Boolean(String(fact.value ?? '').trim())
  ));

  return (
    <aside className="rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[9px] font-bold uppercase tracking-[0.17em] text-[var(--text-muted)]">
            {t('superAdminNetwork.systemMap.selectedComponent')}
          </p>
          <h4 className="mt-2 text-base font-semibold text-[var(--text-primary)]">{t(entry.labelKey)}</h4>
        </div>
        <Icon className="h-5 w-5 shrink-0 text-[var(--text-secondary)]" />
      </div>

      <div className="mt-4">
        <StatusLabel status={entry.status} t={t} />
      </div>
      <p className="mt-3 text-xs leading-5 text-[var(--text-secondary)]">{t(entry.evidenceKey)}</p>

      {facts.length ? (
        <dl className="mt-5 divide-y divide-[var(--glass-border)] border-y border-[var(--glass-border)]">
          {facts.map((fact) => (
            <div key={fact.labelKey} className="grid gap-1 py-3 sm:grid-cols-[110px_minmax(0,1fr)] sm:gap-3">
              <dt className="text-[9px] font-bold uppercase tracking-[0.13em] text-[var(--text-muted)]">
                {t(fact.labelKey)}
              </dt>
              <dd className="break-all text-xs leading-5 text-[var(--text-primary)]">
                {fact.valueKey ? t(fact.valueKey) : formatValue(fact.value, fact.format)}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      {connected.length ? (
        <div className="mt-5">
          <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-[var(--text-muted)]">
            {t('superAdminNetwork.systemMap.directConnections')}
          </p>
          <div className="mt-2 space-y-2">
            {connected.map(({ edge, peer }) => (
              <button
                key={edge.id}
                type="button"
                onClick={() => onSelect(peer.id)}
                className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-[var(--glass-border)] px-3 py-2 text-left transition-colors hover:bg-[var(--glass-bg-hover)] ${focusClass}`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-xs font-semibold text-[var(--text-primary)]">{t(peer.labelKey)}</span>
                  <span className="mt-0.5 block text-[9px] uppercase tracking-[0.12em] text-[var(--text-muted)]">{t(edge.labelKey)}</span>
                </span>
                <span className={`h-2 w-2 shrink-0 rounded-full ${statusDotClasses[edge.status] || statusDotClasses.unknown}`} />
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </aside>
  );
}

export default function NetworkSystemMap({
  t,
  site,
  overview,
  detail,
  mobilitySummary,
  mobilitySnapshot,
  hubClient,
  knxClient,
}) {
  const map = useMemo(() => buildNetworkSystemMap({
    site,
    overview,
    detail,
    mobilitySummary,
    mobilitySnapshot,
    hubClient,
    knxClient,
  }), [detail, hubClient, knxClient, mobilitySnapshot, mobilitySummary, overview, site]);
  const siteKey = `${site?.clientId || ''}:${site?.locationId || ''}`;
  const [selectedNodeId, setSelectedNodeId] = useState('umr');

  useEffect(() => {
    setSelectedNodeId('umr');
  }, [siteKey]);

  const selectedNode = map.nodes.find((entry) => entry.id === selectedNodeId) || map.nodes[0];
  const generatedAt = detail?.generatedAt || overview?.generatedAt || '';

  return (
    <section className="popup-surface rounded-3xl border border-[var(--glass-border)] p-4 md:p-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="max-w-3xl">
          <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--accent-color)]">
            {t('superAdminNetwork.systemMap.eyebrow')}
          </p>
          <h3 className="mt-2 text-lg font-semibold tracking-tight text-[var(--text-primary)]">
            {t('superAdminNetwork.systemMap.title')}
          </h3>
          <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">
            {t('superAdminNetwork.systemMap.subtitle')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {['healthy', 'configured', 'degraded', 'offline', 'unknown'].map((status) => (
            <StatusLabel key={status} status={status} t={t} compact />
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-y border-[var(--glass-border)] py-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-secondary)]">
          {map.nodes.length} {t('superAdminNetwork.systemMap.components')}
          <span className="mx-2 text-[var(--text-muted)]">·</span>
          {Number(map.counts.healthy || 0)} {t('superAdminNetwork.systemMap.verified')}
        </p>
        <p className="text-[10px] text-[var(--text-muted)]">
          {t('superAdminNetwork.systemMap.updated')}: {formatValue(generatedAt)}
        </p>
      </div>

      <div className="mt-4 grid min-w-0 gap-4 2xl:grid-cols-[minmax(0,1fr)_330px]">
        <div className="min-w-0">
          <DesktopTopology map={map} selectedNodeId={selectedNode?.id} onSelect={setSelectedNodeId} t={t} />
          <MobileTopology map={map} selectedNodeId={selectedNode?.id} onSelect={setSelectedNodeId} t={t} />
        </div>
        <NodeDetails
          entry={selectedNode}
          edges={map.edges}
          nodes={map.nodes}
          onSelect={setSelectedNodeId}
          t={t}
        />
      </div>
    </section>
  );
}

