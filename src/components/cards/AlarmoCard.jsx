import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Clock, Shield, Siren, Sparkles, ToggleRight } from '../../icons';
import { getIconComponent } from '../../icons';
import { formatRelativeTime } from '../../utils';

const ARM_MODE_OPTIONS = [
  { key: 'away', label: 'Borte', service: 'alarm_arm_away' },
  { key: 'home', label: 'Hjemme', service: 'alarm_arm_home' },
  { key: 'night', label: 'Natt', service: 'alarm_arm_night' },
  { key: 'vacation', label: 'Ferie', service: 'alarm_arm_vacation' },
];

const ACTIVE_AUTO_STATES = new Set(['on', 'armed', 'active', 'enabled', 'home', 'scheduled', 'running']);
const UNAVAILABLE_STATES = new Set(['unknown', 'unavailable', 'none']);

const tr = (t, key, fallback) => {
  const out = typeof t === 'function' ? t(key) : undefined;
  const str = String(out ?? '').trim();
  if (!str || str === key || str.toLowerCase() === key.toLowerCase() || str.includes('.')) return fallback;
  return str;
};

const normalize = (value) => String(value ?? '').trim().toLowerCase();

const toFiniteNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const parseClockString = (value) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (/^\d+(?::\d{1,2}){1,2}$/.test(trimmed)) {
    const parts = trimmed.split(':').map((part) => Number(part));
    if (parts.some((part) => !Number.isFinite(part))) return null;
    if (parts.length === 2) return (parts[0] * 60) + parts[1];
    if (parts.length === 3) return (parts[0] * 3600) + (parts[1] * 60) + parts[2];
  }

  return null;
};

const parseFutureTimestampSeconds = (value, nowMs) => {
  if (typeof value !== 'string') return null;
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return null;
  const seconds = (timestamp.getTime() - nowMs) / 1000;
  return seconds > 0 ? seconds : null;
};

const parseSecondsValue = (value, nowMs) => {
  if (value === null || value === undefined || value === '') return null;

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string') {
    const clockSeconds = parseClockString(value);
    if (clockSeconds !== null) return clockSeconds;

    const numeric = toFiniteNumber(value);
    if (numeric !== null) return numeric;

    const futureSeconds = parseFutureTimestampSeconds(value, nowMs);
    if (futureSeconds !== null) return futureSeconds;
  }

  return null;
};

