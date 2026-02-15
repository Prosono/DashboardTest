import React, { useMemo } from 'react';
import { Flame, Thermometer, Lock, DoorOpen, Activity, Lightbulb, Shield, Fan, Hash, ToggleRight, Wrench, Power } from '../../icons';
import { getIconComponent } from '../../icons';

const asArray = (v) => (Array.isArray(v) ? v.filter(Boolean) : []);
const norm = (s) => String(s ?? '').toLowerCase();

const isOn = (state) => ['on', 'true', '1', 'yes'].includes(norm(state));
const isOnish = (state) => ['on', 'open', 'unlocked', 'heat', 'heating', 'true', '1', 'yes'].includes(norm(state));
const countOn = (ids, entities) => ids.filter((id) => isOnish(entities?.[id]?.state)).length;

const toNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const cx = (...p) => p.filter(Boolean).join(' ');

function makeTr(t) {
  return (key, fallback) => {
    const out = typeof t === 'function' ? t(key) : undefined;
    const s = String(out ?? '');
    const looksLikeKey = !s || s === key || s.toLowerCase() === key.toLowerCase() || s === s.toUpperCase() || (s.includes('.') && (s.toLowerCase().includes('sauna.') || s.toLowerCase().includes('common.') || s.toLowerCase().includes('binary.')));
    return looksLikeKey ? fallback : s;
  };
}

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

function resolveImageUrl(settings, entities) {
  const raw = String(settings?.imageUrl ?? '').trim();
  if (raw) return raw;
  if (settings?.imageEntityId) {
    const ent = entities?.[settings.imageEntityId];
    const pic = ent?.attributes?.entity_picture;
    if (pic) return pic;
    const state = String(ent?.state ?? '');
    if (state.startsWith('http://') || state.startsWith('https://') || state.startsWith('/')) return state;
  }
  return null;
}

function extractHistorySeries(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw?.[0]) ? raw[0] : raw;
  if (!Array.isArray(arr)) return [];
  return arr
    .map((entry) => ({
      t: Date.parse(entry?.last_updated || entry?.start || entry?.last_changed || ''),
      v: Number(entry?.state ?? entry?.mean),
    }))
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v));
}

