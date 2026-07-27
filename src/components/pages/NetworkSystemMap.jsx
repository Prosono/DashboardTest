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

const TOPOLOGY_LAYOUTS = {
  edge_hub: {
    rows: 4,
    minHeight: 680,
    positions: {
      cellular: { column: 1, row: 1, x: 10, y: 12.5 },
      umr: { column: 2, row: 1, x: 30, y: 12.5 },
      wireguard: { column: 3, row: 1, x: 50, y: 12.5 },
      server: { column: 4, row: 1, x: 70, y: 12.5 },
      caddy: { column: 5, row: 1, x: 90, y: 12.5 },
      hub: { column: 2, row: 2, x: 30, y: 37.5 },
      backup: { column: 4, row: 2, x: 70, y: 37.5 },
      domain: { column: 5, row: 2, x: 90, y: 37.5 },
      knx: { column: 2, row: 3, x: 30, y: 62.5 },
      equipment: { column: 2, row: 4, x: 30, y: 87.5 },
    },
    mobileOrder: ['cellular', 'umr', 'hub', 'knx', 'equipment', 'wireguard', 'server', 'caddy', 'domain', 'backup'],
  },
  legacy_mqtt: {
    rows: 3,
    minHeight: 540,
    positions: {
      equipment: { column: 1, row: 1, x: 10, y: 16.7 },
      knx: { column: 2, row: 1, x: 30, y: 16.7 },
      cedalo: { column: 3, row: 1, x: 50, y: 16.7 },
      mqttTopics: { column: 4, row: 1, x: 70, y: 16.7 },
      cloudHa: { column: 5, row: 1, x: 90, y: 16.7 },
      backup: { column: 4, row: 2, x: 70, y: 50 },
      proxmox: { column: 5, row: 2, x: 90, y: 50 },
      domain: { column: 5, row: 3, x: 90, y: 83.3 },
    },
    mobileOrder: ['equipment', 'knx', 'cedalo', 'mqttTopics', 'proxmox', 'cloudHa', 'domain', 'backup'],
  },
};

const getTopologyLayout = (architectureType) => (
  TOPOLOGY_LAYOUTS[architectureType] || TOPOLOGY_LAYOUTS.edge_hub
);

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
    <span className={`inline-flex items-center gap-1.5 rounded-full border ${compact ? 'px-2.5 py-1 text-[9px]' : 'px-3 py-1.5 text-[10px]'} font-bold uppercase tracking-[0.1em] ${statusClasses[status] || statusClasses.unknown}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${statusDotClasses[status] || statusDotClasses.unknown}`} />
      {t(`superAdminNetwork.systemMap.status.${status}`)}
    </span>
  );
}

function MapNode({ entry, selected, onSelect, t, compact = false, positions = {} }) {
  const Icon = ICONS[entry.icon] || Activity;
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onSelect(entry.id)}
      className={`relative z-10 min-w-0 text-left transition-[transform,background-color,border-color] duration-200 hover:-translate-y-0.5 ${focusClass} ${
        compact
          ? 'min-h-28 w-full rounded-2xl border px-4 py-4'
          : 'mx-1 min-h-32 rounded-2xl border px-4 py-4'
      } ${statusClasses[entry.status] || statusClasses.unknown} ${
        selected ? 'ring-2 ring-[var(--accent-color)] ring-offset-2 ring-offset-[var(--bg-primary)]' : ''
      }`}
      style={compact ? undefined : {
        gridColumn: positions[entry.id]?.column,
        gridRow: positions[entry.id]?.row,
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase leading-4 tracking-[0.13em] opacity-75">
            {t(entry.labelKey)}
          </p>
          <p className="mt-2 break-words text-sm font-semibold leading-5 text-[var(--text-primary)]">
            {entry.valueKey ? t(entry.valueKey) : formatValue(entry.value)}
          </p>
        </div>
        <Icon className="h-4 w-4 shrink-0 opacity-80" />
      </div>
      {entry.detail || entry.detailKey ? (
        <p className="mt-1.5 break-words text-[11px] leading-4 opacity-80">
          {entry.detailKey ? t(entry.detailKey) : formatValue(entry.detail)}
        </p>
      ) : null}
      <div className="mt-3">
        <StatusLabel status={entry.status} t={t} compact />
      </div>
    </button>
  );
}

