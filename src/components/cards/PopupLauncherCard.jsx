import React from 'react';
import { ArrowRight, LayoutGrid, Thermometer, User, getIconComponent } from '../../icons';

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

const norm = (value) => String(value ?? '').trim().toLowerCase();
const isUnavailable = (value) => ['', 'unknown', 'unavailable', 'none', 'null'].includes(norm(value));
const isOn = (value) => ['on', 'true', '1', 'yes', 'ja'].includes(norm(value));
const isOnish = (value) => ['on', 'open', 'detected', 'motion', 'occupancy', 'present', 'home', 'true', '1', 'yes', 'ja'].includes(norm(value));
const isAbsoluteImageUrl = (value) => /^(https?:|data:|blob:)/i.test(String(value || '').trim());
const shouldResolveWithHaBase = (value) => /^\/(?:api|local|media)\//i.test(String(value || '').trim());

const resolveImageValue = (value, getEntityImageUrl, { forceHaBase = false } = {}) => {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  if (isAbsoluteImageUrl(raw)) return raw;
  if (typeof getEntityImageUrl === 'function' && (forceHaBase || shouldResolveWithHaBase(raw))) {
    return getEntityImageUrl(raw);
  }
  return raw;
};

const resolveSaunaImageUrl = (settings, entities, getEntityImageUrl) => {
  const raw = String(settings?.imageUrl ?? '').trim();
  if (raw) return resolveImageValue(raw, getEntityImageUrl);

  const imageEntityId = String(settings?.imageEntityId || '').trim();
  if (!imageEntityId) return null;

  const imageEntity = entities?.[imageEntityId];
  const picture = imageEntity?.attributes?.entity_picture;
  if (picture) return resolveImageValue(picture, getEntityImageUrl, { forceHaBase: true });

  const state = String(imageEntity?.state ?? '').trim();
  if (isAbsoluteImageUrl(state) || state.startsWith('/')) {
    return resolveImageValue(state, getEntityImageUrl, { forceHaBase: state.startsWith('/') });
  }

  return null;
};

const resolveTargetSettings = ({ cardSettings, getCardSettingsKey, targetCardId, targetPageId, activePage }) => {
  const settings = cardSettings || {};
  const candidates = [];

  if (typeof getCardSettingsKey === 'function') {
    if (targetPageId) candidates.push(getCardSettingsKey(targetCardId, targetPageId));
    if (activePage && activePage !== targetPageId) candidates.push(getCardSettingsKey(targetCardId, activePage));
    candidates.push(getCardSettingsKey(targetCardId));
  }

  candidates.push(targetCardId);

  const uniqueCandidates = Array.from(new Set(candidates.filter(Boolean)));
  for (const key of uniqueCandidates) {
    if (settings[key]) return settings[key];
  }

  const fallbackKey = Object.keys(settings).find((key) => key.endsWith(`::${targetCardId}`));
  return fallbackKey ? settings[fallbackKey] : {};
};

const formatTemperature = (entity) => {
  if (!entity || isUnavailable(entity.state)) return { value: '--', unit: '' };
  const numeric = Number.parseFloat(String(entity.state).replace(',', '.'));
  const unit = String(entity.attributes?.unit_of_measurement || 'deg C').replace('deg C', '°C');
  if (Number.isFinite(numeric)) return { value: numeric.toFixed(1), unit };
  return { value: String(entity.state), unit: '' };
};

