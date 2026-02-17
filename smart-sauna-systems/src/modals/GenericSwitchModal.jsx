import { ToggleRight, X } from '../icons';

const norm = (v) => String(v ?? '').toLowerCase();
const makeTr = (t) => (key, fallback) => {
  const out = typeof t === 'function' ? t(key) : undefined;
  const s = String(out ?? '');
  const looksLikeKey = !s || s === key || s.toLowerCase() === key.toLowerCase() || s === s.toUpperCase() || s.includes('.');
  return looksLikeKey ? fallback : s;
};
const getDisplayName = (entity, fallback) => entity?.attributes?.friendly_name || fallback;

export default function GenericSwitchModal({
  entityId,
  entity,
  callService,
  onClose,
  onShowHistory,
  t,
  embedded = false,
  showCloseButton = true,
}) {
  if (!entityId || !entity) return null;
  const tr = makeTr(t);
  const domain = String(entityId).split('.')[0] || '';
  const state = norm(entity?.state);
  const unavailable = state === 'unavailable' || state === 'unknown';
  const isOn = state === 'on' || state === 'true' || state === '1';

  const toggle = () => {
    if (unavailable) return;
    callService(domain, 'toggle', { entity_id: entityId });
  };

  const content = (
    <>
      {showCloseButton && onClose && (
        <button onClick={onClose} className="absolute top-6 right-6 md:top-8 md:right-8 modal-close">
          <X className="w-4 h-4" />
        </button>
      )}

      <div className="flex items-center gap-4 mb-6 pr-12">
        <div
          className="p-4 rounded-2xl border"
          style={{
            borderColor: unavailable ? 'rgba(239,68,68,0.35)' : (isOn ? 'rgba(16,185,129,0.35)' : 'var(--glass-border)'),
            backgroundColor: unavailable ? 'rgba(239,68,68,0.12)' : (isOn ? 'rgba(16,185,129,0.12)' : 'var(--glass-bg)'),
            color: unavailable ? '#fca5a5' : (isOn ? '#86efac' : 'var(--text-secondary)'),
          }}
        >
          <ToggleRight className={`w-8 h-8 ${isOn && !unavailable ? 'animate-pulse' : ''}`} />
        </div>
        <div className="min-w-0">
          <h3 className="text-lg sm:text-xl md:text-2xl font-light tracking-tight text-[var(--text-primary)] uppercase italic leading-tight break-words">
            {getDisplayName(entity, tr('common.switch', 'Bryter'))}
          </h3>
          <div
            className="mt-2 px-3 py-1 rounded-full border inline-flex items-center gap-2"
            style={{
              backgroundColor: unavailable ? 'rgba(239,68,68,0.12)' : (isOn ? 'rgba(16,185,129,0.14)' : 'var(--glass-bg)'),
              borderColor: unavailable ? 'rgba(239,68,68,0.28)' : (isOn ? 'rgba(16,185,129,0.28)' : 'var(--glass-border)'),
              color: unavailable ? '#fca5a5' : (isOn ? '#86efac' : 'var(--text-secondary)'),
            }}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${unavailable ? 'bg-red-300' : (isOn ? 'bg-emerald-300' : 'bg-slate-500')}`} />
            <span className="text-[10px] uppercase tracking-widest font-bold">
              {unavailable ? tr('status.unavailable', 'Utilgjengelig') : (isOn ? tr('common.on', 'På') : tr('common.off', 'Av'))}
            </span>
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
              <ToggleRight className={`w-16 h-16 ${unavailable ? 'text-red-300' : (isOn ? 'text-emerald-300 animate-pulse' : 'text-[var(--text-secondary)]')}`} />
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-4 py-2">
          <button
            type="button"
            onClick={toggle}
            disabled={unavailable}
            className={`w-full h-12 px-4 rounded-2xl border inline-flex items-center justify-center transition-all ${
              unavailable
                ? 'opacity-50 cursor-not-allowed bg-[var(--glass-bg)] border-[var(--glass-border)] text-[var(--text-secondary)]'
                : (isOn
                  ? 'bg-emerald-500/16 border-emerald-500/35 text-emerald-200'
                  : 'bg-[var(--glass-bg)] border-[var(--glass-border)] text-[var(--text-primary)]')
            }`}
          >
            <span className="text-xs uppercase tracking-[0.22em] font-bold">
              {isOn ? tr('common.turnOff', 'Slå av') : tr('common.turnOn', 'Slå på')}
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
        style={{ background: 'linear-gradient(135deg, var(--card-bg) 0%, var(--modal-bg) 100%)', borderColor: 'var(--glass-border)', color: 'var(--text-primary)' }}
      >
        {content}
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-6"
      style={{ backdropFilter: 'blur(20px)', backgroundColor: 'rgba(0,0,0,0.3)' }}
      onClick={onClose}
    >
      <div
        className="border w-full max-w-5xl rounded-3xl md:rounded-[3rem] p-6 md:p-10 font-sans relative max-h-[90vh] overflow-y-auto backdrop-blur-xl popup-anim"
        style={{ background: 'linear-gradient(135deg, var(--card-bg) 0%, var(--modal-bg) 100%)', borderColor: 'var(--glass-border)', color: 'var(--text-primary)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {content}
      </div>
    </div>
  );
}
