import React from 'react';
import { X, Lightbulb, Lock, Fan, Shield, Hash, Thermometer, DoorOpen, ToggleRight, Activity, Camera, AlarmClock, ListChecks, Zap, Workflow } from '../icons';
import M3Slider from '../components/ui/M3Slider';
import GenericClimateModal from './GenericClimateModal';
import GenericFanModal from './GenericFanModal';
import GenericDoorModal from './GenericDoorModal';
import GenericMotionModal from './GenericMotionModal';
import GenericNumberModal from './GenericNumberModal';
import GenericLockModal from './GenericLockModal';
import GenericSwitchModal from './GenericSwitchModal';
import GenericUtilityModal from './GenericUtilityModal';

const domainFor = (entityId = '') => String(entityId).split('.')[0] || '';
const getFriendlyName = (entityId, entities) => entities?.[entityId]?.attributes?.friendly_name || entityId;
const getEntityState = (entityId, entities) => entities?.[entityId]?.state ?? 'unknown';

const canToggleDomain = (domain) => ['light', 'switch', 'input_boolean', 'fan', 'lock', 'automation'].includes(domain);

const iconForDomain = (domain) => {
  if (domain === 'light') return Lightbulb;
  if (domain === 'lock') return Lock;
  if (domain === 'fan') return Fan;
  if (domain === 'climate') return Shield;
  if (domain === 'input_number' || domain === 'number') return Hash;
  if (domain === 'camera') return Camera;
  if (domain === 'alarm_control_panel') return Shield;
  if (domain === 'timer') return AlarmClock;
  if (domain === 'select' || domain === 'input_select') return ListChecks;
  if (domain === 'button') return Zap;
  if (domain === 'script' || domain === 'scene') return Workflow;
  if (domain === 'sensor') return Thermometer;
  if (domain === 'binary_sensor') return DoorOpen;
  return ToggleRight;
};

function makeTr(t) {
  return (key, fallback) => {
    const out = typeof t === 'function' ? t(key) : undefined;
    const s = String(out ?? '');
    const looksLikeKey = !s || s === key || s.toLowerCase() === key.toLowerCase() || s === s.toUpperCase() || s.includes('.');
    return looksLikeKey ? fallback : s;
  };
}

const domainLabel = (domain, tr) => {
  if (domain === 'light') return tr('room.domain.light', 'Lys');
  if (domain === 'lock') return tr('room.domain.lock', 'Låser');
  if (domain === 'fan') return tr('room.domain.fan', 'Vifter');
  if (domain === 'climate') return tr('room.domain.climate', 'Klima');
  if (domain === 'input_number' || domain === 'number') return tr('room.domain.number', 'Nummer');
  if (domain === 'camera') return tr('room.domain.camera', 'Kamera');
  if (domain === 'alarm_control_panel') return tr('room.domain.alarm', 'Alarm');
  if (domain === 'timer') return tr('room.domain.timer', 'Timer');
  if (domain === 'select' || domain === 'input_select') return tr('room.domain.select', 'Valg');
  if (domain === 'button') return tr('room.domain.button', 'Knapp');
  if (domain === 'script' || domain === 'scene') return tr('room.domain.script', 'Script/Scene');
  if (domain === 'sensor') return tr('room.domain.sensor', 'Sensorer');
  if (domain === 'binary_sensor') return tr('room.domain.binarySensor', 'Binærsensor');
  return domain || tr('common.other', 'Annet');
};

const normalize = (v) => String(v ?? '').toLowerCase();
const isActiveState = (domain, state) => {
  const s = normalize(state);
  if (domain === 'lock') return s === 'unlocked';
  return ['on', 'open', 'unlocked', 'heat', 'heating', 'true', '1'].includes(s);
};

const stateLabelFor = (domain, state, tr) => {
  const s = normalize(state);
  if (domain === 'lock') return s === 'locked' ? tr('binary.lock.locked', 'Låst') : s === 'unlocked' ? tr('binary.lock.unlocked', 'Ulåst') : state;
  if (domain === 'binary_sensor') {
    if (s === 'on') return tr('status.on', 'På');
    if (s === 'off') return tr('status.off', 'Av');
  }
  if (s === 'on') return tr('common.on', 'På');
  if (s === 'off') return tr('common.off', 'Av');
  return state;
};

const toggleActionLabel = (domain, state, tr) => {
  if (domain === 'lock') return normalize(state) === 'locked' ? tr('sauna.unlock', 'Lås opp') : tr('sauna.lock', 'Lås');
  return isActiveState(domain, state) ? tr('common.turnOff', 'Slå av') : tr('common.turnOn', 'Slå på');
};

const isNumericDomain = (domain) => domain === 'input_number' || domain === 'number';
const isReadOnlyDomain = (domain) => domain === 'sensor' || domain === 'binary_sensor';