export default function PopupLauncherCard({
  cardId,
  settings = {},
  dragProps,
  controls,
  cardStyle,
  editMode,
  customNames = {},
  cardSettings = {},
  entities = {},
  getCardSettingsKey,
  getEntityImageUrl,
  activePage,
  onOpenTarget,
  t,
}) {
  const heading = customNames[cardId] || settings.heading || tr(t, 'popupLauncher.defaultTitle', 'Quick access');
  const buttons = normalizeButtons(settings.buttons);
  const columns = clampColumns(settings.columns);
  const getSaunaSummary = (button) => {
    const targetSettings = resolveTargetSettings({
      cardSettings,
      getCardSettingsKey,
      targetCardId: button.targetCardId,
      targetPageId: button.targetPageId,
      activePage,
    });

    const tempEntity = targetSettings?.tempEntityId ? entities?.[targetSettings.tempEntityId] : null;
    const peopleEntity = targetSettings?.peopleNowEntityId ? entities?.[targetSettings.peopleNowEntityId] : null;
    const motionEntity = targetSettings?.motionEntityId ? entities?.[targetSettings.motionEntityId] : null;
    const modeEntity = targetSettings?.manualModeEntityId ? entities?.[targetSettings.manualModeEntityId] : null;
    const modeStateKnown = modeEntity && !isUnavailable(modeEntity.state);
    const autoModeOn = modeStateKnown && isOn(modeEntity.state);
    const temp = formatTemperature(tempEntity);

    return {
      imageUrl: resolveSaunaImageUrl(targetSettings, entities, getEntityImageUrl),
      temp,
      people: peopleEntity && !isUnavailable(peopleEntity.state) ? String(peopleEntity.state) : '--',
      motionConfigured: Boolean(targetSettings?.motionEntityId),
      motionOn: motionEntity ? isOnish(motionEntity.state) : false,
      showManual: Boolean(modeStateKnown && !autoModeOn),
    };
  };

  const openButtonTarget = (event, button, label, hasTarget) => {
    event.stopPropagation();
    if (editMode || !hasTarget || typeof onOpenTarget !== 'function') return;
    onOpenTarget({
      sourceCardId: cardId,
      buttonId: button.id,
      buttonLabel: label,
      targetCardId: button.targetCardId,
      targetPageId: button.targetPageId,
    });
  };

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
            const isSaunaButton = hasTarget && button.targetCardId.startsWith('sauna_card_');

            if (isSaunaButton) {
              const sauna = getSaunaSummary(button);
              const motionLabel = sauna.motionOn
                ? tr(t, 'sauna.motionDetected', 'Motion')
                : tr(t, 'sauna.noMotion', 'No motion');

              return (
                <button
                  key={button.id}
                  type="button"
                  disabled={editMode || !hasTarget}
                  onClick={(event) => openButtonTarget(event, button, label, hasTarget)}
                  className={`relative min-h-[128px] overflow-hidden rounded-2xl border text-left transition-all ${
                    editMode || !hasTarget
                      ? 'opacity-70 cursor-default border-[var(--glass-border)] bg-[var(--glass-bg)]'
                      : 'border-white/10 bg-slate-950/70 hover:border-emerald-300/30 active:scale-[0.98]'
                  }`}
                  aria-label={`${label}: ${sauna.temp.value}${sauna.temp.unit ? ` ${sauna.temp.unit}` : ''}, ${sauna.people} ${tr(t, 'sauna.peopleNow', 'people')}`}
                >
                  {sauna.imageUrl ? (
                    <img
                      src={sauna.imageUrl}
                      alt=""
                      className="absolute inset-0 h-full w-full object-cover"
                      draggable={false}
                    />
                  ) : (
                    <div className="absolute inset-0 bg-gradient-to-br from-emerald-950 via-slate-950 to-orange-950" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-black/20" />
                  <div className="relative z-10 flex min-h-[128px] flex-col justify-between p-3">
                    <div className="flex items-start justify-between gap-2">
                      {sauna.showManual ? (
                        <span className="rounded-full border border-orange-300/35 bg-orange-500/20 px-2 py-1 text-[9px] font-extrabold uppercase tracking-widest text-orange-100 shadow-[0_8px_16px_rgba(0,0,0,0.24)]">
                          {tr(t, 'sauna.manualMode', 'Manual')}
                        </span>
                      ) : (
                        <span />
                      )}
                      {sauna.motionConfigured && (
                        <span
                          className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full border ${
                            sauna.motionOn
                              ? 'border-emerald-200/80 bg-emerald-300 shadow-[0_0_14px_rgba(110,231,183,0.75)]'
                              : 'border-white/30 bg-white/25'
                          }`}
                          title={motionLabel}
                          aria-label={motionLabel}
                        />
                      )}
                    </div>

                    <div className="min-w-0">
                      <p className="truncate text-[11px] font-extrabold uppercase tracking-[0.16em] text-white/88">
                        {label}
                      </p>
                      <div className="mt-2 flex items-end justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-end gap-1.5 whitespace-nowrap">
                            <Thermometer className="mb-1 h-3.5 w-3.5 shrink-0 text-orange-200/85" />
                            <span className="text-2xl font-semibold leading-none tabular-nums text-white">
                              {sauna.temp.value}
                            </span>
                            {sauna.temp.unit && (
                              <span className="mb-0.5 text-[11px] font-bold text-white/72">
                                {sauna.temp.unit}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="inline-flex shrink-0 items-center gap-1 rounded-full border border-white/14 bg-black/32 px-2 py-1 text-[11px] font-extrabold tabular-nums text-white">
                          <User className="h-3 w-3 text-emerald-100/85" />
                          <span>{sauna.people}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </button>
              );
            }

            return (
              <button
                key={button.id}
                type="button"
                disabled={editMode || !hasTarget}
                onClick={(event) => openButtonTarget(event, button, label, hasTarget)}
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
