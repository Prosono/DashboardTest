import React from 'react';
import { RefreshCw, X } from '../icons';
import { getCameraSnapshotUrl, getCameraStreamUrl, isCameraUnavailable } from '../utils/cameraFeeds';

const makeTr = (t) => (key, fallback) => {
  const out = typeof t === 'function' ? t(key) : undefined;
  const str = String(out ?? '').trim();
  if (!str || str === key || str.toLowerCase() === key.toLowerCase() || str === str.toUpperCase() || str.includes('.')) {
    return fallback;
  }
  return str;
};

export default function CameraFeedModal({
  entityId,
  entity,
  onClose,
  t,
  getEntityImageUrl,
}) {
  const tr = React.useMemo(() => makeTr(t), [t]);
  const unavailable = isCameraUnavailable(entity);
  const [transport, setTransport] = React.useState('stream');
  const [streamTick, setStreamTick] = React.useState(Date.now());
  const [snapshotTick, setSnapshotTick] = React.useState(Date.now());
  const [feedLoaded, setFeedLoaded] = React.useState(false);
  const [feedErrored, setFeedErrored] = React.useState(false);

  React.useEffect(() => {
    if (!entityId) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [entityId, onClose]);

  React.useEffect(() => {
    setTransport('stream');
    setStreamTick(Date.now());
    setSnapshotTick(Date.now());
    setFeedLoaded(false);
    setFeedErrored(false);
  }, [entityId]);

  React.useEffect(() => {
    if (transport !== 'snapshot') return undefined;
    const timer = window.setInterval(() => {
      setSnapshotTick(Date.now());
    }, 4000);
    return () => window.clearInterval(timer);
  }, [transport]);

  const streamUrl = React.useMemo(
    () => getCameraStreamUrl({ entityId, entity, getEntityImageUrl, cacheBust: streamTick }),
    [entityId, entity, getEntityImageUrl, streamTick],
  );
  const snapshotUrl = React.useMemo(
    () => getCameraSnapshotUrl({ entityId, entity, getEntityImageUrl, cacheBust: snapshotTick }),
    [entityId, entity, getEntityImageUrl, snapshotTick],
  );
  const feedSrc = transport === 'snapshot' ? snapshotUrl : streamUrl;
  const name = entity?.attributes?.friendly_name || entityId || tr('room.domain.camera', 'Kamera');

  const reconnectStream = (event) => {
    event?.stopPropagation?.();
    setFeedErrored(false);
    setFeedLoaded(false);
    setTransport('stream');
    setStreamTick(Date.now());
  };

  const handleFeedError = () => {
    setFeedLoaded(false);
    if (transport === 'stream' && snapshotUrl) {
      setTransport('snapshot');
      setSnapshotTick(Date.now());
      setFeedErrored(false);
      return;
    }
    setFeedErrored(true);
  };

  const handleFeedLoad = () => {
    setFeedLoaded(true);
    setFeedErrored(false);
  };

  if (!entityId || !entity) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center p-3 sm:p-5 md:p-8"
      style={{ backgroundColor: 'rgba(2, 6, 23, 0.76)', backdropFilter: 'blur(20px)' }}
      onClick={onClose}
    >
      <div
        className="relative w-full overflow-hidden rounded-[2rem] border border-white/10 bg-[rgba(2,6,23,0.97)] shadow-[0_36px_120px_rgba(2,6,23,0.58)] sm:rounded-[2.4rem]"
        style={{
          maxWidth: 'min(96vw, 1180px)',
          width: '100%',
          height: 'min(86vh, 820px)',
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.12),transparent_44%),linear-gradient(180deg,rgba(5,9,18,0.92),rgba(2,6,23,0.98))]" />

        {feedSrc && !unavailable && !feedErrored ? (
          <img
            key={`${entityId}-${transport}-${transport === 'snapshot' ? snapshotTick : 'live'}`}
            src={feedSrc}
            alt={name}
            className="absolute inset-0 h-full w-full"
            style={{
              objectFit: 'contain',
              filter: transport === 'stream' ? 'saturate(0.98) contrast(1.04)' : 'saturate(0.92)',
              transform: feedLoaded ? 'scale(1.001)' : 'scale(1.018)',
              transition: 'transform 900ms ease',
            }}
            onLoad={handleFeedLoad}
            onError={handleFeedError}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center px-6">
            <div className="max-w-md rounded-[2rem] border border-white/10 bg-black/35 px-6 py-7 text-center backdrop-blur-xl">
              <div className="text-base font-semibold text-white">
                {unavailable ? tr('camera.unavailable', 'Kamera ikke tilgjengelig') : tr('camera.feedUnavailable', 'Kunne ikke laste kamerafeed')}
              </div>
              <div className="mt-2 text-sm text-white/65">
                {unavailable
                  ? tr('camera.checkSource', 'Sjekk at kameraet er tilgjengelig i Home Assistant.')
                  : tr('camera.tryRefresh', 'Prøv å koble til live-feeden igjen.')}
              </div>
              {!unavailable && (
                <button
                  type="button"
                  onClick={reconnectStream}
                  className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/8 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/12"
                >
                  <RefreshCw className="h-4 w-4" />
                  <span>{tr('common.refresh', 'Oppdater')}</span>
                </button>
              )}
            </div>
          </div>
        )}

        {!feedLoaded && feedSrc && !unavailable && !feedErrored && (
          <div className="absolute inset-0 animate-pulse bg-white/[0.04]" />
        )}

        <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-[linear-gradient(180deg,rgba(2,6,23,0.82),transparent)]" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-[linear-gradient(0deg,rgba(2,6,23,0.88),transparent)]" />

        <div className="absolute left-4 top-4 sm:left-5 sm:top-5">
          <div className="inline-flex max-w-[calc(100vw-9rem)] items-center gap-2 rounded-full border border-white/12 bg-black/38 px-3 py-2 text-white/92 backdrop-blur-xl sm:px-4">
            <span className={`h-2.5 w-2.5 rounded-full ${unavailable ? 'bg-rose-300' : transport === 'stream' ? 'bg-emerald-300 animate-pulse' : 'bg-amber-200'}`} />
            <span className="truncate text-xs font-semibold uppercase tracking-[0.22em] sm:text-[11px]">
              {transport === 'stream'
                ? name
                : `${name} · ${tr('camera.snapshotFallback', 'Snapshot fallback')}`}
            </span>
          </div>
        </div>

        <div className="absolute right-4 top-4 flex items-center gap-2 sm:right-5 sm:top-5">
          <button
            type="button"
            onClick={reconnectStream}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/12 bg-black/38 text-white/88 backdrop-blur-xl transition hover:bg-black/50"
            aria-label={tr('common.refresh', 'Oppdater')}
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/12 bg-black/44 text-white backdrop-blur-xl transition hover:bg-black/56"
            aria-label={tr('common.close', 'Lukk')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
