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

export default function SaunaFieldModal({
  show,
  title,
  entityIds,
  entities,
  callService,
  onClose,
  t,
}) {
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
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl popup-surface rounded-3xl border border-[var(--glass-border)] overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--glass-border)] flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-[var(--text-secondary)] font-bold">
              {t('sauna.details') || 'Sauna details'}
            </div>
            <h3 className="text-lg font-bold text-[var(--text-primary)]">{title || (t('sauna.details') || 'Details')}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full border border-[var(--glass-border)] hover:bg-[var(--glass-bg-hover)] flex items-center justify-center text-[var(--text-secondary)]"
            aria-label={t('common.close') || 'Close'}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 max-h-[70vh] overflow-y-auto custom-scrollbar space-y-3">
          {ids.length === 0 && (
            <div className="text-sm text-[var(--text-secondary)]">{t('common.noData') || 'No entities configured for this field.'}</div>
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
              <div key={entityId} className="rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg-hover)] p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg)] flex items-center justify-center text-[var(--text-secondary)]">
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
                      className="px-3 py-1.5 rounded-lg bg-blue-500/80 hover:bg-blue-500 text-white text-xs font-bold uppercase tracking-wider"
                    >
                      {t('common.toggle') || 'Toggle'}
                    </button>
                  )}

                  {isNumeric && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleAdjustNumber(entityId, 'down')}
                        className="px-3 py-1.5 rounded-lg border border-[var(--glass-border)] text-xs font-bold"
                      >
                        -
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAdjustNumber(entityId, 'up')}
                        className="px-3 py-1.5 rounded-lg border border-[var(--glass-border)] text-xs font-bold"
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
                        className="px-3 py-1.5 rounded-lg border border-[var(--glass-border)] text-xs font-bold"
                      >
                        {t('climate.heat') || 'Heat'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleClimate(entityId, 'off')}
                        className="px-3 py-1.5 rounded-lg border border-[var(--glass-border)] text-xs font-bold"
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
