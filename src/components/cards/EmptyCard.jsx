import React from 'react';

export default function EmptyCard({
  cardId,
  dragProps,
  controls,
  cardStyle,
  editMode = false,
}) {
  return (
    <div
      key={cardId}
      {...dragProps}
      className={`relative w-full h-full ${editMode ? 'cursor-move' : 'cursor-default'}`}
      style={{
        ...cardStyle,
        background: 'transparent',
        backgroundColor: 'transparent',
        border: editMode ? '1px dashed color-mix(in srgb, var(--glass-border) 80%, transparent)' : 'none',
        borderColor: editMode ? undefined : 'transparent',
        boxShadow: 'none',
        backdropFilter: 'none',
      }}
    >
      {controls}
      {editMode && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center text-[10px] uppercase tracking-[0.18em] font-bold text-[var(--text-secondary)]">
          Empty
        </div>
      )}
    </div>
  );
}
