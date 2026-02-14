import React, { useMemo } from 'react';
import { Flame, Thermometer, Lock, DoorOpen, Activity, Lightbulb, Shield, Fan, Hash, ToggleRight } from '../../icons';
import { getIconComponent } from '../../icons';

const isOnish = (state) => ['on', 'open', 'unlocked', 'heat', 'heating', 'detected', 'occupied', 'true'].includes(String(state || '').toLowerCase());
const asArray = (value) => Array.isArray(value) ? value.filter(Boolean) : [];
const countOn = (ids, entities) => ids.filter((id) => isOnish(entities?.[id]?.state)).length;

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
  onOpenField,
  t,
}) {
  const saunaName = customNames?.[cardId] || settings?.name || 'Sauna';
  const iconName = customIcons?.[cardId] || settings?.icon;
  const SaunaIcon = iconName ? (getIconComponent(iconName) || Flame) : Flame;

  const tempEntity = settings?.tempEntityId ? entities?.[settings.tempEntityId] : null;
  const thermostatEntity = settings?.thermostatEntityId ? entities?.[settings.thermostatEntityId] : null;
  const motionEntity = settings?.motionEntityId ? entities?.[settings.motionEntityId] : null;
  const flameEntity = settings?.flameEntityId ? entities?.[settings.flameEntityId] : null;
  const manualModeEntity = settings?.manualModeEntityId ? entities?.[settings.manualModeEntityId] : null;
  const autoLockEntity = settings?.autoLockEntityId ? entities?.[settings.autoLockEntityId] : null;

  const lightIds = useMemo(() => asArray(settings?.lightEntityIds), [settings?.lightEntityIds]);
  const lockIds = useMemo(() => asArray(settings?.lockEntityIds), [settings?.lockEntityIds]);
  const doorIds = useMemo(() => asArray(settings?.doorEntityIds), [settings?.doorEntityIds]);
  const fanIds = useMemo(() => asArray(settings?.fanEntityIds), [settings?.fanEntityIds]);
  const thermostatIds = useMemo(() => asArray(settings?.thermostatEntityIds), [settings?.thermostatEntityIds]);
  const codeIds = useMemo(() => asArray(settings?.codeEntityIds), [settings?.codeEntityIds]);
  const tempOverviewIds = useMemo(() => asArray(settings?.tempOverviewEntityIds), [settings?.tempOverviewEntityIds]);

  const currentTemp = tempEntity ? Number.parseFloat(tempEntity.state) : null;
  const thermostatOn = isOnish(thermostatEntity?.state);
  const motionOn = isOnish(motionEntity?.state);
  const flameOn = isOnish(flameEntity?.state);
  const manualModeOn = isOnish(manualModeEntity?.state);
  const autoLockOn = isOnish(autoLockEntity?.state);

  const lightsOn = countOn(lightIds, entities);
  const unlockedDoors = lockIds.filter((id) => String(entities?.[id]?.state || '').toLowerCase() === 'unlocked').length;
  const openDoors = countOn(doorIds, entities);
  const activeFans = countOn(fanIds, entities);
  const activeThermostats = countOn(thermostatIds, entities);

  const iconFor = (customIcon, fallback) => customIcon ? (getIconComponent(customIcon) || fallback) : fallback;

  const openField = (key, title, entityIds) => {
    if (editMode) return;
    const ids = asArray(entityIds);
    if (ids.length === 0) return;
    onOpenField?.({ key, title, entityIds: ids, cardId });
  };

  const statItems = [
    settings?.showThermostat !== false && {
      key: 'thermostat',
      icon: iconFor(settings?.thermostatIcon, Shield),
      label: thermostatOn ? (t('common.on') || 'On') : (t('common.off') || 'Off'),
      value: t('sauna.thermostat') || 'Thermostat',
      active: thermostatOn,
      entityIds: settings?.thermostatEntityId ? [settings.thermostatEntityId] : [],
    },
    settings?.showMotion !== false && {
      key: 'motion',
      icon: iconFor(settings?.motionIcon, Activity),
      label: motionOn ? (t('binary.occupancy.occupied') || 'Motion') : (t('common.off') || 'No motion'),
      value: t('sauna.motion') || 'Motion',
      active: motionOn,
      entityIds: settings?.motionEntityId ? [settings.motionEntityId] : [],
    },
    settings?.showLights !== false && {
      key: 'lights',
      icon: iconFor(settings?.lightsIcon, Lightbulb),
      label: `${lightsOn}/${lightIds.length || 0}`,
      value: t('sauna.lights') || 'Lights',
      active: lightsOn > 0,
      entityIds: lightIds,
    },
    settings?.showLocks !== false && {
      key: 'locks',
      icon: iconFor(settings?.locksIcon, Lock),
      label: `${unlockedDoors}`,
      value: t('sauna.unlocked') || 'Unlocked',
      active: unlockedDoors > 0,
      entityIds: lockIds,
    },
    settings?.showDoors !== false && {
      key: 'doors',
      icon: iconFor(settings?.doorsIcon, DoorOpen),
      label: `${openDoors}`,
      value: t('sauna.doorsOpen') || 'Doors open',
      active: openDoors > 0,
      entityIds: doorIds,
    },
    settings?.showFans !== false && {
      key: 'fans',
      icon: iconFor(settings?.fansIcon, Fan),
      label: `${activeFans}/${fanIds.length || 0}`,
      value: t('sauna.fans') || 'Fans',
      active: activeFans > 0,
      entityIds: fanIds,
    },
    settings?.showThermostatOverview !== false && {
      key: 'thermostats',
      icon: iconFor(settings?.thermostatsIcon, Shield),
      label: `${activeThermostats}/${thermostatIds.length || 0}`,
      value: t('sauna.thermostats') || 'Thermostats',
      active: activeThermostats > 0,
      entityIds: thermostatIds,
    },
    settings?.showActiveCodes !== false && {
      key: 'codes',
      icon: iconFor(settings?.codesIcon, Hash),
      label: `${codeIds.length}`,
      value: t('sauna.activeCodes') || 'Active codes',
      active: codeIds.length > 0,
      entityIds: codeIds,
    },
    settings?.showAutoLock !== false && {
      key: 'autolock',
      icon: iconFor(settings?.autoLockIcon, ToggleRight),
      label: autoLockOn ? (t('common.on') || 'On') : (t('common.off') || 'Off'),
      value: t('sauna.autoLock') || 'Auto lock',
      active: autoLockOn,
      entityIds: settings?.autoLockEntityId ? [settings.autoLockEntityId] : [],
    },
  ].filter(Boolean);

  const overviewTemps = tempOverviewIds
    .map((id) => ({ id, entity: entities?.[id] }))
    .filter(({ entity }) => entity);

  return (
    <div
      {...dragProps}
      data-haptic={editMode ? undefined : 'card'}
      className={`touch-feedback relative p-5 rounded-[2.5rem] transition-all duration-300 overflow-hidden font-sans h-full border border-[var(--glass-border)] bg-[var(--glass-bg)] ${!editMode ? 'cursor-pointer active:scale-[0.98]' : 'cursor-move'}`}
      style={cardStyle}
    >
      {controls}

      <div className="relative z-10 h-full flex flex-col justify-between">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center border ${flameOn ? 'bg-orange-500/20 border-orange-400/40' : 'bg-[var(--glass-bg-hover)] border-[var(--glass-border)]'}`}>
              <SaunaIcon className={`w-6 h-6 ${flameOn ? 'text-orange-300' : 'text-[var(--text-secondary)]'}`} />
            </div>
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-widest text-[var(--text-secondary)] font-bold">{t('sauna.operator') || 'Sauna Operator'}</p>
              <h3 className="text-lg font-bold text-[var(--text-primary)] truncate">{saunaName}</h3>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            {settings?.showManualMode !== false && settings?.manualModeEntityId && (
              <button
                type="button"
                onClick={() => openField('manualMode', t('sauna.manualModeEntity') || 'Manual mode', [settings.manualModeEntityId])}
                className={`px-2.5 py-1 rounded-full text-[10px] uppercase tracking-widest font-bold border ${manualModeOn ? 'bg-blue-500/20 text-blue-300 border-blue-400/30' : 'bg-emerald-500/15 text-emerald-300 border-emerald-400/20'} ${editMode ? 'pointer-events-none' : ''}`}
              >
                {manualModeOn ? (t('sauna.manual') || 'Manual mode') : (t('sauna.auto') || 'Auto mode')}
              </button>
            )}
            {settings?.showFlame !== false && settings?.flameEntityId && (
              <button
                type="button"
                onClick={() => openField('flame', t('sauna.flameEntity') || 'Flame switch', [settings.flameEntityId])}
                className={`px-2.5 py-1 rounded-full text-[10px] uppercase tracking-widest font-bold border ${flameOn ? 'bg-orange-500/20 text-orange-300 border-orange-400/30' : 'bg-[var(--glass-bg-hover)] text-[var(--text-secondary)] border-[var(--glass-border)]'} ${editMode ? 'pointer-events-none' : ''}`}
              >
                {flameOn ? (t('sauna.heating') || 'Heating') : (t('sauna.idle') || 'Idle')}
              </button>
            )}
          </div>
        </div>

        <div className="mt-3 flex items-end justify-between gap-4">
          <div className="flex items-end gap-2">
            <Thermometer className="w-4 h-4 text-[var(--text-secondary)] mb-1" />
            <span className="text-4xl font-medium leading-none tabular-nums text-[var(--text-primary)]">
              {Number.isFinite(currentTemp) ? currentTemp.toFixed(1) : '--'}
            </span>
            <span className="text-xl text-[var(--text-secondary)] mb-1">°C</span>
          </div>
          {settings?.targetTempEntityId && entities?.[settings.targetTempEntityId] && (
            <button
              type="button"
              onClick={() => openField('targetTemp', t('sauna.targetTempSensor') || 'Target temperature', [settings.targetTempEntityId])}
              className="text-xs text-[var(--text-secondary)] font-medium"
            >
              → {entities[settings.targetTempEntityId]?.state || '--'}°
            </button>
          )}
        </div>

        {overviewTemps.length > 0 && settings?.showTempOverview !== false && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            {overviewTemps.slice(0, 4).map(({ id, entity }) => (
              <button
                key={id}
                type="button"
                onClick={() => openField('tempOverview', t('sauna.tempOverview') || 'Temperature overview', tempOverviewIds)}
                className="rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg-hover)] px-2 py-1 text-left"
              >
                <div className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] truncate">{entity.attributes?.friendly_name || id}</div>
                <div className="text-sm font-bold text-[var(--text-primary)] truncate">{entity.state}</div>
              </button>
            ))}
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 gap-2">
          {statItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => openField(item.key, item.value, item.entityIds)}
                className={`rounded-xl px-3 py-2 border flex items-center gap-2 text-left ${item.active ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-[var(--glass-bg-hover)] border-[var(--glass-border)]'} ${editMode || item.entityIds.length === 0 ? 'pointer-events-none' : ''}`}
              >
                <Icon className={`w-3.5 h-3.5 ${item.active ? 'text-emerald-300' : 'text-[var(--text-secondary)]'}`} />
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-widest font-bold text-[var(--text-secondary)] truncate">{item.value}</div>
                  <div className="text-xs font-bold text-[var(--text-primary)] truncate">{item.label}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
