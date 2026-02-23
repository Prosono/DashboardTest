import React from 'react';
import { ArrowRight, LayoutGrid, getIconComponent } from '../../icons';

const clampColumns = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 2;
  return Math.max(1, Math.min(4, Math.round(numeric)));
};

const normalizeButtons = (buttons) => {
  if (!Array.isArray(buttons)) return [];
  return buttons
    .filter(Boolean)
    .map((button, index) => ({
      id: button.id || `btn_${index}`,
      label: String(button.label || '').trim(),
      icon: String(button.icon || '').trim(),
      targetCardId: String(button.targetCardId || '').trim(),
      targetPageId: String(button.targetPageId || '').trim() || null,
    }));
};

const tr = (t, key, fallback) => {
  const value = typeof t === 'function' ? t(key) : '';
  if (!value || value === key) return fallback;
  return value;
};

export default function PopupLauncherCard({
  cardId,
  settings = {},
  dragProps,
  controls,
  cardStyle,
  editMode,
  customNames = {},
  onOpenTarget,
  t,
}) {
  const heading = customNames[cardId] || settings.heading || tr(t, 'popupLauncher.defaultTitle', 'Quick access');
  const buttons = normalizeButtons(settings.buttons);
  const columns = clampColumns(settings.columns);

  return (
    <div
      {...dragProps}
      className={`touch-feedback w-full rounded-3xl border relative overflow-hidden p-4 sm:p-5 font-sans break-inside-avoid ${
        editMode ? 'cursor-move' : ''
      }`}
      style={{
        ...cardStyle,
        background: 'linear-gradient(135deg, var(--card-bg) 0%, var(--modal-bg) 100%)',
        borderColor: 'var(--glass-border)',
      }}
    >
      {controls}

      <div className="mb-3">
        <p className="text-[10px] uppercase tracking-[0.26em] font-bold text-[var(--text-secondary)]">
          {heading}
        </p>
      </div>

      {buttons.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--glass-border)] bg-[var(--glass-bg)] px-4 py-6 text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-[var(--text-secondary)]">
            {tr(t, 'popupLauncher.emptyTitle', 'No launcher buttons yet')}
          </p>
          <p className="text-[11px] mt-1 text-[var(--text-muted)]">
            {tr(t, 'popupLauncher.emptyHint', 'Open card settings and add buttons.')}
          </p>
        </div>
      ) : (
        <div
          className="grid gap-2.5"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {buttons.map((button) => {
            const Icon = getIconComponent(button.icon) || LayoutGrid;
            const hasTarget = Boolean(button.targetCardId);
            const label = button.label || tr(t, 'popupLauncher.openCard', 'Open card');

            return (
              <button
                key={button.id}
                type="button"
                disabled={editMode || !hasTarget}
                onClick={(event) => {
                  event.stopPropagation();
                  if (editMode || !hasTarget || typeof onOpenTarget !== 'function') return;
                  onOpenTarget({
                    sourceCardId: cardId,
                    buttonId: button.id,
                    buttonLabel: label,
                    targetCardId: button.targetCardId,
                    targetPageId: button.targetPageId,
                  });
                }}
                className={`rounded-2xl border p-3 text-left transition-all ${
                  editMode || !hasTarget
                    ? 'opacity-70 cursor-default border-[var(--glass-border)] bg-[var(--glass-bg)]'
                    : 'border-emerald-400/20 bg-emerald-500/10 hover:bg-emerald-500/15 active:scale-[0.98]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="w-8 h-8 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] flex items-center justify-center text-[var(--text-secondary)]">
                    <Icon className="w-4 h-4" />
                  </div>
                  <ArrowRight className="w-4 h-4 text-[var(--text-muted)]" />
                </div>
                <p className="mt-2 text-[11px] leading-tight font-bold uppercase tracking-wide text-[var(--text-primary)]">
                  {label}
                </p>
                {!hasTarget && (
                  <p className="mt-1 text-[10px] text-[var(--text-muted)]">
                    {tr(t, 'popupLauncher.notConfigured', 'No target selected')}
                  </p>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
