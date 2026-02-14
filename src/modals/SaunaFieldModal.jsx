import React from 'react';
import { X, Lightbulb, Lock, Fan, Shield, Hash, Thermometer, DoorOpen, ToggleRight } from '../icons';

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
  if (domain === 'sensor') return tr('room.domain.sensor', 'Sensorer');
  if (domain === 'binary_sensor') return tr('room.domain.binarySensor', 'Binærsensor');
  return domain || tr('common.other', 'Annet');
};

export default function SaunaFieldModal({
  show,
  title,
  entityIds,
  entities,
  callService,
  onClose,
  t,
  setShowLightModal,
  setActiveClimateEntityModal,
  setShowSensorInfoModal,
}) {
  const tr = makeTr(t);
  const ids = Array.isArray(entityIds) ? entityIds.filter(Boolean) : [];

  const grouped = {};
  ids.forEach((entityId) => {
    const domain = domainFor(entityId);
    if (!grouped[domain]) grouped[domain] = [];
    grouped[domain].push(entityId);
  });

  if (!show) return null;

  const sortedDomains = Object.keys(grouped).sort((a, b) => {
    const order = ['light', 'climate', 'fan', 'lock', 'switch', 'input_boolean', 'input_number', 'number', 'sensor', 'binary_sensor'];
    const ai = order.indexOf(a);
    const bi = order.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  const openEntityModal = (entityId) => {
    const domain = domainFor(entityId);
    if (domain === 'light' && setShowLightModal) {
      setShowLightModal(entityId);
      onClose?.();
      return;
    }
    if (domain === 'climate' && setActiveClimateEntityModal) {
      setActiveClimateEntityModal(entityId);
      onClose?.();
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-6 pt-12 md:pt-16"
      style={{ backdropFilter: 'blur(20px)', backgroundColor: 'rgba(0,0,0,0.3)' }}
      onClick={onClose}
    >
      <div
        className="border w-full max-w-2xl max-h-[88vh] rounded-3xl md:rounded-[2.5rem] p-5 md:p-8 shadow-2xl relative font-sans flex flex-col backdrop-blur-xl popup-anim"
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
          className="absolute top-5 right-5 w-10 h-10 rounded-full flex items-center justify-center border hover:scale-105 transition-all"
          style={{ borderColor: 'var(--glass-border)', backgroundColor: 'var(--glass-bg)', color: 'var(--text-secondary)' }}
          aria-label={tr('common.close', 'Lukk')}
        >
          <X className="w-5 h-5" />
        </button>

        <div className="pr-14">
          <div className="text-xs uppercase tracking-[0.2em] font-bold text-[var(--text-secondary)] mb-2">
            {tr('sauna.details', 'Sauna detaljer')}
          </div>
          <h2 className="text-2xl font-bold text-[var(--text-primary)]">{title || tr('sauna.details', 'Detaljer')}</h2>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            {ids.length} {ids.length === 1 ? tr('common.entity', 'entitet') : tr('common.entities', 'entiteter')}
          </p>
        </div>

        <div className="mt-6 overflow-y-auto custom-scrollbar space-y-4 pr-1">
          {ids.length === 0 && (
            <div className="rounded-2xl border p-4 text-sm" style={{ borderColor: 'var(--glass-border)', backgroundColor: 'var(--glass-bg)' }}>
              {tr('common.noData', 'Ingen entiteter konfigurert for dette feltet.')}
            </div>
          )}

          {sortedDomains.map((domain) => {
            const list = grouped[domain] || [];
            const DomainIcon = iconForDomain(domain);
            return (
              <section
                key={domain}
                className="rounded-2xl border p-3 md:p-4 space-y-3"
                style={{ borderColor: 'var(--glass-border)', backgroundColor: 'var(--glass-bg)' }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full border flex items-center justify-center" style={{ borderColor: 'var(--glass-border)', backgroundColor: 'var(--glass-bg-hover)' }}>
                      <DomainIcon className="w-4 h-4 text-[var(--text-secondary)]" />
                    </div>
                    <div className="text-sm font-bold text-[var(--text-primary)]">{domainLabel(domain, tr)}</div>
                  </div>
                  <div className="text-xs text-[var(--text-secondary)] font-semibold">{list.length}</div>
                </div>

                <div className="space-y-2">
                  {list.map((entityId) => {
                    const state = String(getEntityState(entityId, entities));
                    const friendly = getFriendlyName(entityId, entities);
                    const canToggle = canToggleDomain(domain);
                    const isNumeric = domain === 'input_number' || domain === 'number';

                    return (
                      <div
                        key={entityId}
                        className="rounded-xl border p-3"
                        style={{ borderColor: 'var(--glass-border)', backgroundColor: 'var(--glass-bg-hover)' }}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-[var(--text-primary)] truncate">{friendly}</div>
                            <div className="text-[10px] text-[var(--text-secondary)] truncate">{entityId}</div>
                          </div>
                          <div className="text-sm font-bold text-[var(--text-primary)]">{state}</div>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => openEntityModal(entityId)}
                            className="h-9 px-4 rounded-full border transition-all"
                            style={{ borderColor: 'var(--glass-border)', backgroundColor: 'var(--glass-bg)', color: 'var(--text-primary)' }}
                          >
                            {domain === 'light'
                              ? tr('sauna.openLightCard', 'Åpne lyskort')
                              : domain === 'climate'
                                ? tr('sauna.openThermostatCard', 'Åpne termostatkort')
                                : domain === 'fan'
                                  ? tr('sauna.openFanCard', 'Åpne viftekort')
                                  : tr('sauna.openEntityCard', 'Åpne kort')}
                          </button>

                          {canToggle && (
                            <button
                              type="button"
                              onClick={() => handleToggle(entityId)}
                              className="h-9 px-4 rounded-full border transition-all flex items-center gap-2 backdrop-blur-md"
                              style={{ borderColor: 'var(--glass-border)', backgroundColor: 'var(--glass-bg)', color: 'var(--text-primary)' }}
                            >
                              {tr('common.toggle', 'Slå av/på')}
                            </button>
                          )}

                          {isNumeric && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleAdjustNumber(entityId, 'down')}
                                className="h-9 px-4 rounded-full border transition-all"
                                style={{ borderColor: 'var(--glass-border)', backgroundColor: 'var(--glass-bg)', color: 'var(--text-primary)' }}
                              >
                                {tr('common.decrease', 'Ned')}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleAdjustNumber(entityId, 'up')}
                                className="h-9 px-4 rounded-full border transition-all"
                                style={{ borderColor: 'var(--glass-border)', backgroundColor: 'var(--glass-bg)', color: 'var(--text-primary)' }}
                              >
                                {tr('common.increase', 'Opp')}
                              </button>
                            </>
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
  );
}
