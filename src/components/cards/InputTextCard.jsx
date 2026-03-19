import { useEffect, useMemo, useState } from 'react';
import { AlignLeft, RefreshCw, Type } from '../../icons';
import { getIconComponent } from '../../icons';

const clampRows = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 3;
  return Math.max(1, Math.min(6, Math.round(parsed)));
};

const readEntityValue = (entity) => {
  const state = entity?.state;
  if (state == null || state === 'unknown' || state === 'unavailable') return '';
  return String(state);
};

const tr = (t, key, fallback) => {
  const value = typeof t === 'function' ? t(key) : undefined;
  if (!value || value === key || String(value).toLowerCase() === key.toLowerCase()) return fallback;
  return value;
};

const maskValue = (value) => {
  if (!value) return '';
  return '\u2022'.repeat(Math.max(4, Math.min(String(value).length, 16)));
};

const buildTone = ({ isUnavailable, isDirty, requestState }) => {
  if (isUnavailable) {
    return {
      accent: 'rgba(148, 163, 184, 0.4)',
      accentSoft: 'rgba(148, 163, 184, 0.12)',
      badgeClass: 'bg-slate-500/10 border-slate-500/25 text-slate-300',
      buttonClass: 'bg-slate-500/15 border-slate-500/30 text-slate-100',
      iconClass: 'bg-slate-500/12 text-slate-300 border-slate-400/20',
    };
  }
  if (requestState === 'error') {
    return {
      accent: 'rgba(248, 113, 113, 0.46)',
      accentSoft: 'rgba(248, 113, 113, 0.12)',
      badgeClass: 'bg-rose-500/10 border-rose-500/25 text-rose-300',
      buttonClass: 'bg-rose-500/15 border-rose-500/30 text-rose-100',
      iconClass: 'bg-rose-500/12 text-rose-300 border-rose-400/20',
    };
  }
  if (requestState === 'saving') {
    return {
      accent: 'rgba(245, 158, 11, 0.46)',
      accentSoft: 'rgba(245, 158, 11, 0.12)',
      badgeClass: 'bg-amber-500/10 border-amber-500/25 text-amber-300',
      buttonClass: 'bg-amber-500/15 border-amber-500/30 text-amber-100',
      iconClass: 'bg-amber-500/12 text-amber-300 border-amber-400/20',
    };
  }
  if (requestState === 'saved') {
    return {
      accent: 'rgba(52, 211, 153, 0.46)',
      accentSoft: 'rgba(52, 211, 153, 0.12)',
      badgeClass: 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300',
      buttonClass: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-100',
      iconClass: 'bg-emerald-500/12 text-emerald-300 border-emerald-400/20',
    };
  }
  if (isDirty) {
    return {
      accent: 'rgba(56, 189, 248, 0.46)',
      accentSoft: 'rgba(56, 189, 248, 0.12)',
      badgeClass: 'bg-sky-500/10 border-sky-500/25 text-sky-300',
      buttonClass: 'bg-sky-500/15 border-sky-500/30 text-sky-100',
      iconClass: 'bg-sky-500/12 text-sky-300 border-sky-400/20',
    };
  }
  return {
    accent: 'rgba(59, 130, 246, 0.32)',
    accentSoft: 'rgba(59, 130, 246, 0.1)',
    badgeClass: 'bg-blue-500/10 border-blue-500/20 text-blue-300',
    buttonClass: 'bg-blue-500/15 border-blue-500/30 text-blue-100',
    iconClass: 'bg-blue-500/12 text-blue-300 border-blue-400/20',
  };
};