function DesktopTopology({ map, selectedNodeId, onSelect, t }) {
  const layout = getTopologyLayout(map.architectureType);
  const innerMinHeight = layout.minHeight - 48;
  return (
    <div
      className="network-system-map__desktop overflow-hidden rounded-2xl border border-[var(--glass-border)] bg-[color-mix(in_srgb,var(--bg-primary)_72%,transparent)]"
      style={{
        backgroundImage: 'linear-gradient(color-mix(in srgb, var(--glass-border) 36%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in srgb, var(--glass-border) 36%, transparent) 1px, transparent 1px)',
        backgroundSize: '28px 28px',
      }}
    >
      <div className="relative p-6" style={{ minHeight: layout.minHeight }}>
        <svg
          className="pointer-events-none absolute inset-6 h-[calc(100%-3rem)] w-[calc(100%-3rem)]"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          role="img"
          aria-label={t('superAdminNetwork.systemMap.connectionsAria')}
        >
          <title>{t('superAdminNetwork.systemMap.connectionsAria')}</title>
          {map.edges.map((edge) => {
            const from = layout.positions[edge.from];
            const to = layout.positions[edge.to];
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

        <div
          className="relative grid grid-cols-5 gap-x-4 gap-y-6"
          style={{
            minHeight: innerMinHeight,
            gridTemplateRows: `repeat(${layout.rows}, minmax(0, 1fr))`,
          }}
        >
          {map.nodes.map((entry) => (
            <MapNode
              key={entry.id}
              entry={entry}
              selected={entry.id === selectedNodeId}
              onSelect={onSelect}
              t={t}
              positions={layout.positions}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-[var(--glass-border)] bg-[color-mix(in_srgb,var(--bg-primary)_78%,transparent)] px-6 py-4 text-[9px] font-semibold uppercase tracking-[0.11em] text-[var(--text-muted)]">
        {map.edges.map((edge) => (
          <span key={edge.id} className="inline-flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${statusDotClasses[edge.status] || statusDotClasses.unknown}`} />
            {t(edge.labelKey)}
          </span>
        ))}
      </div>
    </div>
  );
}

function MobileTopology({ map, selectedNodeId, onSelect, t }) {
  const layout = getTopologyLayout(map.architectureType);
  const nodes = layout.mobileOrder
    .map((id) => map.nodes.find((entry) => entry.id === id))
    .filter(Boolean);
  return (
    <div className="network-system-map__compact-grid">
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
    <aside className="rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-5 md:p-6">
      <div className="network-system-map__details-grid">
        <div className="min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                {t('superAdminNetwork.systemMap.selectedComponent')}
              </p>
              <h4 className="mt-2 text-lg font-semibold text-[var(--text-primary)]">{t(entry.labelKey)}</h4>
            </div>
            <Icon className="h-5 w-5 shrink-0 text-[var(--text-secondary)]" />
          </div>

          <div className="mt-4">
            <StatusLabel status={entry.status} t={t} />
          </div>
          <p className="mt-4 max-w-xl text-sm leading-6 text-[var(--text-secondary)]">{t(entry.evidenceKey)}</p>
        </div>

        <div className="network-system-map__details-section min-w-0">
          {facts.length ? (
            <>
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--text-muted)]">
                {t('superAdminNetwork.systemMap.componentDetails')}
              </p>
              <dl className="mt-2 divide-y divide-[var(--glass-border)] border-y border-[var(--glass-border)]">
                {facts.map((fact) => (
                  <div key={fact.labelKey} className="grid gap-1 py-3 sm:grid-cols-[120px_minmax(0,1fr)] sm:gap-4">
                    <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                      {t(fact.labelKey)}
                    </dt>
                    <dd className="break-words text-sm leading-5 text-[var(--text-primary)]">
                      {fact.valueKey ? t(fact.valueKey) : formatValue(fact.value, fact.format)}
                    </dd>
                  </div>
                ))}
              </dl>
            </>
          ) : null}
        </div>

        <div className="network-system-map__details-section min-w-0">
          {connected.length ? (
            <>
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--text-muted)]">
                {t('superAdminNetwork.systemMap.directConnections')}
              </p>
              <div className="mt-3 grid gap-2">
                {connected.map(({ edge, peer }) => (
                  <button
                    key={edge.id}
                    type="button"
                    onClick={() => onSelect(peer.id)}
                    className={`flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border border-[var(--glass-border)] px-4 py-3 text-left transition-colors hover:bg-[var(--glass-bg-hover)] ${focusClass}`}
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-[var(--text-primary)]">{t(peer.labelKey)}</span>
                      <span className="mt-1 block text-[10px] uppercase tracking-[0.11em] text-[var(--text-muted)]">{t(edge.labelKey)}</span>
                    </span>
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${statusDotClasses[edge.status] || statusDotClasses.unknown}`} />
                  </button>
                ))}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </aside>
  );
}

function SystemMapLegend({ map, t }) {
  return (
    <div className="flex flex-wrap gap-2">
      {['healthy', 'configured', 'degraded', 'offline', 'unknown'].map((status) => (
        <StatusLabel
          key={status}
          status={status}
          t={t}
          compact
        />
      ))}
      {!map.nodes.length ? (
        <span className="text-xs text-[var(--text-muted)]">-</span>
      ) : null}
    </div>
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
  const defaultNodeId = map.architectureType === 'legacy_mqtt' ? 'knx' : 'umr';
  const [selectedNodeId, setSelectedNodeId] = useState(defaultNodeId);

  useEffect(() => {
    setSelectedNodeId(defaultNodeId);
  }, [defaultNodeId, siteKey]);

  const selectedNode = map.nodes.find((entry) => entry.id === selectedNodeId) || map.nodes[0];
  const generatedAt = detail?.generatedAt || overview?.generatedAt || '';

  return (
    <section className="network-system-map popup-surface rounded-3xl border border-[var(--glass-border)] p-4 md:p-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="max-w-3xl">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--accent-color)]">
              {t('superAdminNetwork.systemMap.eyebrow')}
            </p>
            <span className="rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg)] px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
              {t(`superAdminNetwork.architecture.${map.architectureType}.short`)}
            </span>
          </div>
          <h3 className="mt-2 text-lg font-semibold tracking-tight text-[var(--text-primary)]">
            {t('superAdminNetwork.systemMap.title')}
          </h3>
          <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">
            {t(`superAdminNetwork.systemMap.subtitle.${map.architectureType}`)}
          </p>
        </div>
        <SystemMapLegend map={map} t={t} />
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

      <div className="mt-5 min-w-0">
        <DesktopTopology map={map} selectedNodeId={selectedNode?.id} onSelect={setSelectedNodeId} t={t} />
        <MobileTopology map={map} selectedNodeId={selectedNode?.id} onSelect={setSelectedNodeId} t={t} />
      </div>
      <div className="mt-5">
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
