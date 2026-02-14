import React, { useMemo } from 'react';
import { Flame, Thermometer, Lock, DoorOpen, Activity, Lightbulb, Shield } from '../../icons';
import { getIconComponent } from '../../icons';

const asArray = (v) => (Array.isArray(v) ? v.filter(Boolean) : []);
const norm = (s) => String(s ?? '').toLowerCase();

// Treat these as ON for your HA entities
const isOn = (state) => ['on', 'true', '1', 'yes'].includes(norm(state));
const isOnish = (state) => ['on', 'open', 'unlocked', 'heat', 'heating', 'true', '1', 'yes'].includes(norm(state));

const countOn = (ids, entities) => ids.filter((id) => isOnish(entities?.[id]?.state)).length;

const toNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const cx = (...p) => p.filter(Boolean).join(' ');

// Fallback if t() returns translation keys (SAUNA.X / sauna.y)
function makeTr(t) {
  return (key, fallback) => {
    const out = typeof t === 'function' ? t(key) : undefined;
    const s = String(out ?? '');
    const looksLikeKey =
      !s ||
      s === key ||
      s.toLowerCase() === key.toLowerCase() ||
      s === s.toUpperCase() ||
      (s.includes('.') && (s.toLowerCase().includes('sauna.') || s.toLowerCase().includes('common.') || s.toLowerCase().includes('binary.')));
    return looksLikeKey ? fallback : s;
  };
}

// Animated flame icon (very visible “heating”)
const FlameAnimated = ({ className }) => (
  <div className={cx('relative', className)}>
    <div className="absolute inset-0 rounded-full blur-md opacity-70 bg-orange-400/30 animate-pulse" />
    <Flame className="relative w-full h-full text-orange-300 animate-[flameWiggle_1.2s_ease-in-out_infinite]" />
    <style>{`
      @keyframes flameWiggle {
        0%   { transform: translateY(0) rotate(-2deg) scale(1.00); }
        35%  { transform: translateY(-1px) rotate(2deg) scale(1.04); }
        70%  { transform: translateY(0.5px) rotate(-1deg) scale(0.99); }
        100% { transform: translateY(0) rotate(-2deg) scale(1.00); }
      }
    `}</style>
  </div>
);

// Try to resolve an image URL from settings or entity
function resolveImageUrl(settings, entities) {
  // 1) Hardcoded URL in settings
  const raw = String(settings?.imageUrl ?? '').trim();
  if (raw) return raw;

  // 2) Entity-based (camera/image/sensor attribute entity_picture)
  if (settings?.imageEntityId) {
    const ent = entities?.[settings.imageEntityId];
    const pic = ent?.attributes?.entity_picture;
    if (pic) return pic;

    // Some people store URL directly as state
    const state = String(ent?.state ?? '');
    if (state.startsWith('http://') || state.startsWith('https://') || state.startsWith('/')) return state;
  }

  return null;
}