const findFirstSeconds = (source, keys, nowMs) => {
  if (!source || typeof source !== 'object') return null;
  for (const key of keys) {
    const parsed = parseSecondsValue(source[key], nowMs);
    if (parsed !== null) return parsed;
  }
  return null;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const formatCountdown = (seconds) => {
  if (!Number.isFinite(seconds)) return '--:--';
  const safeSeconds = Math.max(0, Math.ceil(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remainder = safeSeconds % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
  }

  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
};

const getAutoEntityLabel = (entityId, entity) => entity?.attributes?.friendly_name || entityId || 'Auto-arm';

const isEntityOn = (state) => ACTIVE_AUTO_STATES.has(normalize(state));

const buildCountdownSnapshot = ({ alarmEntity, countdownEntity, settings, nowMs }) => {
  const sourceEntity = countdownEntity || alarmEntity;
  const alarmState = normalize(alarmEntity?.state);
  const sourceState = normalize(sourceEntity?.state);
  const sourceAttributes = sourceEntity?.attributes || {};
  const allowAlarmAttributeCountdown = Boolean(countdownEntity) || ['arming', 'pending', 'triggered'].includes(alarmState);

  let remainingSeconds = null;
  let totalSeconds = null;

  if (sourceEntity?.entity_id?.startsWith?.('timer.') || sourceEntity?.entity_id?.split?.('.')[0] === 'timer' || sourceState === 'active' || sourceState === 'paused') {
    if (sourceState !== 'idle') {
      remainingSeconds = findFirstSeconds(sourceAttributes, ['finishes_at', 'remaining'], nowMs);
      totalSeconds = findFirstSeconds(sourceAttributes, ['duration'], nowMs);
    }
  }

  if (remainingSeconds === null && allowAlarmAttributeCountdown) {
    remainingSeconds = findFirstSeconds(sourceAttributes, [
      'finishes_at',
      'expires_at',
      'ends_at',
      'deadline',
      'countdown_end',
      'remaining',
      'remaining_time',
      'remaining_seconds',
      'seconds_remaining',
      'time_remaining',
      'delay_remaining',
      'delay',
      'countdown',
      'countdown_seconds',
      'pending_time_remaining',
      'entry_time_remaining',
      'exit_time_remaining',
      'arm_seconds_remaining',
      'arming_time_remaining',
      'arming_remaining',
    ], nowMs);
  }

  if (totalSeconds === null) {
    totalSeconds = findFirstSeconds(sourceAttributes, [
      'duration',
      'countdown_total',
      'delay_time',
      'pending_time',
      'arming_time',
      'entry_time',
      'exit_time',
      'time_total',
      'configured_duration',
    ], nowMs);
  }

  if (remainingSeconds === null && countdownEntity) {
    remainingSeconds = parseSecondsValue(countdownEntity?.state, nowMs);
  }

  if (totalSeconds === null) {
    totalSeconds = toFiniteNumber(settings?.countdownWindowSec);
  }

  if (remainingSeconds === null || remainingSeconds <= 0) {
    return {
      active: false,
      remainingSeconds: null,
      totalSeconds: totalSeconds && totalSeconds > 0 ? totalSeconds : null,
    };
  }

  const normalizedRemaining = Math.max(0, remainingSeconds);
  const normalizedTotal = Math.max(
    totalSeconds && totalSeconds > 0 ? totalSeconds : 0,
    normalizedRemaining,
    1,
  );

  return {
    active: true,
    remainingSeconds: normalizedRemaining,
    totalSeconds: normalizedTotal,
  };
};

const getTone = (state, hasCountdown) => {
  const normalizedState = normalize(state);
  if (normalizedState === 'triggered') {
    return {
      key: 'triggered',
      accent: '#fb7185',
      accentStrong: 'rgba(225, 29, 72, 0.42)',
      accentSoft: 'rgba(251, 113, 133, 0.16)',
      badgeClass: 'bg-rose-500/16 border-rose-400/25 text-rose-100',
      iconClass: 'text-rose-100 bg-rose-500/14 border-rose-400/30',
      buttonClass: 'bg-rose-500 text-white border-rose-400/40 shadow-[0_14px_40px_rgba(225,29,72,0.28)] hover:bg-rose-400',
      secondaryButtonClass: 'bg-rose-500/10 text-rose-100 border-rose-400/25 hover:bg-rose-500/14',
      panelClass: 'border-rose-400/18 bg-rose-500/10',
    };
  }

  if (hasCountdown || normalizedState === 'arming' || normalizedState === 'pending') {
    return {
      key: 'countdown',
      accent: '#fb923c',
      accentStrong: 'rgba(249, 115, 22, 0.36)',
      accentSoft: 'rgba(251, 146, 60, 0.16)',
      badgeClass: 'bg-orange-500/14 border-orange-400/25 text-orange-100',
      iconClass: 'text-orange-100 bg-orange-500/14 border-orange-400/28',
      buttonClass: 'bg-orange-500 text-white border-orange-300/40 shadow-[0_14px_40px_rgba(249,115,22,0.24)] hover:bg-orange-400',
      secondaryButtonClass: 'bg-orange-500/10 text-orange-100 border-orange-400/25 hover:bg-orange-500/14',
      panelClass: 'border-orange-400/18 bg-orange-500/10',
    };
  }

  if (normalizedState.startsWith('armed')) {
    return {
      key: 'armed',
      accent: '#34d399',
      accentStrong: 'rgba(16, 185, 129, 0.34)',
      accentSoft: 'rgba(52, 211, 153, 0.15)',
      badgeClass: 'bg-emerald-500/14 border-emerald-400/24 text-emerald-100',
      iconClass: 'text-emerald-100 bg-emerald-500/12 border-emerald-400/24',
      buttonClass: 'bg-emerald-500 text-slate-950 border-emerald-300/35 shadow-[0_14px_36px_rgba(16,185,129,0.2)] hover:bg-emerald-400',
      secondaryButtonClass: 'bg-emerald-500/10 text-emerald-100 border-emerald-400/25 hover:bg-emerald-500/14',
      panelClass: 'border-emerald-400/18 bg-emerald-500/10',
    };
  }

  return {
    key: 'idle',
    accent: '#60a5fa',
    accentStrong: 'rgba(59, 130, 246, 0.32)',
    accentSoft: 'rgba(96, 165, 250, 0.14)',
    badgeClass: 'bg-sky-500/14 border-sky-400/22 text-sky-100',
    iconClass: 'text-sky-100 bg-sky-500/12 border-sky-400/24',
    buttonClass: 'bg-sky-500 text-white border-sky-300/30 shadow-[0_14px_36px_rgba(59,130,246,0.2)] hover:bg-sky-400',
    secondaryButtonClass: 'bg-white/5 text-[var(--text-primary)] border-white/10 hover:bg-white/10',
    panelClass: 'border-white/10 bg-white/5',
  };
};

const getStatusMeta = (state, t) => {
  const normalizedState = normalize(state);

  if (UNAVAILABLE_STATES.has(normalizedState)) {
    return {
      label: tr(t, 'status.unavailable', 'Utilgjengelig'),
      detail: tr(t, 'alarmo.detail.unavailable', 'Ingen oppdatert alarmstatus akkurat na.'),
      headline: tr(t, 'alarmo.headline.unavailable', 'Ingen kontakt'),
    };
  }

  if (normalizedState === 'triggered') {
    return {
      label: tr(t, 'alarmo.status.triggered', 'Utlost'),
      detail: tr(t, 'alarmo.detail.triggered', 'Alarmen er aktiv og krever oppmerksomhet.'),
      headline: tr(t, 'alarmo.headline.triggered', 'Alarm utlost'),
    };
  }

  if (normalizedState === 'arming') {
    return {
      label: tr(t, 'alarmo.status.arming', 'Aktiverer'),
      detail: tr(t, 'alarmo.detail.arming', 'Utgangsdelay kjoper.'),
      headline: tr(t, 'alarmo.headline.arming', 'Aktiveres snart'),
    };
  }

  if (normalizedState === 'pending') {
    return {
      label: tr(t, 'alarmo.status.pending', 'Forsinkelse'),
      detail: tr(t, 'alarmo.detail.pending', 'Nedtelling for inntreden er i gang.'),
      headline: tr(t, 'alarmo.headline.pending', 'Sikre eller deaktiver'),
    };
  }

  if (normalizedState === 'armed_home') {
    return {
      label: tr(t, 'alarmo.status.armedHome', 'Armert hjemme'),
      detail: tr(t, 'alarmo.detail.armedHome', 'Skallet er sikret mens noen er hjemme.'),
      headline: tr(t, 'alarmo.headline.armedHome', 'Hjemmemodus aktiv'),
    };
  }

  if (normalizedState === 'armed_night') {
    return {
      label: tr(t, 'alarmo.status.armedNight', 'Armert natt'),
      detail: tr(t, 'alarmo.detail.armedNight', 'Nattmodus beskytter valgte soner.'),
      headline: tr(t, 'alarmo.headline.armedNight', 'Nattmodus aktiv'),
    };
  }

  if (normalizedState === 'armed_vacation') {
    return {
      label: tr(t, 'alarmo.status.armedVacation', 'Armert ferie'),
      detail: tr(t, 'alarmo.detail.armedVacation', 'Full beskyttelse mens huset star tomt.'),
      headline: tr(t, 'alarmo.headline.armedVacation', 'Feriemodus aktiv'),
    };
  }

  if (normalizedState.startsWith('armed')) {
    return {
      label: tr(t, 'alarmo.status.armedAway', 'Armert borte'),
      detail: tr(t, 'alarmo.detail.armedAway', 'Hjemmet overvakes med full alarmprofil.'),
      headline: tr(t, 'alarmo.headline.armedAway', 'Bortemodus aktiv'),
    };
  }

  return {
    label: tr(t, 'alarmo.status.disarmed', 'Frakoblet'),
    detail: tr(t, 'alarmo.detail.disarmed', 'Alarmen er klar til ny aktivering.'),
    headline: tr(t, 'alarmo.headline.disarmed', 'Klar for arming'),
  };
};

const getCountdownLabel = (state, t) => {
  const normalizedState = normalize(state);
  if (normalizedState === 'arming') return tr(t, 'alarmo.countdown.arming', 'Aktiveres om');
  if (normalizedState === 'pending') return tr(t, 'alarmo.countdown.pending', 'Alarm om');
  if (normalizedState === 'triggered') return tr(t, 'alarmo.countdown.triggered', 'Utlost');
  return tr(t, 'alarmo.countdown.default', 'Nedtelling');
};

const getArmMode = (settings) => {
  const selected = ARM_MODE_OPTIONS.find((option) => option.key === settings?.armMode);
  return selected || ARM_MODE_OPTIONS[0];
};

const resolveAlarmEntityId = (cardId, settings) => {
  if (settings?.alarmEntityId) return settings.alarmEntityId;
  if (Array.isArray(settings?.entityIds) && settings.entityIds.length > 0) return settings.entityIds[0];
  return cardId?.startsWith?.('alarm_control_panel.') ? cardId : null;
};

export default function AlarmoCard({
  cardId,
  settings,
  entityId,
  entity,
  countdownEntity,
  autoArmEntity,
  dragProps,
  controls,
  cardStyle,
  editMode,
  customNames,
  customIcons,
  t,
  callService,
}) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  const alarmEntityId = resolveAlarmEntityId(entityId || cardId, settings);
  const selectedArmMode = getArmMode(settings);
  const state = normalize(entity?.state);
  const unavailable = UNAVAILABLE_STATES.has(state);
  const countdown = useMemo(() => buildCountdownSnapshot({
    alarmEntity: entity,
    countdownEntity,
    settings,
    nowMs,
  }), [entity, countdownEntity, settings, nowMs]);

  useEffect(() => {
    if (!countdown.active || typeof window === 'undefined') return undefined;

    const intervalId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 250);

    return () => window.clearInterval(intervalId);
  }, [countdown.active]);

  const tone = getTone(state, countdown.active);
  const statusMeta = getStatusMeta(state, t);
  const selectedIconName = customIcons?.[cardId];
  const Icon = selectedIconName ? (getIconComponent(selectedIconName) || Shield) : (state === 'triggered' ? Siren : Shield);
  const heading = customNames?.[cardId] || settings?.heading || tr(t, 'alarmo.defaultTitle', 'Alarmo');
  const entityLabel = entity?.attributes?.friendly_name || alarmEntityId || tr(t, 'alarmo.entityFallback', 'Alarm');
  const showEntityLabel = heading !== entityLabel;
  const autoArmConfigured = Boolean(settings?.autoArmEntityId && autoArmEntity);
  const autoArmActive = isEntityOn(autoArmEntity?.state);
  const primaryActionIsDisarm = state.startsWith('armed') || state === 'triggered' || state === 'arming' || state === 'pending';
  const isTriggered = state === 'triggered';
  const isInteractive = !editMode;
  const lastChanged = formatRelativeTime(entity?.last_changed, t);
  const countdownDisplay = countdown.active ? formatCountdown(countdown.remainingSeconds) : '--:--';
  const progressRatio = countdown.active
    ? clamp(countdown.remainingSeconds / Math.max(countdown.totalSeconds || 1, 1), 0, 1)
    : (state.startsWith('armed') ? 1 : 0.24);
  const ringRadius = 42;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringOffset = ringCircumference * (1 - progressRatio);

  const metrics = [
    {
      label: tr(t, 'alarmo.metric.mode', 'Modus'),
      value: selectedArmMode.label,
      emphasize: tone.key === 'armed' && !primaryActionIsDisarm,
    },
    {
      label: tr(t, 'alarmo.metric.autoArm', 'Auto'),
      value: autoArmConfigured
        ? (autoArmActive ? tr(t, 'common.on', 'Pa') : tr(t, 'common.off', 'Av'))
        : tr(t, 'alarmo.metric.notConfigured', 'Ikke satt'),
      emphasize: autoArmConfigured && autoArmActive,
    },
    {
      label: tr(t, 'alarmo.metric.updated', 'Sist'),
      value: lastChanged,
      emphasize: false,
    },
  ];

  const countdownSourceLabel = countdownEntity
    ? (countdownEntity?.attributes?.friendly_name || settings?.countdownEntityId)
    : tr(t, 'alarmo.countdown.auto', 'Bruker alarmstatus');

  const primaryLabel = primaryActionIsDisarm
    ? tr(t, 'common.disarm', 'Deaktiver')
    : `${tr(t, 'common.arm', 'Aktiver')} ${selectedArmMode.label.toLowerCase()}`;
  const primaryButtonClass = primaryActionIsDisarm && tone.key !== 'triggered'
    ? 'bg-white/7 text-[var(--text-primary)] border-white/10 shadow-none hover:bg-white/12'
    : tone.buttonClass;

  const handlePrimaryAction = (event) => {
    event.stopPropagation();
    if (!alarmEntityId || unavailable || typeof callService !== 'function') return;

    if (primaryActionIsDisarm) {
      callService('alarm_control_panel', 'alarm_disarm', { entity_id: alarmEntityId });
      return;
    }

    callService('alarm_control_panel', selectedArmMode.service, { entity_id: alarmEntityId });
  };

  const handleAutoToggle = (event) => {
    event.stopPropagation();
    if (!settings?.autoArmEntityId || !autoArmEntity || typeof callService !== 'function') return;
    const domain = String(settings.autoArmEntityId).split('.')[0];
    if (!['automation', 'input_boolean', 'switch'].includes(domain)) return;
    callService(domain, 'toggle', { entity_id: settings.autoArmEntityId });
  };

  if (!entity || !alarmEntityId) return null;

  return (
    <div
      {...dragProps}
      data-haptic={editMode ? undefined : 'card'}
      data-tone={tone.key}
      className={`alarmo-card touch-feedback relative isolate h-full overflow-hidden rounded-[2rem] border p-4 sm:p-5 md:p-6 font-sans ${editMode ? 'cursor-move' : 'cursor-default'}`}
      style={{
        ...cardStyle,
        containerType: 'inline-size',
        '--alarmo-accent': tone.accent,
        '--alarmo-accent-strong': tone.accentStrong,
        '--alarmo-accent-soft': tone.accentSoft,
      }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          borderRadius: 'inherit',
          background: 'radial-gradient(circle at top right, rgba(255,255,255,0.1), transparent 34%), linear-gradient(160deg, color-mix(in srgb, var(--card-bg) 72%, var(--alarmo-accent-soft)) 0%, color-mix(in srgb, var(--modal-bg) 84%, transparent) 100%)',
        }}
      />
      <div className="alarmo-card__sweep absolute inset-x-[-30%] top-0 h-28 pointer-events-none opacity-70" />
      <div className="absolute inset-0 rounded-[inherit] border border-white/6 pointer-events-none" />

      <div className="relative z-20">{controls}</div>

      <div className="alarmo-card__header relative z-10 flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          <div className={`alarmo-card__icon-shell relative flex h-24 w-24 shrink-0 items-center justify-center rounded-[1.75rem] border ${tone.iconClass}`}>
            <svg className="absolute inset-2 -rotate-90" viewBox="0 0 100 100" aria-hidden="true">
              <circle cx="50" cy="50" r={ringRadius} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="5" />
              <circle
                cx="50"
                cy="50"
                r={ringRadius}
                fill="none"
                stroke="var(--alarmo-accent)"
                strokeWidth="5"
                strokeLinecap="round"
                strokeDasharray={ringCircumference}
                strokeDashoffset={ringOffset}
                style={{ transition: countdown.active ? 'stroke-dashoffset 200ms linear' : 'stroke-dashoffset 320ms cubic-bezier(0.22, 1, 0.36, 1)' }}
              />
            </svg>
            <div className={`absolute inset-3 rounded-[1.4rem] border ${tone.panelClass}`} />
            <div className={`alarmo-card__icon-core relative z-10 flex h-14 w-14 items-center justify-center rounded-[1.1rem] border ${tone.panelClass}`}>
              <Icon className={`h-7 w-7 ${isTriggered ? 'alarmo-card__icon-alert' : ''}`} />
            </div>
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.26em] text-[var(--text-secondary)]">
                <Sparkles className="h-3.5 w-3.5" />
                {tr(t, 'alarmo.eyebrow', 'Alarmo')}
              </span>
              <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.22em] ${tone.badgeClass}`}>
                {statusMeta.label}
              </span>
            </div>

            <h3 className="mt-3 text-[clamp(1.55rem,3.4cqi,2.4rem)] font-semibold leading-[0.95] tracking-[-0.03em] text-[var(--text-primary)]">
              {heading}
            </h3>
            {showEntityLabel && (
              <p className="mt-2 max-w-xl text-sm text-[var(--text-secondary)]">
                {entityLabel}
              </p>
            )}
            <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--text-secondary)]">
              {statusMeta.detail}
            </p>
          </div>
        </div>

        {autoArmConfigured && (
          <button
            type="button"
            disabled={!isInteractive}
            onClick={handleAutoToggle}
            className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-full border px-3 text-xs font-bold uppercase tracking-[0.2em] transition-all ${tone.secondaryButtonClass} ${!isInteractive ? 'cursor-default opacity-70' : ''}`}
          >
            <ToggleRight className={`h-4 w-4 transition-transform ${autoArmActive ? 'translate-x-0' : 'opacity-70'}`} />
            {autoArmActive ? tr(t, 'alarmo.autoArm.on', 'Auto pa') : tr(t, 'alarmo.autoArm.off', 'Auto av')}
          </button>
        )}
      </div>

      <div className={`alarmo-card__hero relative z-10 mt-5 rounded-[1.7rem] border p-4 sm:p-5 ${tone.panelClass}`}>
        <div className="alarmo-card__hero-grid flex items-end justify-between gap-4">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--text-secondary)]">
              <Clock className="h-3.5 w-3.5" />
              {countdown.active ? getCountdownLabel(state, t) : statusMeta.headline}
            </div>

            <div
              key={countdown.active ? countdownDisplay : statusMeta.label}
              className={`alarmo-card__hero-value mt-4 text-[clamp(2.45rem,8.8cqi,5.25rem)] font-semibold leading-[0.9] tracking-[-0.05em] text-[var(--text-primary)] ${countdown.active ? 'tabular-nums' : ''}`}
            >
              {countdown.active ? countdownDisplay : statusMeta.label}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-[var(--text-secondary)]">
              <span>{countdown.active ? countdownSourceLabel : tr(t, 'alarmo.status.steady', 'Stabil status')}</span>
              {isTriggered && (
                <span className="inline-flex items-center gap-1 rounded-full border border-rose-400/25 bg-rose-500/12 px-2 py-1 text-rose-100">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {tr(t, 'alarmo.triggered.attention', 'Krever oppmerksomhet')}
                </span>
              )}
            </div>
          </div>

          <div className="alarmo-card__hero-aside flex min-w-[7.5rem] flex-col items-end gap-3">
            <div className="text-right">
              <div className="text-[10px] font-bold uppercase tracking-[0.26em] text-[var(--text-secondary)]">
                {tr(t, 'alarmo.selectedMode', 'Valgt modus')}
              </div>
              <div className="mt-1 text-base font-semibold text-[var(--text-primary)]">
                {selectedArmMode.label}
              </div>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/8">
              <div
                className="h-full origin-left rounded-full bg-[var(--alarmo-accent)] shadow-[0_0_24px_var(--alarmo-accent)] transition-transform duration-300 ease-linear"
                style={{ transform: `scaleX(${clamp(progressRatio, 0, 1)})` }}
              />
            </div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-[var(--text-secondary)]">
              {countdown.active
                ? `${Math.round(clamp(progressRatio * 100, 0, 100))}% ${tr(t, 'alarmo.remaining', 'igjen')}`
                : tr(t, 'alarmo.ready', 'Klar')}
            </div>
          </div>
        </div>
      </div>

      <div className="alarmo-card__metrics relative z-10 mt-5 grid grid-cols-3 gap-3">
        {metrics.map((metric) => (
          <div
            key={metric.label}
            className={`rounded-[1.3rem] border px-3 py-3.5 ${metric.emphasize ? tone.panelClass : 'border-white/10 bg-white/[0.04]'}`}
          >
            <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--text-secondary)]">
              {metric.label}
            </div>
            <div className="mt-2 truncate text-sm font-semibold text-[var(--text-primary)]">
              {metric.value}
            </div>
          </div>
        ))}
      </div>

      <div className="alarmo-card__actions relative z-10 mt-5 grid grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] gap-3">
        <button
          type="button"
          disabled={!isInteractive || unavailable}
          onClick={handlePrimaryAction}
          className={`inline-flex min-h-14 items-center justify-center rounded-[1.2rem] border px-4 text-sm font-bold uppercase tracking-[0.22em] transition-all ${primaryButtonClass} ${!isInteractive || unavailable ? 'cursor-default opacity-60' : ''}`}
        >
          {primaryLabel}
        </button>

        <div className={`rounded-[1.2rem] border px-4 py-3 ${tone.secondaryButtonClass}`}>
          <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--text-secondary)]">
            {tr(t, 'alarmo.autoArm.source', 'Auto-arm kilde')}
          </div>
          <div className="mt-2 truncate text-sm font-semibold text-[var(--text-primary)]">
            {settings?.autoArmEntityId
              ? getAutoEntityLabel(settings.autoArmEntityId, autoArmEntity)
              : tr(t, 'alarmo.autoArm.notSet', 'Ikke koblet')}
          </div>
        </div>
      </div>
    </div>
  );
}
