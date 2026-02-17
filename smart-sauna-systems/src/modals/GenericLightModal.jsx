import { AlertTriangle, Lightbulb, Power, X } from '../icons';
import M3Slider from '../components/ui/M3Slider';
import { getIconComponent } from '../icons';

const makeTr = (t) => (key, fallback) => {
  const out = typeof t === 'function' ? t(key) : undefined;
  const s = String(out ?? '');
  const looksLikeKey = !s || s === key || s.toLowerCase() === key.toLowerCase() || s === s.toUpperCase() || s.includes('.');
  return looksLikeKey ? fallback : s;
};

const norm = (v) => String(v ?? '').toLowerCase();

function getDefaultIcon(entityId = '') {
  if (entityId.includes('kjokken') || entityId.includes('kitchen')) return Lightbulb;
  if (entityId.includes('stova') || entityId.includes('living')) return Lightbulb;
  if (entityId.includes('studio') || entityId.includes('office')) return Lightbulb;
  return Lightbulb;
}

export default function GenericLightModal({
  entityId,
  entity,
  onClose,
  onShowHistory,
  callService,
  t,
  optimisticBrightness = 0,
  setOptimisticBrightness,
  customIcons,
  embedded = false,
  showCloseButton = true,
}) {
  if (!entityId || !entity) return null;
  const tr = makeTr(t);
  const unavailable = ['unavailable', 'unknown'].includes(norm(entity?.state));
  const isOn = norm(entity?.state) === 'on';
  const isLightTheme = typeof document !== 'undefined' && document.documentElement?.dataset?.theme === 'light';

  const fallbackIcon = getDefaultIcon(entityId);
  const iconName = customIcons?.[entityId] || entity?.attributes?.icon;
  const Icon = iconName ? (getIconComponent(iconName) || fallbackIcon) : fallbackIcon;

  const brightness = Number.isFinite(Number(optimisticBrightness)) ? Number(optimisticBrightness) : 0;
  const pct = Math.round((brightness / 255) * 100);

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
            borderColor: unavailable ? 'rgba(239,68,68,0.35)' : (isOn ? 'rgba(245,158,11,0.35)' : 'var(--glass-border)'),
            backgroundColor: unavailable ? 'rgba(239,68,68,0.12)' : (isOn ? 'rgba(245,158,11,0.14)' : 'var(--glass-bg)'),
            color: unavailable ? '#fca5a5' : (isOn ? '#f59e0b' : 'var(--text-secondary)'),
          }}
        >
          <Icon className="w-8 h-8" />
        </div>
        <div className="min-w-0">
          <h3 className="text-lg sm:text-xl md:text-2xl font-light tracking-tight text-[var(--text-primary)] uppercase italic leading-tight break-words">
            {entity?.attributes?.friendly_name || tr('sauna.lights', 'Lys')}
          </h3>
          <div
            className="mt-2 px-3 py-1 rounded-full border inline-flex items-center gap-2"
            style={{
              backgroundColor: unavailable ? 'rgba(239,68,68,0.12)' : (isOn ? (isLightTheme ? 'rgba(245,158,11,0.16)' : 'rgba(245,158,11,0.14)') : 'var(--glass-bg)'),
              borderColor: unavailable ? 'rgba(239,68,68,0.28)' : (isOn ? 'rgba(245,158,11,0.28)' : 'var(--glass-border)'),
              color: unavailable ? '#fca5a5' : (isOn ? (isLightTheme ? '#92400e' : '#fbbf24') : 'var(--text-secondary)'),
            }}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${unavailable ? 'bg-red-300' : (isOn ? 'bg-emerald-300' : 'bg-slate-500')}`} />
            <span className="text-[10px] uppercase tracking-widest font-bold">
              {unavailable ? tr('status.unavailable', 'Utilgjengelig') : (isOn ? tr('common.on', 'På') : tr('common.off', 'Av'))}
            </span>
            <span className="text-[10px] uppercase tracking-widest font-bold opacity-80">{pct}%</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-10 items-start">
        <div className="lg:col-span-3 p-6 md:p-8 rounded-3xl popup-surface">
          <div className="text-xs uppercase tracking-[0.32em] font-bold text-[var(--text-secondary)] mb-5">
            {tr('light.brightness', 'Lysstyrke')}
          </div>
          <div className="flex items-center justify-center py-3">
            <div className="w-36 h-36 rounded-full border flex items-center justify-center bg-[var(--glass-bg)] border-[var(--glass-border)]">
              {unavailable ? <AlertTriangle className="w-16 h-16 text-red-400" /> : <Icon className={`w-16 h-16 ${isOn ? 'text-amber-400' : 'text-[var(--text-secondary)]'}`} />}
            </div>
          </div>
          <div className="mt-6">
            <M3Slider
              min={0}
              max={255}
              step={1}
              value={brightness}
              disabled={!isOn || unavailable}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                setOptimisticBrightness?.(val);
                callService('light', 'turn_on', { entity_id: entityId, brightness: val });
              }}
              colorClass="bg-amber-500"
              trackClass={isLightTheme ? 'h-5 border border-slate-400/60 bg-slate-300/90' : undefined}
            />
          </div>
        </div>

        <div className="lg:col-span-2 space-y-4 py-2">
          <button
            type="button"
            onClick={() => !unavailable && callService('light', 'toggle', { entity_id: entityId })}
            disabled={unavailable}
            className={`w-full h-12 px-4 rounded-2xl border inline-flex items-center justify-between transition-all ${
              unavailable
                ? 'opacity-50 cursor-not-allowed bg-[var(--glass-bg)] border-[var(--glass-border)] text-[var(--text-secondary)]'
                : (isOn
                  ? (isLightTheme ? 'bg-amber-100 border-amber-400 text-amber-900' : 'bg-amber-500/16 border-amber-500/35 text-amber-300')
                  : 'bg-[var(--glass-bg)] border-[var(--glass-border)] text-[var(--text-primary)]')
            }`}
          >
            <span className="text-xs uppercase tracking-[0.22em] font-bold">
              {isOn ? tr('common.turnOff', 'Slå av') : tr('common.turnOn', 'Slå på')}
            </span>
            <Power className="w-4 h-4" />
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
          <div className="rounded-2xl border px-4 py-3 bg-[var(--glass-bg)] border-[var(--glass-border)]">
            <div className="text-xs uppercase tracking-[0.22em] font-bold text-[var(--text-secondary)] mb-1">
              {tr('light.brightness', 'Lysstyrke')}
            </div>
            <div className="text-4xl font-semibold text-[var(--text-primary)] tabular-nums">
              {pct}%
            </div>
          </div>
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