export default function SaunaCard({
  cardId,
  settings,
  entities,
  dragProps,
  controls,
  cardStyle,
  editMode,
  customNames,
  customIcons,
  t,
  modals, // expects { setShowLightModal }
}) {
  const tr = useMemo(() => makeTr(t), [t]);

  const saunaName = customNames?.[cardId] || settings?.name || tr('sauna.name', 'Badstue');
  const iconName = customIcons?.[cardId] || settings?.icon;
  const SaunaIcon = iconName ? (getIconComponent(iconName) || Flame) : Flame;

  // =========================
  // Entities
  // =========================
  const tempEntity = settings?.tempEntityId ? entities?.[settings.tempEntityId] : null;
  const thermostatEntity = settings?.thermostatEntityId ? entities?.[settings.thermostatEntityId] : null;
  const motionEntity = settings?.motionEntityId ? entities?.[settings.motionEntityId] : null;
  const flameEntity = settings?.flameEntityId ? entities?.[settings.flameEntityId] : null;

  // ✅ Oppvarmingstid (minutes) input_number
  const preheatMinutesEntity = settings?.preheatMinutesEntityId ? entities?.[settings.preheatMinutesEntityId] : null;
  const preheatMinutes = toNum(preheatMinutesEntity?.state);

  // ✅ Auto/Manuell boolean (ON => Auto, OFF => Manuell)
  const manualModeEntity = settings?.manualModeEntityId ? entities?.[settings.manualModeEntityId] : null;
  const autoModeOn = isOn(manualModeEntity?.state);

  // ✅ Sauna “active” boolean for safety checks (only check safety when ON)
  const saunaActiveBoolEntity = settings?.saunaActiveBooleanEntityId ? entities?.[settings.saunaActiveBooleanEntityId] : null;
  const saunaIsActive = isOn(saunaActiveBoolEntity?.state);

  // Booking entities (optional)
  const serviceEntity = settings?.serviceEntityId ? entities?.[settings.serviceEntityId] : null;
  const nextBookingEntity = settings?.nextBookingInMinutesEntityId ? entities?.[settings.nextBookingInMinutesEntityId] : null;
  const peopleNowEntity = settings?.peopleNowEntityId ? entities?.[settings.peopleNowEntityId] : null;
  const preheatWindowEntity = settings?.preheatWindowEntityId ? entities?.[settings.preheatWindowEntityId] : null;

  const lightIds = useMemo(() => asArray(settings?.lightEntityIds), [settings?.lightEntityIds]);
  const lockIds = useMemo(() => asArray(settings?.lockEntityIds), [settings?.lockEntityIds]);
  const doorIds = useMemo(() => asArray(settings?.doorEntityIds), [settings?.doorEntityIds]);

  // =========================
  // Derived
  // =========================
  const currentTemp = tempEntity ? Number.parseFloat(tempEntity.state) : null;
  const tempIsValid = Number.isFinite(currentTemp);

  const thermostatOn = isOnish(thermostatEntity?.state);
  const motionOn = isOnish(motionEntity?.state);
  const flameOn = isOnish(flameEntity?.state);

  const lightsOn = countOn(lightIds, entities);
  const unlockedDoors = lockIds.filter((id) => norm(entities?.[id]?.state) === 'unlocked').length;
  const openDoors = countOn(doorIds, entities);

  // ✅ Safety only when saunaIsActive boolean is ON
  const hasSafetyAlert = saunaIsActive && (openDoors > 0 || unlockedDoors > 0);

  // Temp thresholds
  const inUseTempC = Number.isFinite(Number(settings?.inUseTempC)) ? Number(settings.inUseTempC) : 45;
  const warmTempC = Number.isFinite(Number(settings?.warmTempC)) ? Number(settings.warmTempC) : 35;
  const isInUseByTemp = tempIsValid && currentTemp >= inUseTempC;
  const isWarmByTemp = tempIsValid && currentTemp >= warmTempC;

  // Booking state
  const serviceState = serviceEntity?.state ?? '';
  const serviceYes = serviceState === 'Ja';
  const serviceNo = serviceState === 'Nei';
  const nextMinutes = toNum(nextBookingEntity?.state);
  const hasNext = nextMinutes != null && nextMinutes >= 0;
  const peopleNow = peopleNowEntity?.state ?? '0';
  const preheatOn = isOn(preheatWindowEntity?.state);

  // =========================
  // Center image
  // =========================
  const imageUrl = useMemo(() => resolveImageUrl(settings, entities), [settings, entities]);

  // =========================
  // Global lights modal opener
  // =========================
  const openGlobalLightModal = () => {
    if (editMode) return;
    const target = settings?.lightsModalEntityId || lightIds?.[0];
    if (!target) return;
    if (modals?.setShowLightModal) modals.setShowLightModal(target);
  };

  // =========================
  // Mode pill
  // =========================
  const modePill = {
    label: autoModeOn ? tr('sauna.autoMode', 'Auto modus') : tr('sauna.manualMode', 'Manuell modus'),
    cls: autoModeOn
      ? 'bg-emerald-500/16 border-emerald-400/22 text-emerald-200'
      : 'bg-orange-500/18 border-orange-400/25 text-orange-200',
  };

  // =========================
  // Primary state
  // =========================
  const primaryState = (() => {
    if (hasSafetyAlert) {
      const desc =
        unlockedDoors > 0
          ? `${unlockedDoors} ${unlockedDoors === 1 ? tr('sauna.unlockedShort', 'ulåst') : tr('sauna.unlockedShortPlural', 'ulåste')}`
          : `${openDoors} ${openDoors === 1 ? tr('sauna.openShort', 'åpen') : tr('sauna.openShortPlural', 'åpne')}`;
      return { label: tr('sauna.attention', 'OBS'), desc: `${tr('sauna.safety', 'Sikkerhet')}: ${desc}`, tone: 'danger' };
    }

    // Heating first (extra prominent)
    if (flameOn) return { label: tr('sauna.heating', 'Varmer'), desc: tr('sauna.heatingUp', 'Varmer opp'), tone: 'hot' };

    if (saunaIsActive && serviceYes) return { label: tr('sauna.service', 'Service'), desc: tr('sauna.serviceOngoing', 'Pågår nå'), tone: 'warn' };
    if (saunaIsActive) return { label: tr('sauna.active', 'Aktiv'), desc: tr('sauna.bookingNow', 'Pågående økt'), tone: 'ok' };

    if (preheatOn) {
      return {
        label: tr('sauna.preheat', 'Forvarmer'),
        desc: hasNext ? `${tr('sauna.next', 'Neste')}: ${Math.round(nextMinutes)}m` : tr('sauna.beforeBooking', 'Før booking'),
        tone: 'warm',
      };
    }

    if (isInUseByTemp) return { label: tr('sauna.inUse', 'I bruk'), desc: tr('sauna.hotCabin', 'Varm badstue'), tone: 'ok' };
    if (isWarmByTemp) return { label: tr('sauna.warm', 'Varm'), desc: tr('sauna.readySoon', 'Snart klar'), tone: 'warm' };

    if (thermostatOn) return { label: tr('common.on', 'På'), desc: tr('sauna.standby', 'Standby'), tone: 'info' };
    return { label: tr('common.off', 'Av'), desc: hasNext ? `${tr('sauna.next', 'Neste')}: ${Math.round(nextMinutes)}m` : tr('sauna.inactive', 'Inaktiv'), tone: 'muted' };
  })();

  const tone = (
    {
      hot:    { pill: 'bg-orange-500/18 border-orange-400/25 text-orange-200', icon: 'text-orange-300' },
      warm:   { pill: 'bg-amber-500/14 border-amber-400/20 text-amber-200',   icon: 'text-amber-300' },
      ok:     { pill: 'bg-emerald-500/14 border-emerald-400/20 text-emerald-200', icon: 'text-emerald-300' },
      info:   { pill: 'bg-blue-500/14 border-blue-400/20 text-blue-200',      icon: 'text-blue-300' },
      warn:   { pill: 'bg-orange-500/14 border-orange-400/20 text-orange-200', icon: 'text-orange-300' },
      danger: { pill: 'bg-rose-500/14 border-rose-400/20 text-rose-200',      icon: 'text-rose-300' },
      muted:  { pill: 'bg-[var(--glass-bg-hover)] border-[var(--glass-border)] text-[var(--text-secondary)]', icon: 'text-[var(--text-secondary)]' },
    }[primaryState.tone] || { pill: 'bg-[var(--glass-bg-hover)] border-[var(--glass-border)] text-[var(--text-secondary)]', icon: 'text-[var(--text-secondary)]' }
  );

  // =========================
  // Booking line (compact)
  // =========================
  const bookingLine = (() => {
    if (settings?.showBookingOverview === false) return null;

    const hasAny =
      settings?.nextBookingInMinutesEntityId ||
      settings?.peopleNowEntityId ||
      settings?.serviceEntityId ||
      settings?.preheatWindowEntityId;

    if (!hasAny) return null;

    const serviceTxt = serviceYes ? ` • ${tr('sauna.serviceOngoing', 'Service')}` : serviceNo ? ` • ${tr('sauna.normalBooking', 'Vanlig')}` : '';

    if (saunaIsActive) {
      const tempTxt = tempIsValid ? `${Math.round(currentTemp)}°C` : '--°C';
      return `${tr('sauna.session', 'Økt')}: ${tempTxt} • ${peopleNow} ${tr('sauna.people', 'pers')}${serviceTxt}`;
    }

    const nextTxt = hasNext ? `${tr('sauna.nextBookingIn', 'Neste om')} ${Math.round(nextMinutes)} min` : tr('sauna.noBookingsToday', 'Ingen bookinger i dag');
    const preheatTxt = preheatOn ? `${tr('sauna.preheating', 'Forvarmer')} • ` : '';
    return `${tr('sauna.booking', 'Booking')}: ${preheatTxt}${nextTxt}${serviceTxt}`;
  })();

  // =========================
  // Stats
  // =========================
  const statItems = [
    settings?.showThermostat !== false && {
      key: 'thermostat',
      icon: Shield,
      title: tr('sauna.thermostat', 'Termostat'),
      value: thermostatOn ? tr('common.on', 'På') : tr('common.off', 'Av'),
      active: thermostatOn,
    },
    settings?.showLights !== false && {
      key: 'lights',
      icon: Lightbulb,
      title: tr('sauna.lights', 'Lys'),
      value: lightIds.length ? `${lightsOn}/${lightIds.length} ${tr('common.on', 'på')}` : '--',
      active: lightsOn > 0,
      onClick: openGlobalLightModal,
      clickable: Boolean(settings?.lightsModalEntityId || lightIds?.length),
    },
    settings?.showDoors !== false && {
      key: 'doors',
      icon: DoorOpen,
      title: tr('sauna.doors', 'Dør'),
      value: `${openDoors} ${openDoors === 1 ? tr('sauna.openShort', 'åpen') : tr('sauna.openShortPlural', 'åpne')}`,
      active: openDoors > 0,
    },
    settings?.showLocks !== false && {
      key: 'locks',
      icon: Lock,
      title: tr('sauna.locks', 'Lås'),
      value: `${unlockedDoors} ${unlockedDoors === 1 ? tr('sauna.unlockedShort', 'ulåst') : tr('sauna.unlockedShortPlural', 'ulåste')}`,
      active: unlockedDoors > 0,
    },
    settings?.showMotion !== false && {
      key: 'motion',
      icon: Activity,
      title: tr('sauna.motion', 'Bevegelse'),
      value: motionOn ? tr('sauna.motionDetected', 'Registrert') : tr('sauna.noMotion', 'Ingen'),
      active: motionOn,
    },
  ].filter(Boolean);

  return (
    <div
      {...dragProps}
      data-haptic={editMode ? undefined : 'card'}
      className={cx(
        'touch-feedback relative p-5 rounded-[2.5rem] transition-all duration-300 overflow-hidden font-sans h-full',
        'border border-[var(--glass-border)] bg-[var(--glass-bg)]',
        !editMode ? 'cursor-pointer active:scale-[0.98]' : 'cursor-move'
      )}
      style={cardStyle}
    >
      {controls}

      <div className="relative z-10 h-full flex flex-col">
        {/* ✅ TOP: 3 columns (header / image / statuses) */}
        <div className="grid grid-cols-3 items-start gap-4">
          {/* Left header */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-12 h-12 rounded-full flex items-center justify-center border bg-[var(--glass-bg-hover)] border-[var(--glass-border)]">
              {flameOn ? <FlameAnimated className="w-6 h-6" /> : <SaunaIcon className={cx('w-6 h-6', tone.icon)} />}
            </div>
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-widest text-[var(--text-secondary)] font-bold">
                {tr('sauna.operator', 'Badstue')}
              </p>
              <h3 className="text-lg font-bold text-[var(--text-primary)] truncate">{saunaName}</h3>
            </div>
          </div>

          {/* Center image (true centered) */}
          <div className="flex justify-center">
            <div className="relative w-48 h-48 rounded-full overflow-hidden border border-[var(--glass-border)] bg-[var(--glass-bg-hover)] shadow-[0_16px_45px_rgba(0,0,0,0.45)]">
              {imageUrl ? (
                <img src={imageUrl} alt={saunaName} className="w-full h-full object-cover" draggable={false} />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-white/10 to-black/20" />
              )}
              <div className="absolute inset-0 rounded-full ring-1 ring-white/10" />
              {flameOn && (
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-full border bg-orange-500/18 border-orange-400/25 text-orange-200 text-[10px] uppercase tracking-widest font-extrabold">
                  {tr('sauna.heating', 'Varmer')}
                </div>
              )}
            </div>
          </div>

          {/* Right statuses — aligned with header (same row top) */}
          <div className="text-right flex flex-col items-end gap-2">
            {settings?.showManualMode !== false && settings?.manualModeEntityId && (
              <div className={cx('px-4 py-2 rounded-full text-[12px] uppercase tracking-widest font-extrabold border', modePill.cls)}>
                {modePill.label}
              </div>
            )}

            <div className={cx('px-4 py-2 rounded-full text-[12px] uppercase tracking-widest font-extrabold border', tone.pill)}>
              <span className={cx('inline-block w-2 h-2 rounded-full mr-2 align-middle', primaryState.tone === 'muted' ? 'bg-[var(--text-secondary)]/50' : 'bg-current')} />
              <span className="align-middle">{primaryState.label}</span>
            </div>

            <div className="text-[12px] text-[var(--text-secondary)] font-medium text-right">
              {primaryState.desc}
            </div>
          </div>
        </div>

        {/* Booking line */}
        {bookingLine && (
          <div className="mt-3 rounded-2xl px-3 py-2 border bg-[var(--glass-bg-hover)] border-[var(--glass-border)]">
            <div className="text-xs font-bold text-[var(--text-primary)] truncate">{bookingLine}</div>
          </div>
        )}

        {/* ✅ Row 2: Temp (col 1-2) + Preheat (col 3) */}
        <div className="mt-4 grid grid-cols-3 gap-4 items-end">
          <div className="col-span-2 flex items-end gap-2">
            <Thermometer className="w-4 h-4 text-[var(--text-secondary)] mb-1" />
            <span className="text-5xl font-semibold leading-none tabular-nums text-[var(--text-primary)]">
              {tempIsValid ? currentTemp.toFixed(1) : '--'}
            </span>
            <span className="text-2xl text-[var(--text-secondary)] mb-1">°C</span>
          </div>

          <div className="col-span-1 text-right">
            <div className="text-[10px] uppercase tracking-widest font-bold text-[var(--text-secondary)]">
              {tr('sauna.preheatTime', 'Oppvarmingstid')}
            </div>
            <div className="text-base font-bold text-[var(--text-primary)]">
              {preheatMinutes != null ? `${Math.round(preheatMinutes)} min` : '--'}
            </div>
          </div>
        </div>

        {/* Safety box (only when saunaActiveBoolean is ON) */}
        {hasSafetyAlert && (
          <div className="mt-4 rounded-2xl px-3 py-2 border bg-rose-500/10 border-rose-400/20">
            <div className="text-[10px] uppercase tracking-widest font-extrabold text-[var(--text-secondary)]">
              {tr('sauna.safety', 'Sikkerhet')}
            </div>
            <div className="text-sm font-extrabold text-[var(--text-primary)] truncate">
              {unlockedDoors > 0
                ? `${unlockedDoors} ${unlockedDoors === 1 ? tr('sauna.unlockedShort', 'ulåst') : tr('sauna.unlockedShortPlural', 'ulåste')}`
                : `${openDoors} ${openDoors === 1 ? tr('sauna.openShort', 'åpen') : tr('sauna.openShortPlural', 'åpne')}`}
            </div>
          </div>
        )}

        {/* Stats grid */}
        <div className="mt-5 grid grid-cols-2 gap-2">
          {statItems.map((item) => {
            const Icon = item.icon;
            const clickable = Boolean(item.onClick) && !editMode && (item.clickable ?? true);
            return (
              <button
                type="button"
                key={item.key}
                onClick={clickable ? item.onClick : undefined}
                className={cx(
                  'rounded-2xl px-3 py-3 border flex items-center gap-2 text-left transition',
                  clickable ? 'active:scale-[0.99] cursor-pointer' : 'cursor-default',
                  item.active ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-[var(--glass-bg-hover)] border-[var(--glass-border)]'
                )}
              >
                <Icon className={cx('w-4 h-4', item.active ? 'text-emerald-300' : 'text-[var(--text-secondary)]')} />
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-widest font-extrabold text-[var(--text-secondary)] truncate">
                    {item.title}
                  </div>
                  <div className="text-sm font-extrabold text-[var(--text-primary)] truncate">
                    {item.value}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Optional hint */}
        {settings?.showThresholdHint && (
          <div className="mt-3 text-[11px] text-[var(--text-secondary)]">
            {tr('sauna.thresholdHint', `I bruk ≥ ${inUseTempC}°C · Varm ≥ ${warmTempC}°C`)}
          </div>
        )}
      </div>
    </div>
  );
}