export default function SaunaFieldModal({
  show,
  title,
  fieldType,
  numberMode,
  numberMaxDigits,
  entityIds,
  entities,
  callService,
  onClose,
  t,
  setShowLightModal,
  setActiveClimateEntityModal,
  setShowSensorInfoModal,
  hvacMap,
  fanMap,
  swingMap,
}) {
  const tr = makeTr(t);
  const ids = Array.isArray(entityIds) ? entityIds.filter(Boolean) : [];
  const [activityFilter, setActivityFilter] = React.useState('all');
  const [activeFanEntityModal, setActiveFanEntityModal] = React.useState(null);
  const [activeDoorEntityModal, setActiveDoorEntityModal] = React.useState(null);
  const [activeMotionEntityModal, setActiveMotionEntityModal] = React.useState(null);
  const [activeNumberEntityModal, setActiveNumberEntityModal] = React.useState(null);
  const [activeLockEntityModal, setActiveLockEntityModal] = React.useState(null);
  const [activeSwitchEntityModal, setActiveSwitchEntityModal] = React.useState(null);

  const grouped = {};
  ids.forEach((entityId) => {
    const domain = domainFor(entityId);
    if (!grouped[domain]) grouped[domain] = [];
    grouped[domain].push(entityId);
  });

  if (!show) return null;

  const sortedDomains = Object.keys(grouped).sort((a, b) => {
    const order = ['light', 'climate', 'fan', 'lock', 'switch', 'input_boolean', 'input_number', 'number', 'camera', 'alarm_control_panel', 'timer', 'select', 'input_select', 'button', 'script', 'scene', 'sensor', 'binary_sensor'];
    const ai = order.indexOf(a);
    const bi = order.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
  const fanEntityIds = fieldType === 'fan'
    ? ids.filter((entityId) => {
      const domain = domainFor(entityId);
      return domain === 'fan' || domain === 'switch';
    })
    : [];
  const doorEntityIds = fieldType === 'door'
    ? ids.filter((entityId) => {
      const domain = domainFor(entityId);
      const deviceClass = String(entities?.[entityId]?.attributes?.device_class || '');
      return domain === 'binary_sensor' && ['door', 'window', 'opening'].includes(deviceClass);
    })
    : [];
  const motionEntityIds = fieldType === 'motion'
    ? ids.filter((entityId) => {
      const domain = domainFor(entityId);
      const deviceClass = String(entities?.[entityId]?.attributes?.device_class || '');
      return domain === 'binary_sensor' && ['motion', 'occupancy', 'presence'].includes(deviceClass);
    })
    : [];
  const lockEntityIds = fieldType === 'lock'
    ? ids.filter((entityId) => domainFor(entityId) === 'lock')
    : [];
  const numberEntityIds = fieldType === 'number'
    ? ids.filter((entityId) => {
      const domain = domainFor(entityId);
      return domain === 'input_number' || domain === 'number';
    })
    : [];
  const switchEntityIds = fieldType === 'switch'
    ? ids.filter((entityId) => {
      const domain = domainFor(entityId);
      return domain === 'switch' || domain === 'input_boolean';
    })
    : [];
  const cameraEntityIds = fieldType === 'camera'
    ? ids.filter((entityId) => domainFor(entityId) === 'camera')
    : [];
  const alarmEntityIds = fieldType === 'alarm'
    ? ids.filter((entityId) => domainFor(entityId) === 'alarm_control_panel')
    : [];
  const timerEntityIds = fieldType === 'timer'
    ? ids.filter((entityId) => domainFor(entityId) === 'timer')
    : [];
  const selectEntityIds = fieldType === 'select'
    ? ids.filter((entityId) => {
      const domain = domainFor(entityId);
      return domain === 'select' || domain === 'input_select';
    })
    : [];
  const buttonEntityIds = fieldType === 'button'
    ? ids.filter((entityId) => domainFor(entityId) === 'button')
    : [];
  const scriptEntityIds = fieldType === 'script'
    ? ids.filter((entityId) => {
      const domain = domainFor(entityId);
      return domain === 'script' || domain === 'scene';
    })
    : [];
  const fanOnly = fieldType === 'fan' && fanEntityIds.length > 0;
  const doorOnly = fieldType === 'door' && doorEntityIds.length > 0;
  const motionOnly = fieldType === 'motion' && motionEntityIds.length > 0;
  const lockOnly = fieldType === 'lock' && lockEntityIds.length > 0;
  const numberOnly = fieldType === 'number' && numberEntityIds.length > 0;
  const switchOnly = fieldType === 'switch' && switchEntityIds.length > 0;
  const cameraOnly = fieldType === 'camera' && cameraEntityIds.length > 0;
  const alarmOnly = fieldType === 'alarm' && alarmEntityIds.length > 0;
  const timerOnly = fieldType === 'timer' && timerEntityIds.length > 0;
  const selectOnly = fieldType === 'select' && selectEntityIds.length > 0;
  const buttonOnly = fieldType === 'button' && buttonEntityIds.length > 0;
  const scriptOnly = fieldType === 'script' && scriptEntityIds.length > 0;
  const thermostatOnly = sortedDomains.length === 1 && sortedDomains[0] === 'climate';
  const focusedLayout = thermostatOnly || fanOnly || doorOnly || motionOnly || lockOnly || numberOnly || switchOnly || cameraOnly || alarmOnly || timerOnly || selectOnly || buttonOnly || scriptOnly;

  const openEntityModal = (entityId) => {
    const domain = domainFor(entityId);
    if (domain === 'light' && setShowLightModal) {
      const allLights = Array.isArray(grouped.light) ? grouped.light.filter(Boolean) : [];
      setShowLightModal({
        lightId: entityId,
        lightIds: allLights.length ? allLights : [entityId],
      });
      onClose?.();
      return;
    }
    if (domain === 'climate' && setActiveClimateEntityModal) {
      setActiveClimateEntityModal(entityId);
      onClose?.();
      return;
    }
    if (domain === 'fan' || (domain === 'switch' && fieldType === 'fan')) {
      setActiveFanEntityModal(entityId);
      return;
    }
    if (domain === 'binary_sensor' && fieldType === 'door') {
      setActiveDoorEntityModal(entityId);
      return;
    }
    if (domain === 'binary_sensor' && fieldType === 'motion') {
      setActiveMotionEntityModal(entityId);
      return;
    }
    if (domain === 'lock' && fieldType === 'lock') {
      setActiveLockEntityModal(entityId);
      return;
    }
    if ((domain === 'input_number' || domain === 'number') && fieldType === 'number') {
      setActiveNumberEntityModal(entityId);
      return;
    }
    if ((domain === 'switch' || domain === 'input_boolean') && fieldType === 'switch') {
      setActiveSwitchEntityModal(entityId);
      return;
    }
    if (setShowSensorInfoModal) {
      setShowSensorInfoModal(entityId);
      onClose?.();
    }
  };

  const handleToggle = (entityId) => {
    const domain = domainFor(entityId);
    if (domain === 'lock') {
      const state = String(getEntityState(entityId, entities)).toLowerCase();
      callService('lock', state === 'locked' ? 'unlock' : 'lock', { entity_id: entityId });
      return;
    }
    if (!canToggleDomain(domain)) return;
    callService(domain, 'toggle', { entity_id: entityId });
  };

  const handleAdjustNumber = (entityId, direction) => {
    const domain = domainFor(entityId);
    if (!['input_number', 'number'].includes(domain)) return;
    callService(domain, direction === 'up' ? 'increment' : 'decrement', { entity_id: entityId });
  };

  const filteredByState = (list, domain) => {
    if (activityFilter === 'all') return list;
    return list.filter((entityId) => {
      const active = isActiveState(domain, getEntityState(entityId, entities));
      return activityFilter === 'active' ? active : !active;
    });
  };

  const getVisibleList = (domain) => filteredByState(grouped[domain] || [], domain);

  const handleDomainBulk = (domain, direction) => {
    const list = getVisibleList(domain);
    list.forEach((entityId) => {
      const state = normalize(getEntityState(entityId, entities));
      if (domain === 'lock') {
        callService('lock', direction === 'on' ? 'unlock' : 'lock', { entity_id: entityId });
        return;
      }
      if (!canToggleDomain(domain)) return;
      if (direction === 'on' && !['on', 'open', 'unlocked', 'true', '1'].includes(state)) {
        callService(domain, 'toggle', { entity_id: entityId });
      } else if (direction === 'off' && ['on', 'open', 'unlocked', 'true', '1'].includes(state)) {
        callService(domain, 'toggle', { entity_id: entityId });
      }
    });
  };

  const showEntityHistory = (entityId) => {
    if (!entityId || !setShowSensorInfoModal) return;
    setShowSensorInfoModal(entityId);
  };

  return (
    <>
      <div
      className="fixed inset-0 z-50 flex items-start justify-center p-6 pt-12 md:pt-16"
      style={{ backdropFilter: 'blur(20px)', backgroundColor: 'rgba(0,0,0,0.3)' }}
      onClick={onClose}
    >
      <div
        className={`border w-full max-w-5xl rounded-3xl md:rounded-[3rem] overflow-hidden flex flex-col ${focusedLayout ? '' : 'lg:grid lg:grid-cols-5'} backdrop-blur-xl shadow-2xl popup-anim relative max-h-[90vh] h-[90vh] md:min-h-[560px] min-h-0`}
        style={{
          background: 'linear-gradient(135deg, var(--card-bg) 0%, var(--modal-bg) 100%)',
          borderColor: 'var(--glass-border)',
          color: 'var(--text-primary)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="modal-close light-modal-close-anchor light-modal-close-anchor--single z-[70]"
          aria-label={tr('common.close', 'Lukk')}
        >
          <X className="w-4 h-4" />
        </button>

        {!focusedLayout && (
          <div className="lg:col-span-2 relative p-5 md:p-8 lg:p-10 border-b lg:border-b-0 lg:border-r flex flex-col gap-5" style={{ borderColor: 'var(--glass-border)' }}>
          <div className="pr-14">
            <div className="text-xs uppercase tracking-[0.22em] font-extrabold text-[var(--text-secondary)] mb-2">
              {tr('sauna.details', 'Sauna detaljer')}
            </div>
            <h2 className="text-2xl md:text-3xl font-light italic uppercase leading-tight">{title || tr('sauna.details', 'Detaljer')}</h2>
            <div className="mt-3 inline-flex items-center gap-2 px-3 py-1 rounded-full border bg-[var(--glass-bg)] border-[var(--glass-border)] text-[var(--text-secondary)]">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span className="text-[10px] uppercase tracking-widest font-extrabold">
                {ids.length} {ids.length === 1 ? tr('common.entity', 'entitet') : tr('common.entities', 'entiteter')}
              </span>
            </div>
          </div>

          <div className="rounded-2xl border p-1 bg-[var(--glass-bg)] border-[var(--glass-border)] flex">
            <button
              type="button"
              onClick={() => setActivityFilter('all')}
              className={`flex-1 py-2 rounded-xl text-[11px] uppercase tracking-widest font-bold transition-all ${activityFilter === 'all' ? 'bg-[var(--glass-bg-hover)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
            >
              {tr('common.all', 'Alle')}
            </button>
            <button
              type="button"
              onClick={() => setActivityFilter('active')}
              className={`flex-1 py-2 rounded-xl text-[11px] uppercase tracking-widest font-bold transition-all ${activityFilter === 'active' ? 'bg-emerald-500/20 text-emerald-300' : 'text-[var(--text-secondary)] hover:text-emerald-300'}`}
            >
              {tr('common.on', 'På')}
            </button>
            <button
              type="button"
              onClick={() => setActivityFilter('inactive')}
              className={`flex-1 py-2 rounded-xl text-[11px] uppercase tracking-widest font-bold transition-all ${activityFilter === 'inactive' ? 'bg-[var(--glass-bg-hover)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
            >
              {tr('common.off', 'Av')}
            </button>
          </div>

          <div className="mt-auto rounded-2xl border p-4 bg-[var(--glass-bg)] border-[var(--glass-border)] text-[11px] leading-relaxed text-[var(--text-secondary)]">
            {tr('sauna.quickHint', 'Trykk på en rad for å åpne full kontroll. Bruk hurtigknapper til høyre for raske av/på-kommandoer.')}
          </div>
          </div>
        )}

        <div className={`${focusedLayout ? 'flex-1 min-h-0 p-4 md:p-6 pt-14 md:pt-16' : 'lg:col-span-3 p-5 md:p-8'} overflow-y-auto custom-scrollbar space-y-4`}>
          {ids.length === 0 && (
            <div className="rounded-2xl border p-4 text-sm" style={{ borderColor: 'var(--glass-border)', backgroundColor: 'var(--glass-bg)' }}>
              {tr('common.noData', 'Ingen entiteter konfigurert for dette feltet.')}
            </div>
          )}

          {fanOnly && (
            <section className="rounded-2xl border p-3 md:p-4 space-y-3 popup-surface" style={{ borderColor: 'var(--glass-border)' }}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-2xl border flex items-center justify-center bg-[var(--glass-bg)]" style={{ borderColor: 'var(--glass-border)' }}>
                    <Fan className="w-5 h-5 text-[var(--text-secondary)]" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm md:text-base font-bold truncate">{tr('sauna.fans', 'Vifter')}</div>
                    <div className="text-[10px] uppercase tracking-widest text-[var(--text-secondary)]">{fanEntityIds.length} {tr('common.entities', 'entiteter')}</div>
                  </div>
                </div>
              </div>
              <div className="space-y-3">
                {fanEntityIds
                  .filter((entityId) => {
                    if (activityFilter === 'all') return true;
                    const domain = domainFor(entityId);
                    const active = isActiveState(domain, getEntityState(entityId, entities));
                    return activityFilter === 'active' ? active : !active;
                  })
                  .map((entityId) => {
                    const ent = entities?.[entityId];
                    if (!ent) return null;
                    return (
                      <GenericFanModal
                        key={entityId}
                        entityId={entityId}
                        entity={ent}
                        callService={callService}
                        t={t}
                        onShowHistory={showEntityHistory}
                        embedded
                        showCloseButton={false}
                      />
                    );
                  })}
              </div>
            </section>
          )}
          {doorOnly && (
            <section className="rounded-2xl border p-3 md:p-4 space-y-3 popup-surface" style={{ borderColor: 'var(--glass-border)' }}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-2xl border flex items-center justify-center bg-[var(--glass-bg)]" style={{ borderColor: 'var(--glass-border)' }}>
                    <DoorOpen className="w-5 h-5 text-[var(--text-secondary)]" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm md:text-base font-bold truncate">{tr('sauna.doors', 'Dører')}</div>
                    <div className="text-[10px] uppercase tracking-widest text-[var(--text-secondary)]">{doorEntityIds.length} {tr('common.entities', 'entiteter')}</div>
                  </div>
                </div>
              </div>
              <div className="space-y-3">
                {doorEntityIds
                  .filter((entityId) => {
                    if (activityFilter === 'all') return true;
                    const active = isActiveState('binary_sensor', getEntityState(entityId, entities));
                    return activityFilter === 'active' ? active : !active;
                  })
                  .map((entityId) => {
                    const ent = entities?.[entityId];
                    if (!ent) return null;
                    return (
                      <GenericDoorModal
                        key={entityId}
                        entityId={entityId}
                        entity={ent}
                        t={t}
                        onShowHistory={showEntityHistory}
                        embedded
                        showCloseButton={false}
                      />
                    );
                  })}
              </div>
            </section>
          )}
          {motionOnly && (
            <section className="rounded-2xl border p-3 md:p-4 space-y-3 popup-surface" style={{ borderColor: 'var(--glass-border)' }}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-2xl border flex items-center justify-center bg-[var(--glass-bg)]" style={{ borderColor: 'var(--glass-border)' }}>
                    <Activity className="w-5 h-5 text-[var(--text-secondary)]" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm md:text-base font-bold truncate">{tr('sauna.motion', 'Bevegelse')}</div>
                    <div className="text-[10px] uppercase tracking-widest text-[var(--text-secondary)]">{motionEntityIds.length} {tr('common.entities', 'entiteter')}</div>
                  </div>
                </div>
              </div>
              <div className="space-y-3">
                {motionEntityIds
                  .filter((entityId) => {
                    if (activityFilter === 'all') return true;
                    const active = isActiveState('binary_sensor', getEntityState(entityId, entities));
                    return activityFilter === 'active' ? active : !active;
                  })
                  .map((entityId) => {
                    const ent = entities?.[entityId];
                    if (!ent) return null;
                    return (
                      <GenericMotionModal
                        key={entityId}
                        entityId={entityId}
                        entity={ent}
                        t={t}
                        onShowHistory={showEntityHistory}
                        embedded
                        showCloseButton={false}
                      />
                    );
                  })}
              </div>
            </section>
          )}
          {lockOnly && (
            <section className="rounded-2xl border p-3 md:p-4 space-y-3 popup-surface" style={{ borderColor: 'var(--glass-border)' }}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-2xl border flex items-center justify-center bg-[var(--glass-bg)]" style={{ borderColor: 'var(--glass-border)' }}>
                    <Lock className="w-5 h-5 text-[var(--text-secondary)]" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm md:text-base font-bold truncate">{tr('sauna.locks', 'Låser')}</div>
                    <div className="text-[10px] uppercase tracking-widest text-[var(--text-secondary)]">{lockEntityIds.length} {tr('common.entities', 'entiteter')}</div>
                  </div>
                </div>
              </div>
              <div className="space-y-3">
                {lockEntityIds
                  .filter((entityId) => {
                    if (activityFilter === 'all') return true;
                    const active = isActiveState('lock', getEntityState(entityId, entities));
                    return activityFilter === 'active' ? active : !active;
                  })
                  .map((entityId) => {
                    const ent = entities?.[entityId];
                    if (!ent) return null;
                    return (
                      <GenericLockModal
                        key={entityId}
                        entityId={entityId}
                        entity={ent}
                        callService={callService}
                        t={t}
                        onShowHistory={showEntityHistory}
                        embedded
                        showCloseButton={false}
                      />
                    );
                  })}
              </div>
            </section>
          )}
          {switchOnly && (
            <section className="rounded-2xl border p-3 md:p-4 space-y-3 popup-surface" style={{ borderColor: 'var(--glass-border)' }}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-2xl border flex items-center justify-center bg-[var(--glass-bg)]" style={{ borderColor: 'var(--glass-border)' }}>
                    <ToggleRight className="w-5 h-5 text-[var(--text-secondary)]" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm md:text-base font-bold truncate">{tr('common.switch', 'Bryter')}</div>
                    <div className="text-[10px] uppercase tracking-widest text-[var(--text-secondary)]">{switchEntityIds.length} {tr('common.entities', 'entiteter')}</div>
                  </div>
                </div>
              </div>
              <div className="space-y-3">
                {switchEntityIds
                  .filter((entityId) => {
                    if (activityFilter === 'all') return true;
                    const domain = domainFor(entityId);
                    const active = isActiveState(domain, getEntityState(entityId, entities));
                    return activityFilter === 'active' ? active : !active;
                  })
                  .map((entityId) => {
                    const ent = entities?.[entityId];
                    if (!ent) return null;
                    return (
                      <GenericSwitchModal
                        key={entityId}
                        entityId={entityId}
                        entity={ent}
                        callService={callService}
                        t={t}
                        onShowHistory={showEntityHistory}
                        embedded
                        showCloseButton={false}
                      />
                    );
                  })}
              </div>
            </section>
          )}
          {numberOnly && (
            <section className="rounded-2xl border p-3 md:p-4 space-y-3 popup-surface" style={{ borderColor: 'var(--glass-border)' }}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-2xl border flex items-center justify-center bg-[var(--glass-bg)]" style={{ borderColor: 'var(--glass-border)' }}>
                    <Hash className="w-5 h-5 text-[var(--text-secondary)]" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm md:text-base font-bold truncate">{tr('room.domain.number', 'Nummer')}</div>
                    <div className="text-[10px] uppercase tracking-widest text-[var(--text-secondary)]">{numberEntityIds.length} {tr('common.entities', 'entiteter')}</div>
                  </div>
                </div>
              </div>
              <div className="space-y-3">
                {numberEntityIds.map((entityId) => {
                  const ent = entities?.[entityId];
                  if (!ent) return null;
                  return (
                    <GenericNumberModal
                      key={entityId}
                      entityId={entityId}
                      entity={ent}
                      callService={callService}
                      t={t}
                      directInput={numberMode === 'code'}
                      maxDigits={numberMode === 'code' ? (Number(numberMaxDigits) || 4) : null}
                      onShowHistory={showEntityHistory}
                      embedded
                      showCloseButton={false}
                    />
                  );
                })}
              </div>
            </section>
          )}
          {cameraOnly && (
            <section className="rounded-2xl border p-3 md:p-4 space-y-3 popup-surface" style={{ borderColor: 'var(--glass-border)' }}>
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-2xl border flex items-center justify-center bg-[var(--glass-bg)]" style={{ borderColor: 'var(--glass-border)' }}>
                  <Camera className="w-5 h-5 text-[var(--text-secondary)]" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm md:text-base font-bold truncate">{tr('room.domain.camera', 'Kamera')}</div>
                  <div className="text-[10px] uppercase tracking-widest text-[var(--text-secondary)]">{cameraEntityIds.length} {tr('common.entities', 'entiteter')}</div>
                </div>
              </div>
              <div className="space-y-3">
                {cameraEntityIds.map((entityId) => {
                  const ent = entities?.[entityId];
                  if (!ent) return null;
                  return (
                    <GenericUtilityModal
                      key={entityId}
                      mode="camera"
                      entityId={entityId}
                      entity={ent}
                      callService={callService}
                      t={t}
                      onShowHistory={showEntityHistory}
                      embedded
                      showCloseButton={false}
                    />
                  );
                })}
              </div>
            </section>
          )}
          {alarmOnly && (
            <section className="rounded-2xl border p-3 md:p-4 space-y-3 popup-surface" style={{ borderColor: 'var(--glass-border)' }}>
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-2xl border flex items-center justify-center bg-[var(--glass-bg)]" style={{ borderColor: 'var(--glass-border)' }}>
                  <Shield className="w-5 h-5 text-[var(--text-secondary)]" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm md:text-base font-bold truncate">{tr('room.domain.alarm', 'Alarm')}</div>
                  <div className="text-[10px] uppercase tracking-widest text-[var(--text-secondary)]">{alarmEntityIds.length} {tr('common.entities', 'entiteter')}</div>
                </div>
              </div>
              <div className="space-y-3">
                {alarmEntityIds.map((entityId) => {
                  const ent = entities?.[entityId];
                  if (!ent) return null;
                  return (
                    <GenericUtilityModal
                      key={entityId}
                      mode="alarm"
                      entityId={entityId}
                      entity={ent}
                      callService={callService}
                      t={t}
                      onShowHistory={showEntityHistory}
                      embedded
                      showCloseButton={false}
                    />
                  );
                })}
              </div>
            </section>
          )}
          {timerOnly && (
            <section className="rounded-2xl border p-3 md:p-4 space-y-3 popup-surface" style={{ borderColor: 'var(--glass-border)' }}>
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-2xl border flex items-center justify-center bg-[var(--glass-bg)]" style={{ borderColor: 'var(--glass-border)' }}>
                  <AlarmClock className="w-5 h-5 text-[var(--text-secondary)]" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm md:text-base font-bold truncate">{tr('room.domain.timer', 'Timer')}</div>
                  <div className="text-[10px] uppercase tracking-widest text-[var(--text-secondary)]">{timerEntityIds.length} {tr('common.entities', 'entiteter')}</div>
                </div>
              </div>
              <div className="space-y-3">
                {timerEntityIds.map((entityId) => {
                  const ent = entities?.[entityId];
                  if (!ent) return null;
                  return (
                    <GenericUtilityModal
                      key={entityId}
                      mode="timer"
                      entityId={entityId}
                      entity={ent}
                      callService={callService}
                      t={t}
                      onShowHistory={showEntityHistory}
                      embedded
                      showCloseButton={false}
                    />
                  );
                })}
              </div>
            </section>
          )}
          {selectOnly && (
            <section className="rounded-2xl border p-3 md:p-4 space-y-3 popup-surface" style={{ borderColor: 'var(--glass-border)' }}>
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-2xl border flex items-center justify-center bg-[var(--glass-bg)]" style={{ borderColor: 'var(--glass-border)' }}>
                  <ListChecks className="w-5 h-5 text-[var(--text-secondary)]" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm md:text-base font-bold truncate">{tr('room.domain.select', 'Valg')}</div>
                  <div className="text-[10px] uppercase tracking-widest text-[var(--text-secondary)]">{selectEntityIds.length} {tr('common.entities', 'entiteter')}</div>
                </div>
              </div>
              <div className="space-y-3">
                {selectEntityIds.map((entityId) => {
                  const ent = entities?.[entityId];
                  if (!ent) return null;
                  return (
                    <GenericUtilityModal
                      key={entityId}
                      mode="select"
                      entityId={entityId}
                      entity={ent}
                      callService={callService}
                      t={t}
                      onShowHistory={showEntityHistory}
                      embedded
                      showCloseButton={false}
                    />
                  );
                })}
              </div>
            </section>
          )}
          {buttonOnly && (
            <section className="rounded-2xl border p-3 md:p-4 space-y-3 popup-surface" style={{ borderColor: 'var(--glass-border)' }}>
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-2xl border flex items-center justify-center bg-[var(--glass-bg)]" style={{ borderColor: 'var(--glass-border)' }}>
                  <Zap className="w-5 h-5 text-[var(--text-secondary)]" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm md:text-base font-bold truncate">{tr('room.domain.button', 'Knapp')}</div>
                  <div className="text-[10px] uppercase tracking-widest text-[var(--text-secondary)]">{buttonEntityIds.length} {tr('common.entities', 'entiteter')}</div>
                </div>
              </div>
              <div className="space-y-3">
                {buttonEntityIds.map((entityId) => {
                  const ent = entities?.[entityId];
                  if (!ent) return null;
                  return (
                    <GenericUtilityModal
                      key={entityId}
                      mode="button"
                      entityId={entityId}
                      entity={ent}
                      callService={callService}
                      t={t}
                      onShowHistory={showEntityHistory}
                      embedded
                      showCloseButton={false}
                    />
                  );
                })}
              </div>
            </section>
          )}
          {scriptOnly && (
            <section className="rounded-2xl border p-3 md:p-4 space-y-3 popup-surface" style={{ borderColor: 'var(--glass-border)' }}>
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-2xl border flex items-center justify-center bg-[var(--glass-bg)]" style={{ borderColor: 'var(--glass-border)' }}>
                  <Workflow className="w-5 h-5 text-[var(--text-secondary)]" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm md:text-base font-bold truncate">{tr('room.domain.script', 'Script/Scene')}</div>
                  <div className="text-[10px] uppercase tracking-widest text-[var(--text-secondary)]">{scriptEntityIds.length} {tr('common.entities', 'entiteter')}</div>
                </div>
              </div>
              <div className="space-y-3">
                {scriptEntityIds.map((entityId) => {
                  const ent = entities?.[entityId];
                  if (!ent) return null;
                  return (
                    <GenericUtilityModal
                      key={entityId}
                      mode="script"
                      entityId={entityId}
                      entity={ent}
                      callService={callService}
                      t={t}
                      onShowHistory={showEntityHistory}
                      embedded
                      showCloseButton={false}
                    />
                  );
                })}
              </div>
            </section>
          )}

          {sortedDomains.map((domain) => {
            if (fanOnly && (domain === 'fan' || domain === 'switch')) return null;
            if (doorOnly && domain === 'binary_sensor') return null;
            if (motionOnly && domain === 'binary_sensor') return null;
            if (lockOnly && domain === 'lock') return null;
            if (switchOnly && (domain === 'switch' || domain === 'input_boolean')) return null;
            if (numberOnly && (domain === 'input_number' || domain === 'number')) return null;
            if (cameraOnly && domain === 'camera') return null;
            if (alarmOnly && domain === 'alarm_control_panel') return null;
            if (timerOnly && domain === 'timer') return null;
            if (selectOnly && (domain === 'select' || domain === 'input_select')) return null;
            if (buttonOnly && domain === 'button') return null;
            if (scriptOnly && (domain === 'script' || domain === 'scene')) return null;
            const list = getVisibleList(domain);
            if (list.length === 0) return null;
            const DomainIcon = iconForDomain(domain);
            const supportsBulk = canToggleDomain(domain);

            if (domain === 'climate') {
              return (
                <section key={domain} className="rounded-2xl border p-3 md:p-4 space-y-3 popup-surface" style={{ borderColor: 'var(--glass-border)' }}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-2xl border flex items-center justify-center bg-[var(--glass-bg)]" style={{ borderColor: 'var(--glass-border)' }}>
                        <DomainIcon className="w-5 h-5 text-[var(--text-secondary)]" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm md:text-base font-bold truncate">{domainLabel(domain, tr)}</div>
                        <div className="text-[10px] uppercase tracking-widest text-[var(--text-secondary)]">{list.length} {tr('common.entities', 'entiteter')}</div>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {list.map((entityId) => {
                      const ent = entities?.[entityId];
                      if (!ent) return null;
                      return (
                        <GenericClimateModal
                          key={entityId}
                          entityId={entityId}
                          entity={ent}
                          callService={callService}
                          hvacMap={hvacMap}
                          fanMap={fanMap}
                          swingMap={swingMap}
                          t={t}
                          onShowHistory={showEntityHistory}
                          embedded
                          showCloseButton={false}
                        />
                      );
                    })}
                  </div>
                </section>
              );
            }

            return (
              <section key={domain} className="rounded-2xl border p-3 md:p-4 space-y-3 popup-surface" style={{ borderColor: 'var(--glass-border)' }}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-2xl border flex items-center justify-center bg-[var(--glass-bg)]" style={{ borderColor: 'var(--glass-border)' }}>
                      <DomainIcon className="w-5 h-5 text-[var(--text-secondary)]" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm md:text-base font-bold truncate">{domainLabel(domain, tr)}</div>
                      <div className="text-[10px] uppercase tracking-widest text-[var(--text-secondary)]">{list.length} {tr('common.entities', 'entiteter')}</div>
                    </div>
                  </div>
                  {supportsBulk && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleDomainBulk(domain, 'on')}
                        className="px-3 py-1.5 rounded-full text-[10px] uppercase tracking-widest font-bold border bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                      >
                        {tr('common.turnOn', 'Slå på')}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDomainBulk(domain, 'off')}
                        className="px-3 py-1.5 rounded-full text-[10px] uppercase tracking-widest font-bold border bg-[var(--glass-bg)] text-[var(--text-secondary)] border-[var(--glass-border)]"
                      >
                        {tr('common.turnOff', 'Slå av')}
                      </button>
                    </div>
                  )}
                </div>

                <div className="space-y-2.5">
                  {list.map((entityId) => {
                    const entity = entities?.[entityId];
                    const rawState = String(getEntityState(entityId, entities));
                    const friendly = getFriendlyName(entityId, entities);
                    const canToggle = canToggleDomain(domain);
                    const isNumeric = isNumericDomain(domain);
                    const active = isActiveState(domain, rawState);
                    const stateLabel = stateLabelFor(domain, rawState, tr);
                    const numericValue = Number(rawState);
                    const hasNumeric = Number.isFinite(numericValue);
                    const readOnly = isReadOnlyDomain(domain);
                    const climateTarget = Number(entity?.attributes?.temperature);
                    const hasClimateTarget = Number.isFinite(climateTarget);
                    const climateCurrent = Number(entity?.attributes?.current_temperature);
                    const minTemp = Number.isFinite(Number(entity?.attributes?.min_temp)) ? Number(entity.attributes.min_temp) : 16;
                    const maxTemp = Number.isFinite(Number(entity?.attributes?.max_temp)) ? Number(entity.attributes.max_temp) : 30;
                    const climateColor = rawState === 'cool' ? 'bg-blue-500' : rawState === 'heat' ? 'bg-orange-500' : 'bg-emerald-500';

                    return (
                      <div
                        key={entityId}
                        className={`rounded-2xl border overflow-hidden transition-all ${active ? 'bg-emerald-500/10 border-emerald-500/25' : 'bg-[var(--glass-bg-hover)] border-[var(--glass-border)]'} lg:grid lg:grid-cols-5`}
                      >
                        <div className="lg:col-span-3 p-3 md:p-4 border-b lg:border-b-0 lg:border-r" style={{ borderColor: 'var(--glass-border)' }}>
                          <div className="flex items-start justify-between gap-3">
                            <button type="button" onClick={() => openEntityModal(entityId)} className="min-w-0 text-left group">
                              <div className="text-base md:text-lg font-light italic uppercase truncate group-hover:underline">{friendly}</div>
                              <div className="text-[10px] text-[var(--text-secondary)] truncate mt-1">{entityId}</div>
                            </button>
                            <div className={`px-2.5 py-1 rounded-full text-[10px] uppercase tracking-widest font-bold border ${active ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' : 'bg-[var(--glass-bg)] text-[var(--text-secondary)] border-[var(--glass-border)]'}`}>
                              {stateLabel}
                            </div>
                          </div>
                        </div>

                        <div className="lg:col-span-2 p-3 md:p-4 flex flex-col justify-center gap-2.5">
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-bold uppercase tracking-widest text-[var(--text-secondary)]">
                              {domain === 'climate'
                                ? tr('sauna.thermostat', 'Termostat')
                                : domain === 'lock'
                                  ? tr('sauna.locks', 'Lås')
                                  : domain === 'fan'
                                    ? tr('sauna.fans', 'Vifte')
                                    : domain === 'binary_sensor'
                                      ? tr('status.statusLabel', 'Status')
                                      : tr('common.value', 'Verdi')}
                            </label>
                            {hasNumeric ? (
                              <span className="text-xl font-semibold tabular-nums text-[var(--text-primary)]">{numericValue}</span>
                            ) : (
                              <span className="text-sm font-semibold text-[var(--text-primary)]">{stateLabel}</span>
                            )}
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => openEntityModal(entityId)}
                              className="h-9 px-4 rounded-xl border transition-all popup-surface popup-surface-hover text-[var(--text-primary)] font-semibold"
                              style={{ borderColor: 'var(--glass-border)' }}
                            >
                              {domain === 'climate'
                                ? tr('sauna.openThermostatCard', 'Åpne termostat')
                                : tr('common.open', 'Åpne')}
                            </button>

                            {canToggle && (
                              <button
                                type="button"
                                onClick={() => handleToggle(entityId)}
                                className={`h-9 px-4 rounded-xl border transition-all font-semibold ${active ? 'bg-[var(--glass-bg)] text-[var(--text-primary)] border-[var(--glass-border)]' : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'}`}
                              >
                                {toggleActionLabel(domain, rawState, tr)}
                              </button>
                            )}

                            {isNumeric && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleAdjustNumber(entityId, 'down')}
                                  className="h-9 px-3 rounded-xl border transition-all popup-surface popup-surface-hover"
                                  style={{ borderColor: 'var(--glass-border)' }}
                                >
                                  {tr('common.decrease', 'Ned')}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleAdjustNumber(entityId, 'up')}
                                  className="h-9 px-3 rounded-xl border transition-all popup-surface popup-surface-hover"
                                  style={{ borderColor: 'var(--glass-border)' }}
                                >
                                  {tr('common.increase', 'Opp')}
                                </button>
                              </>
                            )}

                            {readOnly && !isNumeric && (
                              <button
                                type="button"
                                onClick={() => openEntityModal(entityId)}
                                className="h-9 px-3 rounded-xl border transition-all popup-surface popup-surface-hover text-[var(--text-secondary)] text-[11px] uppercase tracking-widest font-semibold"
                                style={{ borderColor: 'var(--glass-border)' }}
                              >
                                {tr('common.details', 'Detaljer')}
                              </button>
                            )}
                          </div>

                          {domain === 'climate' && hasClimateTarget && (
                            <div className="mt-1 space-y-2">
                              <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)]">
                                <span>{tr('climate.current', 'Nå')}: {Number.isFinite(climateCurrent) ? `${climateCurrent.toFixed(1)}°` : '--'}</span>
                                <span>{tr('climate.target', 'Mål')}: {climateTarget.toFixed(1)}°</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => callService('climate', 'set_temperature', { entity_id: entityId, temperature: climateTarget - 0.5 })}
                                  className="h-8 px-2.5 rounded-lg border popup-surface popup-surface-hover"
                                  style={{ borderColor: 'var(--glass-border)' }}
                                >
                                  -
                                </button>
                                <div className="flex-1">
                                  <M3Slider
                                    min={minTemp}
                                    max={maxTemp}
                                    step={0.5}
                                    value={climateTarget}
                                    onChange={(e) => callService('climate', 'set_temperature', { entity_id: entityId, temperature: parseFloat(e.target.value) })}
                                    colorClass={climateColor}
                                  />
                                </div>
                                <button
                                  type="button"
                                  onClick={() => callService('climate', 'set_temperature', { entity_id: entityId, temperature: climateTarget + 0.5 })}
                                  className="h-8 px-2.5 rounded-lg border popup-surface popup-surface-hover"
                                  style={{ borderColor: 'var(--glass-border)' }}
                                >
                                  +
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </div>
      </div>

      {activeFanEntityModal && entities?.[activeFanEntityModal] && (
        <GenericFanModal
          entityId={activeFanEntityModal}
          entity={entities[activeFanEntityModal]}
          callService={callService}
          t={t}
          overlayOpacity={0}
          onShowHistory={(entityId) => {
            setActiveFanEntityModal(null);
            showEntityHistory(entityId);
          }}
          onClose={() => setActiveFanEntityModal(null)}
        />
      )}
      {activeDoorEntityModal && entities?.[activeDoorEntityModal] && (
        <GenericDoorModal
          entityId={activeDoorEntityModal}
          entity={entities[activeDoorEntityModal]}
          t={t}
          overlayOpacity={0}
          onShowHistory={(entityId) => {
            setActiveDoorEntityModal(null);
            showEntityHistory(entityId);
          }}
          onClose={() => setActiveDoorEntityModal(null)}
        />
      )}
      {activeMotionEntityModal && entities?.[activeMotionEntityModal] && (
        <GenericMotionModal
          entityId={activeMotionEntityModal}
          entity={entities[activeMotionEntityModal]}
          t={t}
          overlayOpacity={0}
          onShowHistory={(entityId) => {
            setActiveMotionEntityModal(null);
            showEntityHistory(entityId);
          }}
          onClose={() => setActiveMotionEntityModal(null)}
        />
      )}
      {activeLockEntityModal && entities?.[activeLockEntityModal] && (
        <GenericLockModal
          entityId={activeLockEntityModal}
          entity={entities[activeLockEntityModal]}
          callService={callService}
          t={t}
          overlayOpacity={0}
          onShowHistory={(entityId) => {
            setActiveLockEntityModal(null);
            showEntityHistory(entityId);
          }}
          onClose={() => setActiveLockEntityModal(null)}
        />
      )}
      {activeSwitchEntityModal && entities?.[activeSwitchEntityModal] && (
        <GenericSwitchModal
          entityId={activeSwitchEntityModal}
          entity={entities[activeSwitchEntityModal]}
          callService={callService}
          t={t}
          overlayOpacity={0}
          onShowHistory={(entityId) => {
            setActiveSwitchEntityModal(null);
            showEntityHistory(entityId);
          }}
          onClose={() => setActiveSwitchEntityModal(null)}
        />
      )}
      {activeNumberEntityModal && entities?.[activeNumberEntityModal] && (
        <GenericNumberModal
          entityId={activeNumberEntityModal}
          entity={entities[activeNumberEntityModal]}
          callService={callService}
          t={t}
          directInput={numberMode === 'code'}
          maxDigits={numberMode === 'code' ? (Number(numberMaxDigits) || 4) : null}
          overlayOpacity={0}
          onShowHistory={(entityId) => {
            setActiveNumberEntityModal(null);
            showEntityHistory(entityId);
          }}
          onClose={() => setActiveNumberEntityModal(null)}
        />
      )}
    </>
  );
}
