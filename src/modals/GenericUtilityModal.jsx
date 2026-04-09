import React from 'react';
import { X, Camera, Shield, AlarmClock, ListChecks, RefreshCw, Zap, Workflow } from '../icons';
import { getCameraSnapshotUrl, getCameraStreamUrl, isCameraUnavailable } from '../utils/cameraFeeds';

const norm = (v) => String(v ?? '').toLowerCase();

const makeTr = (t) => (key, fallback) => {
  const out = typeof t === 'function' ? t(key) : undefined;
  const s = String(out ?? '');
  const looksLikeKey = !s || s === key || s.toLowerCase() === key.toLowerCase() || s === s.toUpperCase() || s.includes('.');
  return looksLikeKey ? fallback : s;
};

const iconByMode = {
  camera: Camera,
  alarm: Shield,
  timer: AlarmClock,
  select: ListChecks,
  button: Zap,
  script: Workflow,
};

const fallbackTitleByMode = {
  camera: 'Kamera',
  alarm: 'Alarm',
  timer: 'Timer',
  select: 'Valg',
  button: 'Knapp',
  script: 'Script/Scene',
};

export default function GenericUtilityModal({
  mode,
  entityId,
  entity,
  callService,
  onClose,
  onShowHistory,
  t,
  embedded = false,
  showCloseButton = true,
  overlayOpacity = 0.3,
  getEntityImageUrl,
}) {
  const tr = makeTr(t);
  const isLightTheme = typeof document !== 'undefined' && document.documentElement?.dataset?.theme === 'light';
  const modalSurfaceStyle = isLightTheme
    ? { background: '#f1f5f9', borderColor: 'rgba(148,163,184,0.45)', color: 'var(--text-primary)' }
    : { background: 'linear-gradient(135deg, var(--card-bg) 0%, var(--modal-bg) 100%)', borderColor: 'var(--glass-border)', color: 'var(--text-primary)' };
  const Icon = iconByMode[mode] || Workflow;
  const name = entity?.attributes?.friendly_name || entityId;
  const domain = String(entityId).split('.')[0] || '';
  const state = norm(entity?.state);
  const unavailable = state === 'unknown' || state === 'unavailable';
  const options = Array.isArray(entity?.attributes?.options) ? entity.attributes.options : [];
  const [cameraTransport, setCameraTransport] = React.useState('stream');
  const [cameraSnapshotTick, setCameraSnapshotTick] = React.useState(Date.now());
  const [cameraFeedLoaded, setCameraFeedLoaded] = React.useState(false);
  const [cameraFeedErrored, setCameraFeedErrored] = React.useState(false);
  const cameraUnavailable = mode === 'camera' ? isCameraUnavailable(entity) : unavailable;
  const cameraStreamUrl = React.useMemo(
    () => (mode === 'camera' ? getCameraStreamUrl({ entityId, entity, getEntityImageUrl }) : null),
    [mode, entityId, entity, getEntityImageUrl],
  );
  const cameraSnapshotUrl = React.useMemo(
    () => (mode === 'camera' ? getCameraSnapshotUrl({
      entityId,
      entity,
      getEntityImageUrl,
      cacheBust: cameraSnapshotTick,
    }) : null),
    [mode, entityId, entity, getEntityImageUrl, cameraSnapshotTick],
  );
  const cameraFeedSrc = mode === 'camera'
    ? (cameraTransport === 'snapshot' ? cameraSnapshotUrl : cameraStreamUrl)
    : null;

  React.useEffect(() => {
    if (mode !== 'camera') return;
    setCameraTransport('stream');
    setCameraSnapshotTick(Date.now());
    setCameraFeedLoaded(false);
    setCameraFeedErrored(false);
  }, [mode, entityId]);

  React.useEffect(() => {
    if (mode !== 'camera' || cameraTransport !== 'snapshot') return undefined;
    const timer = window.setInterval(() => {
      setCameraSnapshotTick(Date.now());
    }, 4000);
    return () => window.clearInterval(timer);
  }, [mode, cameraTransport]);

  if (!mode || !entityId || !entity) return null;

  const primaryAction = () => {
    if (mode === 'camera') return;
    if (unavailable) return;
    if (mode === 'alarm') {
      const armed = state.startsWith('armed') || state === 'triggered';
      callService('alarm_control_panel', armed ? 'alarm_disarm' : 'alarm_arm_away', { entity_id: entityId });
      return;
    }
    if (mode === 'timer') {
      if (state === 'active') {
        callService('timer', 'pause', { entity_id: entityId });
        return;
      }
      callService('timer', 'start', { entity_id: entityId });
      return;
    }
    if (mode === 'button') {
      callService('button', 'press', { entity_id: entityId });
      return;
    }
    if (mode === 'script') {
      callService(domain, 'turn_on', { entity_id: entityId });
      return;
    }
  };

  const secondaryAction = () => {
    if (mode === 'timer' && state !== 'idle') {
      callService('timer', 'cancel', { entity_id: entityId });
    }
  };

  const statusLabel = (() => {
    if (mode === 'camera') return cameraUnavailable ? tr('status.unavailable', 'Utilgjengelig') : (entity?.state || '--');
    if (mode === 'alarm') return unavailable ? tr('status.unavailable', 'Utilgjengelig') : (entity?.state || '--');
    if (mode === 'timer') return unavailable ? tr('status.unavailable', 'Utilgjengelig') : (entity?.state || '--');
    if (mode === 'select') return unavailable ? tr('status.unavailable', 'Utilgjengelig') : (entity?.state || '--');
    if (mode === 'button' || mode === 'script') return unavailable ? tr('status.unavailable', 'Utilgjengelig') : tr('common.ready', 'Klar');
    return entity?.state || '--';
  })();

  const primaryLabel = (() => {
    if (mode === 'camera') return tr('common.history', 'Historikk');
    if (mode === 'alarm') return (state.startsWith('armed') || state === 'triggered') ? tr('common.disarm', 'Deaktiver') : tr('common.arm', 'Aktiver');
    if (mode === 'timer') return state === 'active' ? tr('common.pause', 'Pause') : tr('common.start', 'Start');
    if (mode === 'button') return tr('common.press', 'Trykk');
    if (mode === 'script') return tr('common.run', 'Kjor');
    return tr('common.open', 'Åpne');
  })();

  const cameraRefresh = () => {
    setCameraFeedErrored(false);
    setCameraFeedLoaded(false);
    if (cameraTransport === 'snapshot') {
      setCameraSnapshotTick(Date.now());
      return;
    }
    setCameraTransport('snapshot');
    setCameraSnapshotTick(Date.now());
  };

  const handleCameraFeedError = () => {
    setCameraFeedLoaded(false);
    if (cameraTransport === 'stream' && cameraSnapshotUrl) {
      setCameraTransport('snapshot');
      setCameraSnapshotTick(Date.now());
      setCameraFeedErrored(false);
      return;
    }
    setCameraFeedErrored(true);
  };

  const handleCameraFeedLoad = () => {
    setCameraFeedLoaded(true);
    setCameraFeedErrored(false);
  };

  const content = (
    <>
      {showCloseButton && onClose && (
        <button onClick={onClose} className="modal-close light-modal-close-anchor light-modal-close-anchor--single z-[70]">
          <X className="w-4 h-4" />
        </button>
      )}

      <div className="flex items-center gap-4 mb-6 pr-12">
        <div className="p-4 rounded-2xl border bg-[var(--glass-bg)] border-[var(--glass-border)] text-[var(--text-secondary)]">
          <Icon className={`w-8 h-8 ${mode === 'camera' ? '' : 'animate-pulse'}`} />
        </div>
        <div className="min-w-0">
          <h3 className="text-lg sm:text-xl md:text-2xl font-light tracking-tight text-[var(--text-primary)] uppercase italic leading-tight break-words">
            {name}
          </h3>
          <div className="mt-2 px-3 py-1 rounded-full border inline-flex items-center gap-2 bg-[var(--glass-bg)] border-[var(--glass-border)] text-[var(--text-secondary)]">
            <span className="text-[10px] uppercase tracking-widest font-bold truncate">{statusLabel}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-10 items-start">
        <div className="lg:col-span-3 p-6 md:p-8 rounded-3xl popup-surface">
          <div className="text-xs uppercase tracking-[0.32em] font-bold text-[var(--text-secondary)] mb-5">
            {fallbackTitleByMode[mode]}
          </div>

          {mode === 'camera' ? (
            <div className="space-y-4">
              <div className="relative overflow-hidden rounded-[2rem] border min-h-[15rem] md:min-h-[19rem]" style={{ borderColor: 'var(--glass-border)', background: 'linear-gradient(160deg, rgba(15,23,42,0.88), rgba(2,6,23,0.96))' }}>
                {cameraFeedSrc && !cameraUnavailable && !cameraFeedErrored ? (
                  <img
                    key={`${entityId}-${cameraTransport}-${cameraTransport === 'snapshot' ? cameraSnapshotTick : 'live'}`}
                    src={cameraFeedSrc}
                    alt={name}
                    className="absolute inset-0 h-full w-full"
                    style={{
                      objectFit: 'cover',
                      filter: cameraTransport === 'stream' ? 'saturate(0.96) contrast(1.04)' : 'saturate(0.92)',
                      transform: cameraFeedLoaded ? 'scale(1.01)' : 'scale(1.03)',
                      transition: 'transform 900ms ease',
                    }}
                    onLoad={handleCameraFeedLoad}
                    onError={handleCameraFeedError}
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.2),_transparent_48%),linear-gradient(180deg,rgba(15,23,42,0.84),rgba(2,6,23,0.96))]">
                    <div className="px-5 text-center">
                      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl border border-white/10 bg-white/5">
                        <Camera className="h-8 w-8 text-white/70" />
                      </div>
                      <div className="mt-4 text-sm font-semibold text-white/90">
                        {cameraUnavailable ? tr('camera.unavailable', 'Kamera ikke tilgjengelig') : tr('camera.feedUnavailable', 'Kunne ikke laste kamerafeed')}
                      </div>
                    </div>
                  </div>
                )}

                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,23,0.2),rgba(2,6,23,0.08)_30%,rgba(2,6,23,0.6)_70%,rgba(2,6,23,0.84))]" />
                {!cameraFeedLoaded && cameraFeedSrc && !cameraUnavailable && !cameraFeedErrored && (
                  <div className="absolute inset-0 animate-pulse bg-white/[0.05]" />
                )}

                <div className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.26em] backdrop-blur-md"
                  style={{
                    borderColor: cameraUnavailable
                      ? 'rgba(251, 113, 133, 0.3)'
                      : cameraTransport === 'stream'
                        ? 'rgba(74, 222, 128, 0.28)'
                        : 'rgba(251, 191, 36, 0.28)',
                    background: cameraUnavailable
                      ? 'rgba(244, 63, 94, 0.16)'
                      : cameraTransport === 'stream'
                        ? 'rgba(34, 197, 94, 0.18)'
                        : 'rgba(245, 158, 11, 0.16)',
                    color: 'white',
                  }}>
                  <span className={`h-2 w-2 rounded-full ${cameraUnavailable ? 'bg-rose-300' : cameraTransport === 'stream' ? 'bg-emerald-300 animate-pulse' : 'bg-amber-200'}`} />
                  <span>
                    {cameraUnavailable
                      ? tr('status.unavailable', 'Utilgjengelig')
                      : cameraTransport === 'stream'
                        ? tr('camera.live', 'Direktebilde')
                        : tr('camera.snapshotFallback', 'Snapshot fallback')}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-2xl border px-4 py-3 bg-[var(--glass-bg)]" style={{ borderColor: 'var(--glass-border)' }}>
                  <div className="text-[10px] uppercase tracking-widest font-bold text-[var(--text-secondary)]">
                    {tr('common.status', 'Status')}
                  </div>
                  <div className="mt-2 text-sm font-semibold text-[var(--text-primary)]">
                    {entity?.state || '--'}
                  </div>
                </div>
                <div className="rounded-2xl border px-4 py-3 bg-[var(--glass-bg)]" style={{ borderColor: 'var(--glass-border)' }}>
                  <div className="text-[10px] uppercase tracking-widest font-bold text-[var(--text-secondary)]">
                    {tr('camera.lastChecked', 'Sist oppdatert')}
                  </div>
                  <div className="mt-2 text-sm font-semibold text-[var(--text-primary)]">
                    {entity?.last_updated ? new Date(entity.last_updated).toLocaleTimeString() : '--'}
                  </div>
                </div>
              </div>
            </div>
          ) : mode === 'select' ? (
            <div className="space-y-3">
              <div className="text-sm font-semibold text-[var(--text-primary)]">{tr('common.option', 'Valg')}</div>
              <select
                value={String(entity?.state ?? '')}
                disabled={unavailable || options.length === 0}
                onChange={(e) => callService(domain, 'select_option', { entity_id: entityId, option: e.target.value })}
                className="w-full px-4 py-3 rounded-2xl border bg-[var(--glass-bg)] border-[var(--glass-border)] text-[var(--text-primary)]"
              >
                {options.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>
          ) : (
            <div className="flex items-center justify-center py-4">
              <div className="w-36 h-36 rounded-full border flex items-center justify-center bg-[var(--glass-bg)] border-[var(--glass-border)]">
                <Icon className="w-16 h-16 text-[var(--text-secondary)]" />
              </div>
            </div>
          )}
        </div>

        <div className="lg:col-span-2 space-y-4 py-2">
          {mode !== 'select' && (
            <button
              type="button"
              onClick={() => {
                if (mode === 'camera') {
                  onShowHistory?.(entityId);
                  return;
                }
                primaryAction();
              }}
              disabled={mode === 'camera' ? typeof onShowHistory !== 'function' : unavailable}
              className={`w-full h-12 px-4 rounded-2xl border inline-flex items-center justify-center transition-all ${
                ((mode === 'camera' && typeof onShowHistory !== 'function') || (mode !== 'camera' && unavailable))
                  ? 'opacity-50 cursor-not-allowed bg-[var(--glass-bg)] border-[var(--glass-border)] text-[var(--text-secondary)]'
                  : 'bg-[var(--glass-bg)] border-[var(--glass-border)] text-[var(--text-primary)]'
              }`}
            >
              <span className="text-xs uppercase tracking-[0.22em] font-bold">{primaryLabel}</span>
            </button>
          )}

          {mode === 'camera' && (
            <button
              type="button"
              onClick={cameraRefresh}
              className="w-full h-11 px-4 rounded-2xl border inline-flex items-center justify-center gap-2 transition-all bg-[var(--glass-bg)] border-[var(--glass-border)] text-[var(--text-primary)]"
            >
              <RefreshCw className="w-4 h-4" />
              <span className="text-xs uppercase tracking-[0.22em] font-bold">{tr('common.refresh', 'Oppdater')}</span>
            </button>
          )}

          {mode === 'timer' && state !== 'idle' && (
            <button
              type="button"
              onClick={secondaryAction}
              className="w-full h-11 px-4 rounded-2xl border inline-flex items-center justify-center transition-all bg-[var(--glass-bg)] border-[var(--glass-border)] text-[var(--text-primary)]"
            >
              <span className="text-xs uppercase tracking-[0.22em] font-bold">{tr('common.cancel', 'Avbryt')}</span>
            </button>
          )}

          {typeof onShowHistory === 'function' && mode !== 'camera' && (
            <button
              type="button"
              onClick={() => onShowHistory(entityId)}
              className="w-full h-11 px-4 rounded-2xl border inline-flex items-center justify-center transition-all bg-[var(--glass-bg)] border-[var(--glass-border)] text-[var(--text-primary)]"
            >
              <span className="text-xs uppercase tracking-[0.22em] font-bold">
                {tr('common.history', 'Historikk')}
              </span>
            </button>
          )}
        </div>
      </div>
    </>
  );

  if (embedded) {
    return (
      <div
        className="border w-full rounded-3xl md:rounded-[2.4rem] p-5 md:p-8 font-sans relative backdrop-blur-xl"
        style={modalSurfaceStyle}
      >
        {content}
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-6"
      style={{ backdropFilter: 'blur(20px)', backgroundColor: 'rgba(0,0,0,' + overlayOpacity + ')' }}
      onClick={onClose}
    >
      <div
        className="border w-full max-w-5xl rounded-3xl md:rounded-[3rem] p-6 md:p-10 font-sans relative max-h-[90vh] overflow-y-auto backdrop-blur-xl popup-anim shadow-2xl"
        style={modalSurfaceStyle}
        onClick={(e) => e.stopPropagation()}
      >
        {content}
      </div>
    </div>
  );
}
