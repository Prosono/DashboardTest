import { Lock, X } from '../icons';

const norm = (v) => String(v ?? '').toLowerCase();
const makeTr = (t) => (key, fallback) => {
  const out = typeof t === 'function' ? t(key) : undefined;
  const s = String(out ?? '');
  const looksLikeKey = !s || s === key || s.toLowerCase() === key.toLowerCase() || s === s.toUpperCase() || s.includes('.');
  return looksLikeKey ? fallback : s;
};
const getDisplayName = (entity, fallback) => entity?.attributes?.friendly_name || fallback;

export default function GenericLockModal({
  entityId,
  entity,
  callService,
  onClose,
  onShowHistory,
  t,
  embedded = false,
  showCloseButton = true,
  overlayOpacity = 0.3,
}) {
  if (!entityId || !entity) return null;
  const tr = makeTr(t);
  const isLightTheme = typeof document !== 'undefined' && document.documentElement?.dataset?.theme === 'light';
  const modalSurfaceStyle = isLightTheme
    ? { background: '#f1f5f9', borderColor: 'rgba(148,163,184,0.45)', color: 'var(--text-primary)' }
    : { background: 'linear-gradient(135deg, var(--card-bg) 0%, var(--modal-bg) 100%)', borderColor: 'var(--glass-border)', color: 'var(--text-primary)' };
  const state = norm(entity?.state);
  const unavailable = state === 'unavailable' || state === 'unknown';
  const isLocked = state === 'locked';
  const isUnlocked = state === 'unlocked';
  const stateLabel = unavailable
    ? tr('status.unavailable', 'Utilgjengelig')
    : isLocked
      ? tr('binary.lock.locked', 'Låst')
      : isUnlocked
        ? tr('binary.lock.unlocked', 'Ulåst')
        : String(entity?.state ?? '--');

  const toggleLock = () => {
    if (unavailable) return;
    callService('lock', isLocked ? 'unlock' : 'lock', { entity_id: entityId });
  };

  const content = (
    <>
      {showCloseButton && onClose && (
        <button onClick={onClose} className="modal-close light-modal-close-anchor light-modal-close-anchor--single z-[70]">
          <X className="w-4 h-4" />
        </button>
      )}

      <div className="flex items-center gap-4 mb-6 pr-12">
        <div
          className="p-4 rounded-2xl border"
          style={{
            borderColor: unavailable ? 'rgba(239,68,68,0.35)' : (isUnlocked ? 'rgba(251,146,60,0.35)' : 'rgba(16,185,129,0.35)'),
            backgroundColor: unavailable ? 'rgba(239,68,68,0.12)' : (isUnlocked ? 'rgba(251,146,60,0.12)' : 'rgba(16,185,129,0.12)'),
            color: unavailable ? '#fca5a5' : (isUnlocked ? '#fdba74' : '#86efac'),
          }}
        >
          <Lock className={`w-8 h-8 ${isUnlocked && !unavailable ? 'animate-pulse' : ''}`} />
        </div>
        <div className="min-w-0">
          <h3 className="text-lg sm:text-xl md:text-2xl font-light tracking-tight text-[var(--text-primary)] uppercase italic leading-tight break-words">
            {getDisplayName(entity, tr('sauna.locks', 'Låser'))}
          </h3>
          <div
            className="mt-2 px-3 py-1 rounded-full border inline-flex items-center gap-2"
            style={{
              backgroundColor: unavailable ? 'rgba(239,68,68,0.12)' : (isUnlocked ? 'rgba(251,146,60,0.14)' : 'rgba(16,185,129,0.14)'),
              borderColor: unavailable ? 'rgba(239,68,68,0.28)' : (isUnlocked ? 'rgba(251,146,60,0.28)' : 'rgba(16,185,129,0.28)'),
              color: unavailable ? '#fca5a5' : (isUnlocked ? '#fdba74' : '#86efac'),
            }}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${unavailable ? 'bg-red-300' : (isUnlocked ? 'bg-amber-300' : 'bg-emerald-300')}`} />
            <span className="text-[10px] uppercase tracking-widest font-bold">{stateLabel}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-10 items-start">
        <div className="lg:col-span-3 p-6 md:p-8 rounded-3xl popup-surface">
          <div className="text-xs uppercase tracking-[0.32em] font-bold text-[var(--text-secondary)] mb-5">
            {tr('status.statusLabel', 'Status')}
          </div>
          <div className="flex items-center justify-center py-3">
            <div className="w-36 h-36 rounded-full border flex items-center justify-center bg-[var(--glass-bg)] border-[var(--glass-border)]">
              <Lock className={`w-16 h-16 ${unavailable ? 'text-red-300' : (isUnlocked ? 'text-amber-300 animate-pulse' : 'text-emerald-300')}`} />
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-4 py-2">
          <button
            type="button"
            onClick={toggleLock}
            disabled={unavailable}
            className={`w-full h-12 px-4 rounded-2xl border inline-flex items-center justify-center transition-all ${
              unavailable
                ? 'opacity-50 cursor-not-allowed bg-[var(--glass-bg)] border-[var(--glass-border)] text-[var(--text-secondary)]'
                : (isLocked
                  ? 'bg-emerald-500/16 border-emerald-500/35 text-emerald-200'
                  : 'bg-amber-500/16 border-amber-500/35 text-amber-200')
            }`}
          >
            <span className="text-xs uppercase tracking-[0.22em] font-bold">
              {isLocked ? tr('sauna.unlock', 'Lås opp') : tr('sauna.lock', 'Lås')}
            </span>
          </button>
          {typeof onShowHistory === 'function' && (
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
