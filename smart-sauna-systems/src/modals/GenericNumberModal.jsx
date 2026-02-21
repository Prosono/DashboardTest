import React, { useEffect, useMemo, useState } from 'react';
import { Hash, Minus, Plus, X } from '../icons';
import M3Slider from '../components/ui/M3Slider';

const makeTr = (t) => (key, fallback) => {
  const out = typeof t === 'function' ? t(key) : undefined;
  const s = String(out ?? '');
  const looksLikeKey = !s || s === key || s.toLowerCase() === key.toLowerCase() || s === s.toUpperCase() || s.includes('.');
  return looksLikeKey ? fallback : s;
};

const getDisplayName = (entity, fallback) => entity?.attributes?.friendly_name || fallback;

export default function GenericNumberModal({
  entityId,
  entity,
  callService,
  onClose,
  onShowHistory,
  t,
  embedded = false,
  showCloseButton = true,
  directInput = false,
  maxDigits = null,
  overlayOpacity = 0.3,
}) {
  if (!entityId || !entity) return null;
  const tr = makeTr(t);
  const isLightTheme = typeof document !== 'undefined' && document.documentElement?.dataset?.theme === 'light';
  const modalSurfaceStyle = isLightTheme
    ? { background: '#f1f5f9', borderColor: 'rgba(148,163,184,0.45)', color: 'var(--text-primary)' }
    : { background: 'linear-gradient(135deg, var(--card-bg) 0%, var(--modal-bg) 100%)', borderColor: 'var(--glass-border)', color: 'var(--text-primary)' };
  const domain = String(entityId).split('.')[0] || '';
  const numeric = Number(entity?.state);
  const hasValue = Number.isFinite(numeric);
  const fallbackMin = domain === 'input_number' ? 0 : 0;
  const fallbackMax = domain === 'input_number' ? 100 : 100;
  const min = Number.isFinite(Number(entity?.attributes?.min)) ? Number(entity.attributes.min) : fallbackMin;
  const max = Number.isFinite(Number(entity?.attributes?.max)) ? Number(entity.attributes.max) : fallbackMax;
  const step = Number.isFinite(Number(entity?.attributes?.step)) ? Number(entity.attributes.step) : 1;
  const value = hasValue ? numeric : min;
  const [inputValue, setInputValue] = useState(hasValue ? String(Math.round(value)) : '');
  const [inputError, setInputError] = useState('');
  const normalizedMaxDigits = useMemo(() => {
    if (!Number.isFinite(Number(maxDigits))) return null;
    const parsed = Math.max(1, Math.floor(Number(maxDigits)));
    return Number.isFinite(parsed) ? parsed : null;
  }, [maxDigits]);

  useEffect(() => {
    if (!directInput) return;
    if (!hasValue) {
      setInputValue('');
      return;
    }
    setInputValue(String(Math.round(value)));
  }, [directInput, hasValue, value]);

  const setValue = (next) => {
    const n = Number(next);
    if (!Number.isFinite(n)) return;
    const clamped = Math.max(min, Math.min(max, n));
    callService(domain, 'set_value', { entity_id: entityId, value: clamped });
  };

  const commitInputValue = () => {
    if (!directInput) return;
    const trimmed = String(inputValue ?? '').trim();
    if (!trimmed) {
      setInputError(tr('common.required', 'Verdi kreves'));
      return;
    }
    if (!/^\d+$/.test(trimmed)) {
      setInputError(tr('number.onlyDigits', 'Kun tall er tillatt'));
      return;
    }
    if (normalizedMaxDigits && trimmed.length > normalizedMaxDigits) {
      setInputError(`${tr('number.maxDigits', 'Maks')} ${normalizedMaxDigits} ${tr('number.digits', 'sifre')}`);
      return;
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      setInputError(tr('common.invalidValue', 'Ugyldig verdi'));
      return;
    }
    if (parsed < min || parsed > max) {
      setInputError(`${tr('common.range', 'Område')}: ${min} - ${max}`);
      return;
    }
    setInputError('');
    setValue(parsed);
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
          <Hash className="w-8 h-8" />
        </div>
        <div className="min-w-0">
          <h3 className="text-lg sm:text-xl md:text-2xl font-light tracking-tight text-[var(--text-primary)] uppercase italic leading-tight break-words">
            {getDisplayName(entity, tr('room.domain.number', 'Nummer'))}
          </h3>
          <div className="mt-2 px-3 py-1 rounded-full border inline-flex items-center gap-2 bg-[var(--glass-bg)] border-[var(--glass-border)] text-[var(--text-secondary)]">
            <span className="text-[10px] uppercase tracking-widest font-bold">{tr('common.value', 'Verdi')}</span>
            <span className="text-[10px] uppercase tracking-widest font-bold opacity-85">{hasValue ? String(value) : '--'}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-10 items-start">
        <div className="lg:col-span-3 p-6 md:p-8 rounded-3xl popup-surface">
          <div className="text-xs uppercase tracking-[0.32em] font-bold text-[var(--text-secondary)] mb-5">
            {tr('common.value', 'Verdi')}
          </div>
          <div className="flex items-center justify-center py-1">
            <div className="text-7xl md:text-8xl font-semibold leading-none tabular-nums text-[var(--text-primary)]">
              {hasValue ? Number(value).toFixed(step < 1 ? 1 : 0) : '--'}
            </div>
          </div>
          <div className="mt-6 flex items-center gap-3 md:gap-6">
            <button
              type="button"
              onClick={() => setValue(value - step)}
              className="p-3 md:p-5 rounded-full transition-all active:scale-90 shadow-lg border bg-[var(--glass-bg)] border-[var(--glass-border)]"
            >
              <Minus className="w-5 h-5 md:w-7 md:h-7" style={{ strokeWidth: 3 }} />
            </button>
            <div className="flex-grow">
              <M3Slider
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                colorClass="bg-cyan-500"
              />
            </div>
            <button
              type="button"
              onClick={() => setValue(value + step)}
              className="p-3 md:p-5 rounded-full transition-all active:scale-90 shadow-lg border bg-[var(--glass-bg)] border-[var(--glass-border)]"
            >
              <Plus className="w-5 h-5 md:w-7 md:h-7" style={{ strokeWidth: 3 }} />
            </button>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-4 py-2">
          {directInput && (
            <div className="rounded-2xl border px-4 py-3 bg-[var(--glass-bg)] border-[var(--glass-border)]">
              <div className="text-xs uppercase tracking-[0.22em] font-bold text-[var(--text-secondary)] mb-2">
                {tr('sauna.activeCodes', 'Aktive koder')}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={inputValue}
                  onChange={(event) => {
                    const digitsOnly = String(event.target.value || '').replace(/\D/g, '');
                    setInputValue(digitsOnly);
                    if (normalizedMaxDigits && digitsOnly.length > normalizedMaxDigits) {
                      setInputError(`${tr('number.maxDigits', 'Maks')} ${normalizedMaxDigits} ${tr('number.digits', 'sifre')}`);
                    } else if (inputError) {
                      setInputError('');
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      commitInputValue();
                    }
                  }}
                  className="flex-1 h-11 px-3 rounded-xl border bg-[var(--glass-bg-hover)] border-[var(--glass-border)] text-[var(--text-primary)] font-mono tracking-[0.2em] text-lg"
                  placeholder={normalizedMaxDigits ? '0'.repeat(normalizedMaxDigits) : '0000'}
                  aria-label={tr('sauna.activeCodes', 'Aktive koder')}
                />
                <button
                  type="button"
                  onClick={commitInputValue}
                  className="h-11 px-4 rounded-xl border bg-[var(--glass-bg)] border-[var(--glass-border)] text-[var(--text-primary)] text-xs uppercase tracking-[0.2em] font-bold"
                >
                  {tr('common.save', 'Lagre')}
                </button>
              </div>
              {inputError && (
                <div className="mt-2 text-xs font-semibold text-red-400">
                  {inputError}
                </div>
              )}
            </div>
          )}
          <div className="rounded-2xl border px-4 py-3 bg-[var(--glass-bg)] border-[var(--glass-border)]">
            <div className="text-xs uppercase tracking-[0.22em] font-bold text-[var(--text-secondary)] mb-1">
              {tr('common.range', 'Område')}
            </div>
            <div className="text-xl font-semibold text-[var(--text-primary)] tabular-nums">
              {min} - {max}
            </div>
          </div>
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