function buildPath(series, width, height) {
  if (!series.length) return '';
  const min = Math.min(...series.map((s) => s.v));
  const max = Math.max(...series.map((s) => s.v));
  const range = max - min || 1;
  return series
    .map((p, i) => {
      const x = (i / Math.max(1, series.length - 1)) * width;
      const y = height - ((p.v - min) / range) * height;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
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
  modals,
  tempHistoryById,
}) {
  const tr = useMemo(() => makeTr(t), [t]);

  const saunaName = customNames?.[cardId] || settings?.name || tr('sauna.name', 'Badstue');
  const iconName = customIcons?.[cardId] || settings?.icon;
  const SaunaIcon = iconName ? (getIconComponent(iconName) || Flame) : Flame;

  const tempEntity = settings?.tempEntityId ? entities?.[settings.tempEntityId] : null;
  const thermostatEntity = settings?.thermostatEntityId ? entities?.[settings.thermostatEntityId] : null;
  const motionEntity = settings?.motionEntityId ? entities?.[settings.motionEntityId] : null;
  const flameEntity = settings?.flameEntityId ? entities?.[settings.flameEntityId] : null;

  const preheatMinutesEntity = settings?.preheatMinutesEntityId ? entities?.[settings.preheatMinutesEntityId] : null;
  const preheatMinutes = toNum(preheatMinutesEntity?.state);

  const manualModeEntity = settings?.manualModeEntityId ? entities?.[settings.manualModeEntityId] : null;
  const autoModeOn = isOn(manualModeEntity?.state);

  const saunaActiveBoolEntity = settings?.saunaActiveBooleanEntityId ? entities?.[settings.saunaActiveBooleanEntityId] : null;
  const saunaIsActive = isOn(saunaActiveBoolEntity?.state);

  const serviceEntity = settings?.serviceEntityId ? entities?.[settings.serviceEntityId] : null;
  const nextBookingEntity = settings?.nextBookingInMinutesEntityId ? entities?.[settings.nextBookingInMinutesEntityId] : null;
  const peopleNowEntity = settings?.peopleNowEntityId ? entities?.[settings.peopleNowEntityId] : null;
  const preheatWindowEntity = settings?.preheatWindowEntityId ? entities?.[settings.preheatWindowEntityId] : null;

  const lightIds = useMemo(() => asArray(settings?.lightEntityIds), [settings?.lightEntityIds]);
  const lockIds = useMemo(() => asArray(settings?.lockEntityIds), [settings?.lockEntityIds]);
  const doorIds = useMemo(() => asArray(settings?.doorEntityIds), [settings?.doorEntityIds]);
  const fanIds = useMemo(() => asArray(settings?.fanEntityIds), [settings?.fanEntityIds]);
  const thermostatIds = useMemo(() => asArray(settings?.thermostatEntityIds), [settings?.thermostatEntityIds]);
  const codeIds = useMemo(() => asArray(settings?.codeEntityIds), [settings?.codeEntityIds]);
  const tempOverviewIds = useMemo(() => asArray(settings?.tempOverviewEntityIds), [settings?.tempOverviewEntityIds]);
  const autoLockEntity = settings?.autoLockEntityId ? entities?.[settings.autoLockEntityId] : null;

  const currentTemp = tempEntity ? Number.parseFloat(tempEntity.state) : null;
  const tempIsValid = Number.isFinite(currentTemp);

  const thermostatOn = isOnish(thermostatEntity?.state);
  const motionOn = isOnish(motionEntity?.state);
  const flameOn = isOnish(flameEntity?.state);
  const peopleNow = peopleNowEntity?.state ?? '0';

  const lightsOn = countOn(lightIds, entities);
  const unlockedDoors = lockIds.filter((id) => norm(entities?.[id]?.state) === 'unlocked').length;
  const openDoors = countOn(doorIds, entities);
  const activeFans = countOn(fanIds, entities);
  const activeThermostats = countOn(thermostatIds, entities);
  const autoLockOn = isOn(autoLockEntity?.state);

  const inUseTempC = Number.isFinite(Number(settings?.inUseTempC)) ? Number(settings.inUseTempC) : 45;
  const warmTempC = Number.isFinite(Number(settings?.warmTempC)) ? Number(settings.warmTempC) : 35;
  const isInUseByTemp = tempIsValid && currentTemp >= inUseTempC;
  const isWarmByTemp = tempIsValid && currentTemp >= warmTempC;

  const serviceState = serviceEntity?.state ?? '';
  const serviceYes = serviceState === 'Ja';
  const serviceNo = serviceState === 'Nei';
  const nextMinutes = toNum(nextBookingEntity?.state);
  const hasNext = nextMinutes != null && nextMinutes >= 0;
  const preheatOn = isOn(preheatWindowEntity?.state);

  const imageUrl = useMemo(() => resolveImageUrl(settings, entities), [settings, entities]);

  const tempSeries = useMemo(() => {
    if (!settings?.tempEntityId) return [];
    const raw = tempHistoryById?.[settings.tempEntityId];
    return extractHistorySeries(raw).slice(-40);
  }, [settings?.tempEntityId, tempHistoryById]);
  const tempPath = useMemo(() => buildPath(tempSeries, 100, 28), [tempSeries]);

  const preheatSeries = useMemo(() => {
    if (!settings?.preheatMinutesEntityId) return [];
    const raw = tempHistoryById?.[settings.preheatMinutesEntityId];
    return extractHistorySeries(raw).slice(-40);
  }, [settings?.preheatMinutesEntityId, tempHistoryById]);
  const preheatPath = useMemo(() => buildPath(preheatSeries, 100, 24), [preheatSeries]);

  const openFieldModal = (title, entityIds) => {
    if (editMode) return;
    const ids = asArray(entityIds);
    if (!ids.length) return;
    modals?.setActiveSaunaFieldModal?.({ title, entityIds: ids, cardId });
  };

  const openGlobalLightModal = () => {
    if (editMode) return;
    if (lightIds.length > 1) {
      openFieldModal(tr('sauna.lights', 'Lys'), lightIds);
      return;
    }
    const target = settings?.lightsModalEntityId || lightIds?.[0];
    if (!target) return;
    if (modals?.setShowLightModal) modals.setShowLightModal(target);
    else openFieldModal(tr('sauna.lights', 'Lys'), lightIds);
  };

  const modePill = {
    label: autoModeOn ? tr('sauna.autoMode', 'Auto') : tr('sauna.manualMode', 'Manuell'),
    cls: autoModeOn ? 'bg-emerald-500/16 border-emerald-400/22 text-emerald-200' : 'bg-orange-500/18 border-orange-400/25 text-orange-200',
  };

  const primaryState = (() => {
    if (flameOn) return { label: tr('sauna.heating', 'Varmer'), desc: tr('sauna.heatingUp', 'Varmer opp'), tone: 'hot' };
    if (saunaIsActive && serviceYes) return { label: tr('sauna.service', 'Service'), desc: tr('sauna.serviceOngoing', 'Pågår nå'), tone: 'warn' };
    if (saunaIsActive) return { label: tr('sauna.active', 'Aktiv'), desc: tr('sauna.bookingNow', 'Pågående økt'), tone: 'ok' };
    if (preheatOn) return { label: tr('sauna.preheat', 'Forvarmer'), desc: hasNext ? `${tr('sauna.next', 'Neste')}: ${Math.round(nextMinutes)}m` : tr('sauna.beforeBooking', 'Før booking'), tone: 'warm' };
    if (isInUseByTemp) return { label: tr('sauna.inUse', 'I bruk'), desc: tr('sauna.hotCabin', 'Varm badstue'), tone: 'ok' };
    if (isWarmByTemp) return { label: tr('sauna.warm', 'Varm'), desc: tr('sauna.readySoon', 'Snart klar'), tone: 'warm' };
    if (thermostatOn) return { label: tr('common.on', 'På'), desc: tr('sauna.standby', 'Standby'), tone: 'info' };
    return { label: tr('common.off', 'Av'), desc: hasNext ? `${tr('sauna.next', 'Neste')}: ${Math.round(nextMinutes)}m` : tr('sauna.inactive', 'Inaktiv'), tone: 'muted' };
  })();

  const tone = ({
    hot: { pill: 'bg-orange-500/18 border-orange-400/25 text-orange-200', icon: 'text-orange-300' },
    warm: { pill: 'bg-amber-500/14 border-amber-400/20 text-amber-200', icon: 'text-amber-300' },
    ok: { pill: 'bg-emerald-500/14 border-emerald-400/20 text-emerald-200', icon: 'text-emerald-300' },
    info: { pill: 'bg-blue-500/14 border-blue-400/20 text-blue-200', icon: 'text-blue-300' },
    warn: { pill: 'bg-orange-500/14 border-orange-400/20 text-orange-200', icon: 'text-orange-300' },
    danger: { pill: 'bg-rose-500/14 border-rose-400/20 text-rose-200', icon: 'text-rose-300' },
    muted: { pill: 'bg-[var(--glass-bg-hover)] border-[var(--glass-border)] text-[var(--text-secondary)]', icon: 'text-[var(--text-secondary)]' },
  }[primaryState.tone] || { pill: 'bg-[var(--glass-bg-hover)] border-[var(--glass-border)] text-[var(--text-secondary)]', icon: 'text-[var(--text-secondary)]' });

  const bookingLine = (() => {
    const hasAny =
      settings?.saunaActiveBooleanEntityId ||
      settings?.nextBookingInMinutesEntityId ||
      settings?.serviceEntityId ||
      settings?.preheatWindowEntityId;

    if (!hasAny || settings?.showBookingOverview === false) return null;

    const next = Number.isFinite(nextMinutes) ? Math.round(nextMinutes) : -1;
    const tempTxt = tempIsValid ? `${Math.round(currentTemp)} °C` : '-- °C';

    let baseLine = '';
    if (saunaIsActive) {
      baseLine = `${tr('sauna.activeNow', 'Aktiv nå')} • ${tempTxt} • ${peopleNow} ${tr('sauna.people', 'personer')}`;
    } else {
      const nextTxt = next === -1
        ? tr('sauna.noUpcomingBookingsToday', 'Ingen kommende bookinger i dag')
        : `${tr('sauna.nextBookingIn', 'Neste booking om')} ${next} min`;
      baseLine = `${tr('sauna.notActive', 'Ikke aktiv')} • ${nextTxt}`;
    }

    if (serviceYes) return `${baseLine} • ${tr('sauna.serviceOngoing', 'Service pågår')}`;
    if (serviceNo) return `${baseLine} • ${tr('sauna.normalBooking', 'Vanlig booking')}`;
    return baseLine;
  })();

  const bookingVisual = (() => {
    const next = Number.isFinite(nextMinutes) ? Math.round(nextMinutes) : -1;
    if (saunaIsActive && serviceYes) return { icon: Wrench, color: preheatOn ? 'text-orange-300' : 'text-emerald-300' };
    if (saunaIsActive) return { icon: SaunaIcon, color: 'text-emerald-300' };
    if (preheatOn) return { icon: Flame, color: 'text-orange-300' };
    return { icon: Power, color: next === -1 ? 'text-[var(--text-muted)]' : 'text-violet-300' };
  })();

  const iconFor = (customIcon, fallback) => (customIcon ? (getIconComponent(customIcon) || fallback) : fallback);
  const statItems = [
    settings?.showThermostat !== false && { key: 'thermostat', icon: iconFor(settings?.thermostatIcon, Shield), title: tr('sauna.thermostat', 'Termostat'), value: thermostatOn ? tr('common.on', 'På') : tr('common.off', 'Av'), active: thermostatOn, onClick: () => openFieldModal(tr('sauna.thermostat', 'Termostat'), [settings?.thermostatEntityId]), clickable: Boolean(settings?.thermostatEntityId), category: 'control' },
    settings?.showLights !== false && { key: 'lights', icon: iconFor(settings?.lightsIcon, Lightbulb), title: tr('sauna.lights', 'Lys'), value: lightIds.length ? `${lightsOn}/${lightIds.length} ${tr('common.on', 'på')}` : '--', active: lightsOn > 0, onClick: openGlobalLightModal, clickable: Boolean(settings?.lightsModalEntityId || lightIds?.length), category: 'control' },
    settings?.showFans !== false && { key: 'fans', icon: iconFor(settings?.fansIcon, Fan), title: tr('sauna.fans', 'Vifter'), value: fanIds.length ? `${activeFans}/${fanIds.length} ${tr('common.on', 'på')}` : '--', active: activeFans > 0, onClick: () => openFieldModal(tr('sauna.fans', 'Vifter'), fanIds), clickable: fanIds.length > 0, category: 'control' },
    settings?.showThermostatOverview !== false && { key: 'thermostatGroup', icon: iconFor(settings?.thermostatsIcon, Shield), title: tr('sauna.thermostats', 'Termostater'), value: thermostatIds.length ? `${activeThermostats}/${thermostatIds.length} ${tr('common.on', 'på')}` : '--', active: activeThermostats > 0, onClick: () => openFieldModal(tr('sauna.thermostats', 'Termostater'), thermostatIds), clickable: thermostatIds.length > 0, category: 'control' },
    settings?.showActiveCodes !== false && { key: 'codes', icon: iconFor(settings?.codesIcon, Hash), title: tr('sauna.activeCodes', 'Aktive koder'), value: codeIds.length ? `${codeIds.length}` : '--', active: codeIds.length > 0, onClick: () => openFieldModal(tr('sauna.activeCodes', 'Aktive koder'), codeIds), clickable: codeIds.length > 0, category: 'safety' },
    settings?.showAutoLock !== false && { key: 'autoLock', icon: iconFor(settings?.autoLockIcon, ToggleRight), title: tr('sauna.autoLock', 'Autolåsing'), value: autoLockOn ? tr('common.on', 'På') : tr('common.off', 'Av'), active: autoLockOn, onClick: () => openFieldModal(tr('sauna.autoLock', 'Autolåsing'), [settings?.autoLockEntityId]), clickable: Boolean(settings?.autoLockEntityId), category: 'safety' },
    settings?.showDoors !== false && { key: 'doors', icon: iconFor(settings?.doorsIcon, DoorOpen), title: tr('sauna.doors', 'Dør'), value: `${openDoors} ${openDoors === 1 ? tr('sauna.openShort', 'åpen') : tr('sauna.openShortPlural', 'åpne')}`, active: openDoors > 0, onClick: () => openFieldModal(tr('sauna.doors', 'Dører'), doorIds), clickable: doorIds.length > 0, category: 'safety' },
    settings?.showLocks !== false && { key: 'locks', icon: iconFor(settings?.locksIcon, Lock), title: tr('sauna.locks', 'Lås'), value: `${unlockedDoors} ${unlockedDoors === 1 ? tr('sauna.unlockedShort', 'ulåst') : tr('sauna.unlockedShortPlural', 'ulåste')}`, active: unlockedDoors > 0, onClick: () => openFieldModal(tr('sauna.locks', 'Låser'), lockIds), clickable: lockIds.length > 0, category: 'safety' },
    settings?.showMotion !== false && { key: 'motion', icon: iconFor(settings?.motionIcon, Activity), title: tr('sauna.motion', 'Bevegelse'), value: motionOn ? tr('sauna.motionDetected', 'Registrert') : tr('sauna.noMotion', 'Ingen'), active: motionOn, onClick: () => openFieldModal(tr('sauna.motion', 'Bevegelse'), [settings?.motionEntityId]), clickable: Boolean(settings?.motionEntityId), category: 'safety' },
  ].filter(Boolean);

  const controlStats = statItems.filter((item) => item.category === 'control');
  const safetyStats = statItems.filter((item) => item.category === 'safety');

  const tempOverview = settings?.showTempOverview !== false
    ? tempOverviewIds.map((id) => ({ id, ent: entities?.[id] })).filter(({ ent }) => ent).slice(0, 4)
    : [];

  const tempValues = tempOverview.map(({ ent }) => Number(ent?.state)).filter((v) => Number.isFinite(v));
  const tempMin = tempValues.length ? Math.min(...tempValues) : null;
  const tempMax = tempValues.length ? Math.max(...tempValues) : null;
  const tempAvg = tempValues.length ? (tempValues.reduce((a, b) => a + b, 0) / tempValues.length) : null;

  const renderStatSection = (title, items) => items.length > 0 && (
    <div className="space-y-2">
      <div className="text-[10px] uppercase tracking-[0.24em] font-extrabold text-[var(--text-secondary)] px-1">{title}</div>
      <div className="grid grid-cols-2 gap-2">
        {items.map((item) => {
          const Icon = item.icon;
          const clickable = Boolean(item.onClick) && !editMode && (item.clickable ?? true);
          return (
            <button
              type="button"
              key={item.key}
              onClick={clickable ? item.onClick : undefined}
              className={cx('rounded-2xl px-3 py-3 border flex items-center gap-2 text-left transition', clickable ? 'active:scale-[0.99] cursor-pointer' : 'cursor-default', item.active ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-[var(--glass-bg-hover)] border-[var(--glass-border)]')}
            >
              <Icon className={cx('w-4 h-4', item.active ? 'text-emerald-300' : 'text-[var(--text-secondary)]')} />
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-widest font-extrabold text-[var(--text-secondary)] truncate">{item.title}</div>
                <div className="text-sm font-extrabold text-[var(--text-primary)] truncate">{item.value}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div
      {...dragProps}
      data-haptic={editMode ? undefined : 'card'}
      className={cx('touch-feedback relative p-5 rounded-[2.5rem] transition-all duration-300 overflow-hidden font-sans h-full', 'border border-[var(--glass-border)] bg-[var(--glass-bg)]', !editMode ? 'cursor-pointer active:scale-[0.98]' : 'cursor-move')}
      style={cardStyle}
    >
      {controls}

      <div className="relative z-10 h-full min-h-0 flex flex-col overflow-y-auto custom-scrollbar pr-1">
        <div className="grid grid-cols-3 items-start gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-12 h-12 rounded-full flex items-center justify-center border bg-[var(--glass-bg-hover)] border-[var(--glass-border)]">
              {flameOn ? <FlameAnimated className="w-6 h-6" /> : <SaunaIcon className={cx('w-6 h-6', tone.icon)} />}
            </div>
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-widest text-[var(--text-secondary)] font-bold">{tr('sauna.operator', 'Badstue')}</p>
              <h3 className="text-lg font-bold text-[var(--text-primary)] truncate">{saunaName}</h3>

            </div>
          </div>

          <div className="flex justify-center">
            <div className="relative w-40 h-40">
              {settings?.peopleNowEntityId && (
                <button
                  type="button"
                  onClick={() => openFieldModal(tr('sauna.peopleNow', 'Antall folk nå'), [settings?.peopleNowEntityId])}
                  className="absolute top-0 left-1/2 -translate-x-1/2 min-w-[2.7rem] h-10 px-3 rounded-full border border-emerald-400/25 bg-emerald-500/20 text-emerald-100 flex items-center justify-center text-2xl font-extrabold z-20 shadow-lg shadow-emerald-900/30"
                >
                  {peopleNow}
                </button>
              )}
              <div className="relative w-40 h-40 rounded-full overflow-hidden border border-[var(--glass-border)] bg-[var(--glass-bg-hover)] shadow-[0_16px_45px_rgba(0,0,0,0.45)]">
                {imageUrl ? <img src={imageUrl} alt={saunaName} className="w-full h-full object-cover" draggable={false} /> : <div className="w-full h-full bg-gradient-to-br from-white/10 to-black/20" />}
                <div className="absolute inset-0 rounded-full ring-1 ring-white/10" />
                {flameOn && (
                  <button
                    type="button"
                    onClick={() => openFieldModal(tr('sauna.heating', 'Varmer'), [settings?.flameEntityId])}
                    className="absolute bottom-2 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-full border bg-orange-500/18 border-orange-400/25 text-orange-200 text-[10px] uppercase tracking-widest font-extrabold"
                  >
                    {tr('sauna.heating', 'Varmer')}
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="text-right flex flex-col items-end gap-2">
            {settings?.showManualMode !== false && settings?.manualModeEntityId && (
              <button
                type="button"
                onClick={() => openFieldModal(tr('sauna.manualMode', 'Modus'), [settings.manualModeEntityId])}
                className={cx('px-4 py-2 rounded-full text-[12px] uppercase tracking-widest font-extrabold border', modePill.cls)}
              >
                {modePill.label}
              </button>
            )}

            {!flameOn && (
              <>
                <div className={cx('px-4 py-2 rounded-full text-[12px] uppercase tracking-widest font-extrabold border', tone.pill)}>
                  <span className={cx('inline-block w-2 h-2 rounded-full mr-2 align-middle', primaryState.tone === 'muted' ? 'bg-[var(--text-secondary)]/50' : 'bg-current')} />
                  <span className="align-middle">{primaryState.label}</span>
                </div>
                <div className="text-[12px] text-[var(--text-secondary)] font-medium text-right">{primaryState.desc}</div>
              </>
            )}
          </div>
        </div>

        {(bookingLine || preheatOn) && (() => {
          const BookingIcon = bookingVisual.icon;
          return (
            <div className="mt-3 rounded-2xl px-4 py-3 border border-[var(--glass-border)]/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] backdrop-blur-sm flex items-center gap-3 min-w-0">
              <div className="w-7 h-7 rounded-full bg-[var(--glass-bg-hover)] flex items-center justify-center shrink-0">
                <BookingIcon className={cx('w-4 h-4', bookingVisual.color)} />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--text-secondary)] font-bold">{tr('sauna.status', 'Status')}</p>
                <p className="text-sm text-[var(--text-primary)] truncate">{bookingLine || tr('sauna.preheat', 'Forvarmer')}</p>
              </div>
            </div>
          );
        })()}


        <div className="mt-4 grid grid-cols-3 gap-4 items-end">
          <div className="col-span-2 px-3 py-3 relative overflow-hidden">
            {tempPath && (
              <svg className="absolute left-3 right-3 top-2 w-[calc(100%-1.5rem)] h-10 opacity-90 pointer-events-none" viewBox="0 0 100 28" preserveAspectRatio="none">
                <path d={tempPath} fill="none" stroke="rgba(239,68,68,0.95)" strokeWidth="2.3" strokeLinecap="round" />
              </svg>
            )}
            <div className="mt-7 flex items-end gap-2 relative">
              <Thermometer className="w-4 h-4 text-[var(--text-secondary)] mb-1" />
              <span className="text-5xl font-semibold leading-none tabular-nums text-[var(--text-primary)]">{tempIsValid ? currentTemp.toFixed(1) : '--'}</span>
              <span className="text-2xl text-[var(--text-secondary)] mb-1">°C</span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => openFieldModal(tr('sauna.preheatTime', 'Oppvarmingstid'), [settings?.preheatMinutesEntityId])}
            className="col-span-1 text-right px-3 py-3 relative overflow-hidden"
          >
            {preheatPath && (
              <svg className="absolute left-3 right-3 top-2 w-[calc(100%-1.5rem)] h-9 opacity-90 pointer-events-none" viewBox="0 0 100 24" preserveAspectRatio="none">
                <path d={preheatPath} fill="none" stroke="rgba(239,68,68,0.95)" strokeWidth="2.2" strokeLinecap="round" />
              </svg>
            )}
            <div className="mt-8 text-[10px] uppercase tracking-widest font-bold text-[var(--text-secondary)]">{tr('sauna.preheatTime', 'Oppvarmingstid')}</div>
            <div className="text-3xl font-bold text-[var(--text-primary)] leading-tight">{preheatMinutes != null ? `${Math.round(preheatMinutes)}` : '--'}</div>
            <div className="text-base font-bold text-[var(--text-secondary)]">min</div>
          </button>
        </div>

        <div className="mt-4 space-y-4">
          {tempOverview.length > 0 && (
            <button
              type="button"
              onClick={() => openFieldModal(tr('sauna.tempOverview', 'Temperaturoversikt'), tempOverviewIds)}
              className="w-full rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg-hover)] p-3 text-left"
            >
              <div className="flex items-center justify-between gap-2 mb-2 px-1">
                <div className="text-[10px] uppercase tracking-[0.24em] font-extrabold text-[var(--text-secondary)]">{tr('sauna.tempOverview', 'Temperaturoversikt')}</div>
                <div className="flex items-center gap-1.5 text-[10px]">
                  <span className="px-2 py-0.5 rounded-full border border-cyan-400/20 bg-cyan-500/10 text-cyan-200">min {tempMin != null ? tempMin.toFixed(1) : '--'}°</span>
                  <span className="px-2 py-0.5 rounded-full border border-violet-400/20 bg-violet-500/10 text-violet-200">snitt {tempAvg != null ? tempAvg.toFixed(1) : '--'}°</span>
                  <span className="px-2 py-0.5 rounded-full border border-rose-400/20 bg-rose-500/10 text-rose-200">max {tempMax != null ? tempMax.toFixed(1) : '--'}°</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {tempOverview.map(({ id, ent }) => {
                  const val = Number(ent?.state);
                  const hasVal = Number.isFinite(val);
                  const heatTone = hasVal && tempMax != null && val >= tempMax ? 'border-rose-400/30 bg-rose-500/10' : hasVal && tempMin != null && val <= tempMin ? 'border-cyan-400/30 bg-cyan-500/10' : 'border-[var(--glass-border)] bg-[var(--glass-bg)]';
                  return (
                    <div key={id} className={`rounded-xl px-3 py-2 border text-left ${heatTone}`}>
                      <div className="text-[10px] uppercase tracking-widest font-bold text-[var(--text-secondary)] truncate">{ent.attributes?.friendly_name || id}</div>
                      <div className="mt-1 flex items-end gap-1">
                        <span className="text-xl font-extrabold text-[var(--text-primary)] leading-none">{hasVal ? val.toFixed(1) : ent.state}</span>
                        <span className="text-xs text-[var(--text-secondary)] mb-0.5">{hasVal ? '°C' : ''}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </button>
          )}

          {renderStatSection(tr('sauna.controls', 'Styring'), controlStats)}
          {renderStatSection(tr('sauna.safetyStatus', 'Sikkerhet og status'), safetyStats)}
        </div>

        {settings?.showThresholdHint && (
          <div className="mt-3 text-[11px] text-[var(--text-secondary)]">
            {tr('sauna.thresholdHint', `I bruk ≥ ${inUseTempC}°C · Varm ≥ ${warmTempC}°C`)}
          </div>
        )}
      </div>
    </div>
  );
}
