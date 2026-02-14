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

export default function SaunaFieldModal({ show, title, entityIds, entities, callService, onClose, t }) {
  if (!show) return null;

  const ids = Array.isArray(entityIds) ? entityIds.filter(Boolean) : [];

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

  const handleClimate = (entityId, mode) => {
    callService('climate', 'set_hvac_mode', { entity_id: entityId, hvac_mode: mode });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-6 pt-12 md:pt-16"
      style={{ backdropFilter: 'blur(20px)', backgroundColor: 'rgba(0,0,0,0.3)' }}
      onClick={onClose}
    >
      <div
        className="border w-full max-w-xl max-h-[85vh] rounded-3xl md:rounded-[2.5rem] p-5 md:p-8 shadow-2xl relative font-sans flex flex-col backdrop-blur-xl popup-anim"
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
          style={{
            borderColor: 'var(--glass-border)',
            backgroundColor: 'var(--glass-bg)',
            color: 'var(--text-secondary)',
          }}
          aria-label={t('common.close') || 'Close'}
        >
          <X className="w-5 h-5" />
        </button>

        <div className="pr-14">
          <div className="text-xs uppercase tracking-[0.2em] font-bold text-[var(--text-secondary)] mb-2">
            {t('sauna.details') || 'Sauna details'}
          </div>
          <h2 className="text-2xl font-bold text-[var(--text-primary)]">{title || (t('sauna.details') || 'Details')}</h2>
        </div>

        <div className="mt-6 overflow-y-auto custom-scrollbar space-y-3 pr-1">
          {ids.length === 0 && (
            <div className="rounded-2xl border p-4 text-sm" style={{ borderColor: 'var(--glass-border)', backgroundColor: 'var(--glass-bg)' }}>
              {t('common.noData') || 'No entities configured for this field.'}
            </div>
          )}

          {ids.map((entityId) => {
            const domain = domainFor(entityId);
            const state = String(getEntityState(entityId, entities));
            const friendly = getFriendlyName(entityId, entities);
            const Icon = iconForDomain(domain);
            const canToggle = canToggleDomain(domain);
            const isNumeric = domain === 'input_number' || domain === 'number';
            const isClimate = domain === 'climate';

            return (
              <div
                key={entityId}
                className="rounded-2xl border p-3 md:p-4"
                style={{ borderColor: 'var(--glass-border)', backgroundColor: 'var(--glass-bg)' }}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex items-center gap-3">
                    <div
                      className="w-9 h-9 rounded-full border flex items-center justify-center"
                      style={{ borderColor: 'var(--glass-border)', backgroundColor: 'var(--glass-bg-hover)', color: 'var(--text-secondary)' }}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-[var(--text-primary)] truncate">{friendly}</div>
                      <div className="text-[10px] text-[var(--text-secondary)] truncate">{entityId}</div>
                    </div>
                  </div>
                  <div className="text-sm font-bold text-[var(--text-primary)]">{state}</div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {canToggle && (
                    <button
                      type="button"
                      onClick={() => handleToggle(entityId)}
                      className="h-9 px-4 rounded-full border transition-all flex items-center gap-2 backdrop-blur-md"
                      style={{
                        borderColor: 'var(--glass-border)',
                        backgroundColor: 'var(--glass-bg-hover)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      {t('common.toggle') || 'Toggle'}
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
                        -
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAdjustNumber(entityId, 'up')}
                        className="h-9 px-4 rounded-full border transition-all"
                        style={{ borderColor: 'var(--glass-border)', backgroundColor: 'var(--glass-bg)', color: 'var(--text-primary)' }}
                      >
                        +
                      </button>
                    </>
                  )}

                  {isClimate && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleClimate(entityId, 'heat')}
                        className="h-9 px-4 rounded-full border transition-all"
                        style={{ borderColor: 'var(--glass-border)', backgroundColor: 'var(--glass-bg)', color: 'var(--text-primary)' }}
                      >
                        {t('climate.heat') || 'Heat'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleClimate(entityId, 'off')}
                        className="h-9 px-4 rounded-full border transition-all"
                        style={{ borderColor: 'var(--glass-border)', backgroundColor: 'var(--glass-bg)', color: 'var(--text-primary)' }}
                      >
                        {t('common.off') || 'Off'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
