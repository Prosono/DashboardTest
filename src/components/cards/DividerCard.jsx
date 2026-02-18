import React from 'react';

export default function DividerCard({
  cardId,
  dragProps,
  controls,
  cardStyle,
  settings = {},
  editMode = false,
}) {
  const orientation = settings.orientation === 'vertical' ? 'vertical' : 'horizontal';
  const showHeader = orientation === 'horizontal' && Boolean(settings.showHeader) && String(settings.header || '').trim().length > 0;
  const header = String(settings.header || '').trim();
  const lineStyle = {
    background: 'color-mix(in srgb, var(--text-secondary) 48%, transparent)',
    opacity: 0.95,
  };

  return (
    <div
      key={cardId}
      {...dragProps}
      className={`relative w-full h-full ${editMode ? 'cursor-move' : 'cursor-default'}`}
      style={{
        ...cardStyle,
        minHeight: orientation === 'vertical' ? '180px' : '76px',
        background: 'transparent',
        backgroundColor: 'transparent',
        border: 'none',
        borderColor: 'transparent',
        boxShadow: 'none',
        backdropFilter: 'none',
      }}
    >
      {controls}
      {orientation === 'horizontal' ? (
        <div className="relative w-full h-full px-3">
          {showHeader && (
            <div className="absolute top-1 left-1/2 -translate-x-1/2 text-[10px] uppercase tracking-[0.18em] font-bold text-[var(--text-secondary)] text-center max-w-[90%] truncate">
              {header}
            </div>
          )}
          <div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[2px] rounded-full opacity-95"
            style={{
              width: 'calc(100% - 24px)',
              ...lineStyle,
            }}
          />
        </div>
      ) : (
        <div className="relative w-full h-full">
          <div
            className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-[2px] rounded-full"
            style={lineStyle}
          />
        </div>
      )}
    </div>
  );
}
