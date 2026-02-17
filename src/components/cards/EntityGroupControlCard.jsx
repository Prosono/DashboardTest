import React, { useMemo } from 'react';
import { Fan, DoorOpen, Activity, Lock, ToggleRight, Hash } from '../../icons';

const norm = (v) => String(v ?? '').toLowerCase();
const isOn = (state) => ['on', 'open', 'true', '1', 'unlocked', 'heat', 'heating'].includes(norm(state));

const iconByType = {
  fan: Fan,
  door: DoorOpen,
  motion: Activity,
  lock: Lock,
  switch: ToggleRight,
  number: Hash,
};

const fallbackTitleByType = {
  fan: 'Vifter',
  door: 'Dorer',
  motion: 'Bevegelse',
  lock: 'Laser',
  switch: 'Brytere',
  number: 'Nummer',
};

export default function EntityGroupControlCard({
  cardId,
  settings,
  entities,
  dragProps,
  controls,
  cardStyle,
  editMode,
  customNames,
  customIcons,
  onOpen,
  t,
}) {
  const fieldType = settings?.fieldType || 'switch';
  const ids = Array.isArray(settings?.entityIds) ? settings.entityIds.filter(Boolean) : [];
  const availableIds = ids.filter((id) => entities?.[id]);

  const activeCount = useMemo(() => {
    if (fieldType === 'number') return availableIds.length;
    if (fieldType === 'lock') return availableIds.filter((id) => norm(entities?.[id]?.state) === 'unlocked').length;
    return availableIds.filter((id) => isOn(entities?.[id]?.state)).length;
  }, [availableIds, entities, fieldType]);

  const total = availableIds.length;
  const Icon = customIcons?.[cardId] ? iconByType[fieldType] || ToggleRight : iconByType[fieldType] || ToggleRight;
  const titleFallback = fallbackTitleByType[fieldType] || 'Gruppe';
  const title = customNames?.[cardId] || settings?.title || titleFallback;

  const value = fieldType === 'number'
    ? `${total}`
    : `${activeCount}/${total}`;

  const badge = fieldType === 'number'
    ? (t?.('common.entities') || 'entiteter')
    : (t?.('common.on') || 'på');

  return (
    <button
      type="button"
      {...dragProps}
      onClick={() => { if (!editMode) onOpen?.(); }}
      className={`w-full h-full p-4 rounded-2xl border text-left relative overflow-hidden transition-all ${editMode ? 'cursor-move' : 'cursor-pointer active:scale-[0.99]'} bg-[var(--glass-bg)] border-[var(--glass-border)]`}
      style={cardStyle}
    >
      {controls}
      <div className="flex items-center gap-3">
        <div className={`w-11 h-11 rounded-xl border flex items-center justify-center ${activeCount > 0 ? 'bg-emerald-500/14 border-emerald-500/28 text-emerald-300' : 'bg-[var(--glass-bg-hover)] border-[var(--glass-border)] text-[var(--text-secondary)]'}`}>
          <Icon className={`w-5 h-5 ${activeCount > 0 ? (fieldType === 'fan' ? 'animate-[fanSpin_1.25s_linear_infinite]' : 'animate-pulse') : ''}`} />
        </div>
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.22em] font-extrabold text-[var(--text-secondary)]">
            {fieldType}
          </div>
          <div className="text-lg font-bold leading-tight text-[var(--text-primary)] truncate">{title}</div>
        </div>
      </div>
      <div className="mt-4 flex items-end justify-between">
        <div className="text-3xl font-semibold leading-none tabular-nums text-[var(--text-primary)]">
          {value}
        </div>
        <div className="text-[10px] uppercase tracking-widest font-bold text-[var(--text-secondary)]">
          {badge}
        </div>
      </div>
      <style>{`
        @keyframes fanSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </button>
  );
}