export default function InputTextCard({
  cardId,
  entityId,
  entity,
  dragProps,
  controls,
  cardStyle,
  editMode,
  customNames,
  customIcons,
  settings,
  t,
  onSaveValue,
}) {
  const isLightTheme = typeof document !== 'undefined' && document.documentElement?.dataset?.theme === 'light';
  const currentValue = readEntityValue(entity);
  const [draft, setDraft] = useState(() => currentValue);
  const [optimisticValue, setOptimisticValue] = useState(null);
  const [requestState, setRequestState] = useState('idle');
  const [error, setError] = useState('');
  const [hasFocus, setHasFocus] = useState(false);

  const committedValue = optimisticValue ?? currentValue;
  const rows = clampRows(settings?.rows);
  const isCompact = settings?.size === 'small' || rows <= 1;
  const isUnavailable = entity?.state === 'unavailable';
  const maxLength = Number.isFinite(Number(entity?.attributes?.max)) ? Number(entity.attributes.max) : null;
  const minLength = Number.isFinite(Number(entity?.attributes?.min)) ? Number(entity.attributes.min) : 0;
  const pattern = String(entity?.attributes?.pattern || '').trim();
  const showCharacterCount = settings?.showCharacterCount !== false;
  const isPassword = entity?.attributes?.mode === 'password';
  const hasChanges = draft !== committedValue;
  const tone = buildTone({ isUnavailable, isDirty: hasChanges, requestState });

  useEffect(() => {
    if (optimisticValue !== null && currentValue === optimisticValue) {
      setOptimisticValue(null);
      setRequestState('saved');
      if (!hasFocus) setDraft(currentValue);
      return;
    }

    const baseValue = optimisticValue ?? currentValue;
    if (!hasFocus) setDraft(baseValue);
  }, [currentValue, hasFocus, optimisticValue]);

  useEffect(() => {
    if (requestState !== 'saved' || hasChanges || typeof window === 'undefined') return undefined;
    const timeoutId = window.setTimeout(() => {
      setRequestState('idle');
    }, 1800);
    return () => window.clearTimeout(timeoutId);
  }, [hasChanges, requestState]);

  const selectedIconName = customIcons?.[cardId] || entity?.attributes?.icon;
  const Icon = selectedIconName ? (getIconComponent(selectedIconName) || Type) : Type;
  const name = customNames?.[cardId] || entity?.attributes?.friendly_name || entityId;
  const displayValue = isPassword ? maskValue(committedValue) : committedValue;
  const previewValue = displayValue || tr(t, 'inputText.empty', 'Ingen tekst lagret');
  const statusLabel = useMemo(() => {
    if (isUnavailable) return tr(t, 'status.unavailable', 'Utilgjengelig');
    if (requestState === 'error') return tr(t, 'inputText.status.error', 'Feil');
    if (requestState === 'saving') return tr(t, 'inputText.status.saving', 'Lagrer');
    if (hasChanges) return tr(t, 'inputText.status.unsaved', 'Ulagret');
    if (requestState === 'saved') return tr(t, 'inputText.status.saved', 'Lagret');
    return tr(t, 'inputText.status.ready', 'Klar');
  }, [hasChanges, isUnavailable, requestState, t]);

  const metaLabel = useMemo(() => {
    if (maxLength) return `${draft.length}/${maxLength}`;
    return `${draft.length}`;
  }, [draft.length, maxLength]);

  const validateDraft = (value) => {
    if (maxLength && value.length > maxLength) {
      return tr(t, 'inputText.validation.max', 'Teksten er for lang');
    }
    if (minLength && value.length < minLength) {
      return tr(t, 'inputText.validation.min', 'Teksten er for kort');
    }
    if (pattern) {
      try {
        const regex = new RegExp(pattern);
        if (!regex.test(value)) {
          return tr(t, 'inputText.validation.pattern', 'Teksten matcher ikke formatet');
        }
      } catch {
        return '';
      }
    }
    return '';
  };

  const handleSave = async (event) => {
    event.stopPropagation();
    if (editMode || isUnavailable || typeof onSaveValue !== 'function') return;

    const validationError = validateDraft(draft);
    if (validationError) {
      setError(validationError);
      setRequestState('error');
      return;
    }

    if (!hasChanges) {
      setRequestState('saved');
      setError('');
      return;
    }

    const nextValue = draft;
    setError('');
    setOptimisticValue(nextValue);
    setRequestState('saving');

    try {
      await Promise.resolve(onSaveValue(nextValue));
      setRequestState('saved');
    } catch (saveError) {
      console.error('Failed to save input_text value from card', saveError);
      setOptimisticValue(null);
      setRequestState('error');
      setError(tr(t, 'inputText.error.save', 'Kunne ikke lagre teksten'));
    }
  };

  const handleReset = (event) => {
    event.stopPropagation();
    setDraft(committedValue);
    setError('');
    setRequestState('idle');
  };

  if (!entity || !entityId) return null;

  return (
    <div
      {...dragProps}
      data-haptic={editMode ? undefined : 'card'}
      className={`touch-feedback relative isolate h-full overflow-hidden rounded-[2rem] border p-4 sm:p-5 font-sans ${editMode ? 'cursor-move' : 'cursor-default'}`}
      style={{
        ...cardStyle,
        containerType: 'inline-size',
        borderColor: tone.accent,
        background: isLightTheme
          ? `linear-gradient(160deg, rgba(255,255,255,0.98) 0%, color-mix(in srgb, white 88%, ${tone.accentSoft}) 100%)`
          : `radial-gradient(circle at top right, ${tone.accentSoft}, transparent 38%), linear-gradient(160deg, color-mix(in srgb, var(--card-bg) 88%, ${tone.accentSoft}) 0%, var(--modal-bg) 100%)`,
      }}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-80"
        style={{
          background: `linear-gradient(135deg, transparent 0%, ${tone.accentSoft} 100%)`,
        }}
      />
      <div className="relative z-20">{controls}</div>

      <div className="relative z-10 flex h-full flex-col">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-[1.25rem] border ${tone.iconClass}`}>
              <Icon className="h-6 w-6 stroke-[1.6px]" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--text-secondary)] opacity-75">
                {tr(t, 'inputText.label', 'Tekstfelt')}
              </p>
              <h3 className="truncate pt-1 text-base font-semibold text-[var(--text-primary)] sm:text-lg">
                {name}
              </h3>
              <p className="truncate pt-1 text-[11px] text-[var(--text-secondary)] opacity-70">
                {entityId}
              </p>
            </div>
          </div>

          <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] ${tone.badgeClass}`}>
            {requestState === 'saving' ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <span className="h-2 w-2 rounded-full bg-current opacity-80" />}
            <span>{statusLabel}</span>
          </div>
        </div>

        <div className={`${isCompact ? 'mt-4' : 'mt-5'} rounded-[1.5rem] border border-white/8 bg-[var(--glass-bg)]/90 p-4`}>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--text-secondary)] opacity-75">
              {tr(t, 'inputText.currentValue', 'Gjeldende verdi')}
            </span>
            {!isCompact && (
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--text-secondary)] opacity-70">
                {isPassword ? tr(t, 'inputText.password', 'Skjult') : metaLabel}
              </span>
            )}
          </div>
          <div className={`mt-2 whitespace-pre-wrap break-words ${displayValue ? 'text-[var(--text-primary)]' : 'italic text-[var(--text-secondary)] opacity-80'} ${isCompact ? 'text-sm font-medium' : 'text-base font-medium'}`}>
            {previewValue}
          </div>
        </div>

        <div className="mt-4 flex flex-1 flex-col rounded-[1.5rem] border border-white/8 bg-[var(--glass-bg)]/85 p-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--text-secondary)] opacity-75">
              <AlignLeft className="h-3.5 w-3.5" />
              {tr(t, 'inputText.editor', 'Rediger tekst')}
            </span>
            {showCharacterCount && (
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--text-secondary)] opacity-70">
                {metaLabel}
              </span>
            )}
          </div>

          {isCompact ? (
            <input
              type={isPassword ? 'password' : 'text'}
              value={draft}
              disabled={editMode || requestState === 'saving'}
              maxLength={maxLength || undefined}
              onFocus={() => setHasFocus(true)}
              onBlur={() => setHasFocus(false)}
              onClick={(event) => event.stopPropagation()}
              onChange={(event) => {
                setDraft(event.target.value);
                if (error) setError('');
                if (requestState === 'error' || requestState === 'saved') setRequestState('idle');
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  handleSave(event);
                }
              }}
              className="h-11 rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg-hover)] px-4 text-sm font-medium text-[var(--text-primary)] outline-none transition-colors focus:border-blue-400/40"
              placeholder={tr(t, 'inputText.placeholder', 'Skriv tekst')}
            />
          ) : (
            <textarea
              rows={rows}
              value={draft}
              disabled={editMode || requestState === 'saving'}
              maxLength={maxLength || undefined}
              onFocus={() => setHasFocus(true)}
              onBlur={() => setHasFocus(false)}
              onClick={(event) => event.stopPropagation()}
              onChange={(event) => {
                setDraft(event.target.value);
                if (error) setError('');
                if (requestState === 'error' || requestState === 'saved') setRequestState('idle');
              }}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                  event.preventDefault();
                  handleSave(event);
                }
              }}
              className="min-h-[5.5rem] flex-1 resize-none rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg-hover)] px-4 py-3 text-sm leading-relaxed text-[var(--text-primary)] outline-none transition-colors focus:border-blue-400/40"
              placeholder={tr(t, 'inputText.placeholder', 'Skriv tekst')}
            />
          )}

          {!isCompact && (
            <p className="mt-2 text-[11px] text-[var(--text-secondary)] opacity-70">
              {tr(t, 'inputText.saveHint', 'Trykk Cmd/Ctrl + Enter for å lagre raskt')}
            </p>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="min-h-[1rem] text-xs font-semibold text-rose-300">
            {error}
          </div>
          <div className="flex items-center gap-2">
            {hasChanges && (
              <button
                type="button"
                onClick={handleReset}
                className="rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
              >
                {tr(t, 'common.cancel', 'Avbryt')}
              </button>
            )}
            <button
              type="button"
              onClick={handleSave}
              disabled={editMode || isUnavailable || requestState === 'saving'}
              className={`rounded-2xl border px-4 py-2 text-[11px] font-bold uppercase tracking-[0.18em] transition-all disabled:cursor-not-allowed disabled:opacity-60 ${tone.buttonClass}`}
            >
              {requestState === 'saving' ? tr(t, 'inputText.status.saving', 'Lagrer') : tr(t, 'common.save', 'Lagre')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
