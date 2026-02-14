import React, { useMemo } from 'react';
import { Flame, Thermometer, Lock, DoorOpen, Activity, Lightbulb, Shield } from '../../icons';
import { getIconComponent } from '../../icons';

const isOnish = (state) => ['on', 'open', 'unlocked', 'heat', 'heating'].includes(String(state || '').toLowerCase());

const countOn = (ids, entities) => ids.filter((id) => isOnish(entities?.[id]?.state)).length;

const asArray = (value) => Array.isArray(value) ? value.filter(Boolean) : [];

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
}) {
  const saunaName = customNames?.[cardId] || settings?.name || 'Sauna';
  const iconName = customIcons?.[cardId] || settings?.icon;
  const SaunaIcon = iconName ? (getIconComponent(iconName) || Flame) : Flame;

  const tempEntity = settings?.tempEntityId ? entities?.[settings.tempEntityId] : null;
  const thermostatEntity = settings?.thermostatEntityId ? entities?.[settings.thermostatEntityId] : null;
  const motionEntity = settings?.motionEntityId ? entities?.[settings.motionEntityId] : null;
  const flameEntity = settings?.flameEntityId ? entities?.[settings.flameEntityId] : null;
  const manualModeEntity = settings?.manualModeEntityId ? entities?.[settings.manualModeEntityId] : null;

  const lightIds = useMemo(() => asArray(settings?.lightEntityIds), [settings?.lightEntityIds]);
  const lockIds = useMemo(() => asArray(settings?.lockEntityIds), [settings?.lockEntityIds]);
  const doorIds = useMemo(() => asArray(settings?.doorEntityIds), [settings?.doorEntityIds]);

  const currentTemp = tempEntity ? Number.parseFloat(tempEntity.state) : null;
  const thermostatOn = isOnish(thermostatEntity?.state);
  const motionOn = isOnish(motionEntity?.state);
  const flameOn = isOnish(flameEntity?.state);
  const manualModeOn = isOnish(manualModeEntity?.state);

  const lightsOn = countOn(lightIds, entities);
  const unlockedDoors = lockIds.filter((id) => String(entities?.[id]?.state || '').toLowerCase() === 'unlocked').length;
  const openDoors = countOn(doorIds, entities);

  const iconFor = (customIcon, fallback) => customIcon ? (getIconComponent(customIcon) || fallback) : fallback;

  const statItems = [
    settings?.showThermostat !== false && {
      key: 'thermostat',
      icon: iconFor(settings?.thermostatIcon, Shield),
      label: thermostatOn ? (t('common.on') || 'On') : (t('common.off') || 'Off'),
      value: t('sauna.thermostat') || 'Thermostat',
      active: thermostatOn,
    },
    settings?.showMotion !== false && {
      key: 'motion',
      icon: iconFor(settings?.motionIcon, Activity),
      label: motionOn ? (t('binary.occupancy.occupied') || 'Motion') : (t('common.off') || 'No motion'),
      value: t('sauna.motion') || 'Motion',
      active: motionOn,
    },
    settings?.showLights !== false && {
      key: 'lights',
      icon: iconFor(settings?.lightsIcon, Lightbulb),
      label: `${lightsOn}/${lightIds.length || 0}`,
      value: t('sauna.lights') || 'Lights',
      active: lightsOn > 0,
    },
    settings?.showLocks !== false && {
      key: 'locks',
      icon: iconFor(settings?.locksIcon, Lock),
      label: `${unlockedDoors}`,
      value: t('sauna.unlocked') || 'Unlocked',
      active: unlockedDoors > 0,
    },
    settings?.showDoors !== false && {
      key: 'doors',
      icon: iconFor(settings?.doorsIcon, DoorOpen),
      label: `${openDoors}`,
      value: t('sauna.doorsOpen') || 'Doors open',
      active: openDoors > 0,
    },
  ].filter(Boolean);

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
              <div className={`px-2.5 py-1 rounded-full text-[10px] uppercase tracking-widest font-bold border ${manualModeOn ? 'bg-blue-500/20 text-blue-300 border-blue-400/30' : 'bg-emerald-500/15 text-emerald-300 border-emerald-400/20'}`}>
                {manualModeOn ? (t('sauna.manual') || 'Manual mode') : (t('sauna.auto') || 'Auto mode')}
              </div>
            )}
            {settings?.showFlame !== false && settings?.flameEntityId && (
              <div className={`px-2.5 py-1 rounded-full text-[10px] uppercase tracking-widest font-bold border ${flameOn ? 'bg-orange-500/20 text-orange-300 border-orange-400/30' : 'bg-[var(--glass-bg-hover)] text-[var(--text-secondary)] border-[var(--glass-border)]'}`}>
                {flameOn ? (t('sauna.heating') || 'Heating') : (t('sauna.idle') || 'Idle')}
              </div>
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
            <div className="text-xs text-[var(--text-secondary)] font-medium">
              → {entities[settings.targetTempEntityId]?.state || '--'}°
            </div>
          )}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          {statItems.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.key}
                className={`rounded-xl px-3 py-2 border flex items-center gap-2 ${item.active ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-[var(--glass-bg-hover)] border-[var(--glass-border)]'}`}
              >
                <Icon className={`w-3.5 h-3.5 ${item.active ? 'text-emerald-300' : 'text-[var(--text-secondary)]'}`} />
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-widest font-bold text-[var(--text-secondary)] truncate">{item.value}</div>
                  <div className="text-xs font-bold text-[var(--text-primary)] truncate">{item.label}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
