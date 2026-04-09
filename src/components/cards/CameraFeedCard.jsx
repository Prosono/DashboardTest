import React from 'react';
import { ArrowLeftRight, Camera, Maximize2, RefreshCw } from '../../icons';
import { getIconComponent } from '../../icons';
import CameraFeedModal from '../../modals/CameraFeedModal';
import { getCameraSnapshotUrl, getCameraStreamUrl, isCameraUnavailable } from '../../utils/cameraFeeds';

const clampRefreshSeconds = (value, fallback = 5) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(2, Math.min(60, Math.round(parsed)));
};

const makeTr = (t) => (key, fallback) => {
  const out = typeof t === 'function' ? t(key) : undefined;
  const str = String(out ?? '').trim();
  if (!str || str === key || str.toLowerCase() === key.toLowerCase() || str === str.toUpperCase() || str.includes('.')) {
    return fallback;
  }
  return str;
};

const formatTimeLabel = (value, locale) => {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  try {
    return new Intl.DateTimeFormat(locale || undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(date);
  } catch {
    return date.toLocaleTimeString();
  }
};

export default function CameraFeedCard({
  cardId,
  settingsKey,
  settings,
  entities,
  dragProps,
  controls,
  cardStyle,
  editMode,
  customNames,
  customIcons,
  getEntityImageUrl,
  saveCardSetting,
  language,
  t,
}) {
  const tr = React.useMemo(() => makeTr(t), [t]);
  const entityIds = React.useMemo(
    () => (Array.isArray(settings?.entityIds) ? settings.entityIds.filter(Boolean) : []),
    [settings?.entityIds],
  );
  const availableIds = React.useMemo(
    () => entityIds.filter((entityId) => entities?.[entityId]),
    [entityIds, entities],
  );

  const activeId = React.useMemo(() => {
    if (availableIds.includes(settings?.activeId)) return settings.activeId;
    return availableIds[0] || null;
  }, [availableIds, settings?.activeId]);

  const entity = activeId ? entities?.[activeId] : null;
  const refreshSeconds = clampRefreshSeconds(settings?.refreshSeconds, 5);
  const fitMode = settings?.fitMode === 'contain' ? 'contain' : 'cover';
  const unavailable = isCameraUnavailable(entity);
  const [transport, setTransport] = React.useState('stream');
  const [streamTick, setStreamTick] = React.useState(Date.now());
  const [snapshotTick, setSnapshotTick] = React.useState(Date.now());
  const [feedErrored, setFeedErrored] = React.useState(false);
  const [feedLoaded, setFeedLoaded] = React.useState(false);
  const [showCameraModal, setShowCameraModal] = React.useState(false);

  React.useEffect(() => {
    setTransport('stream');
    setStreamTick(Date.now());
    setSnapshotTick(Date.now());
    setFeedErrored(false);
    setFeedLoaded(false);
  }, [activeId]);

  React.useEffect(() => {
    if (transport !== 'snapshot') return undefined;
    const timer = window.setInterval(() => {
      setSnapshotTick(Date.now());
    }, refreshSeconds * 1000);
    return () => window.clearInterval(timer);
  }, [transport, refreshSeconds]);

  const streamUrl = React.useMemo(
    () => getCameraStreamUrl({ entityId: activeId, entity, getEntityImageUrl, cacheBust: streamTick }),
    [activeId, entity, getEntityImageUrl, streamTick],
  );
  const snapshotUrl = React.useMemo(
    () => getCameraSnapshotUrl({
      entityId: activeId,
      entity,
      getEntityImageUrl,
      cacheBust: snapshotTick,
    }),
    [activeId, entity, getEntityImageUrl, snapshotTick],
  );

  const feedSrc = transport === 'snapshot' ? snapshotUrl : streamUrl;
  const feedModeLabel = unavailable
    ? tr('status.unavailable', 'Utilgjengelig')
    : transport === 'stream'
      ? tr('camera.live', 'Direktebilde')
      : `${tr('camera.snapshot', 'Snapshot')} / ${refreshSeconds}s`;
  const cardLabel = customNames?.[cardId] || settings?.heading || settings?.title || tr('room.domain.camera', 'Kamera');
  const activeLabel = customNames?.[activeId] || entity?.attributes?.friendly_name || activeId || tr('camera.unavailable', 'Kamera ikke tilgjengelig');
  const secondaryLabel = cardLabel !== activeLabel ? cardLabel : tr('room.domain.camera', 'Kamera');
  const iconName = customIcons?.[cardId] || customIcons?.[activeId] || entity?.attributes?.icon;
  const Icon = iconName ? (getIconComponent(iconName) || Camera) : Camera;
  const lastUpdatedLabel = formatTimeLabel(entity?.last_updated || entity?.last_changed, language);

  const cycleCamera = (event) => {
    event.stopPropagation();
    if (availableIds.length < 2 || typeof saveCardSetting !== 'function') return;
    const currentIndex = availableIds.findIndex((entityId) => entityId === activeId);
    const nextEntityId = availableIds[(currentIndex + 1) % availableIds.length];
    saveCardSetting(settingsKey || cardId, 'activeId', nextEntityId);
  };

  const refreshFeed = (event) => {
    event.stopPropagation();
    setFeedErrored(false);
    setFeedLoaded(false);
    setTransport('stream');
    setStreamTick(Date.now());
  };

  const handleOpen = () => {
    if (editMode) return;
    setShowCameraModal(true);
  };

  const handleFeedError = () => {
    setFeedLoaded(false);
    if (transport === 'stream' && snapshotUrl) {
      setTransport('snapshot');
      setFeedErrored(false);
      setSnapshotTick(Date.now());
      return;
    }
    setFeedErrored(true);
  };

  const handleFeedLoad = () => {
    setFeedLoaded(true);
    setFeedErrored(false);
  };

  return (
    <div
      key={cardId}
      {...dragProps}
      data-haptic={editMode ? undefined : 'card'}
      onClick={handleOpen}
      className={`touch-feedback relative overflow-hidden rounded-3xl border font-sans h-full min-h-[17rem] ${
        editMode ? 'cursor-move' : 'cursor-pointer active:scale-[0.985]'
      }`}
      style={{
        ...cardStyle,
        color: 'var(--text-primary)',
        background: 'linear-gradient(155deg, rgba(7, 13, 20, 0.92) 0%, rgba(13, 25, 36, 0.9) 100%)',
        borderColor: 'rgba(148, 163, 184, 0.18)',
        boxShadow: '0 24px 60px rgba(2, 6, 23, 0.28)',
      }}
    >
      {controls}

      <div className="absolute inset-0">
        {feedSrc && !unavailable && !feedErrored ? (
          <img
            key={`${activeId}-${transport}-${transport === 'snapshot' ? snapshotTick : 'live'}`}
            src={feedSrc}
            alt={activeLabel}
            className="h-full w-full transition-transform duration-[1400ms] ease-out"
            style={{
              objectFit: fitMode,
              transform: feedLoaded ? 'scale(1.01)' : 'scale(1.035)',
              filter: transport === 'stream' ? 'saturate(0.94) contrast(1.05)' : 'saturate(0.9)',
            }}
            onLoad={handleFeedLoad}
            onError={handleFeedError}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.18),_transparent_50%),linear-gradient(180deg,rgba(15,23,42,0.86),rgba(2,6,23,0.96))]">
            <div className="flex flex-col items-center gap-4 px-6 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-3xl border border-white/10 bg-white/5">
                <Icon className="h-8 w-8 text-white/70" />
              </div>
              <div>
                <div className="text-sm font-semibold text-white/90">
                  {unavailable ? tr('camera.unavailable', 'Kamera ikke tilgjengelig') : tr('camera.feedUnavailable', 'Kunne ikke laste kamerafeed')}
                </div>
                <div className="mt-1 text-xs text-white/55">
                  {unavailable
                    ? tr('camera.checkSource', 'Sjekk at kameraet er tilgjengelig i Home Assistant.')
                    : tr('camera.tryRefresh', 'Prov igjen eller bruk snapshot-fallback.')}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(3,7,18,0.28),rgba(3,7,18,0.08)_28%,rgba(3,7,18,0.55)_64%,rgba(3,7,18,0.92))]" />
        <div className="absolute inset-x-0 top-0 h-24 bg-[linear-gradient(180deg,rgba(3,7,18,0.68),transparent)]" />
        {!feedLoaded && feedSrc && !unavailable && !feedErrored && (
          <div className="absolute inset-0 animate-pulse bg-white/[0.05]" />
        )}
      </div>

      <div className="relative z-10 flex h-full flex-col justify-between p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.28em] ${
              unavailable
                ? 'border-rose-400/30 bg-rose-500/18 text-rose-100'
                : transport === 'stream'
                  ? 'border-emerald-400/28 bg-emerald-500/20 text-emerald-50'
                  : 'border-amber-300/28 bg-amber-400/18 text-amber-50'
            }`}>
              <span className={`h-2 w-2 rounded-full ${unavailable ? 'bg-rose-300' : transport === 'stream' ? 'bg-emerald-300 animate-pulse' : 'bg-amber-200'}`} />
              <span className="truncate">{feedModeLabel}</span>
            </div>
          </div>

          {!editMode && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={refreshFeed}
                className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-black/25 text-white/85 backdrop-blur-md transition hover:bg-black/35"
                aria-label={tr('common.refresh', 'Oppdater')}
              >
                <RefreshCw className="h-4 w-4" />
              </button>
              {availableIds.length > 1 && (
                <button
                  type="button"
                  onClick={cycleCamera}
                  className="inline-flex h-10 items-center gap-2 rounded-2xl border border-white/10 bg-black/25 px-3 text-white/90 backdrop-blur-md transition hover:bg-black/35"
                >
                  <ArrowLeftRight className="h-4 w-4" />
                  <span className="text-xs font-bold">{availableIds.length}</span>
                </button>
              )}
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  handleOpen();
                }}
                className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-black/25 text-white/90 backdrop-blur-md transition hover:bg-black/35"
                aria-label={tr('common.open', 'Åpne')}
              >
                <Maximize2 className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="max-w-[85%]">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.28em] text-white/55">
              <Icon className="h-4 w-4" />
              <span className="truncate">{secondaryLabel}</span>
            </div>
            <h3 className="mt-3 text-2xl font-semibold leading-tight text-white drop-shadow-[0_6px_20px_rgba(0,0,0,0.4)]">
              {activeLabel}
            </h3>
          </div>

          <div className="flex flex-wrap gap-2">
            <div className="rounded-2xl border border-white/10 bg-black/30 px-3 py-2 backdrop-blur-md">
              <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-white/45">
                {tr('common.status', 'Status')}
              </div>
              <div className="mt-1 text-sm font-semibold text-white/92">
                {entity?.state || tr('common.unknown', 'Ukjent')}
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/30 px-3 py-2 backdrop-blur-md">
              <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-white/45">
                {tr('camera.lastChecked', 'Sist oppdatert')}
              </div>
              <div className="mt-1 text-sm font-semibold text-white/92">
                {lastUpdatedLabel}
              </div>
            </div>
          </div>
        </div>
      </div>

      {showCameraModal && entity && (
        <CameraFeedModal
          entityId={activeId}
          entity={entity}
          onClose={() => setShowCameraModal(false)}
          t={t}
          getEntityImageUrl={getEntityImageUrl}
        />
      )}
    </div>
  );
}
