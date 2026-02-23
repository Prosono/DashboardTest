/**
 * Edit-mode overlay rendered on top of each card.
 * Contains move, edit, visibility, resize, delete buttons and the drag handle.
 *
 * Extracted from the inline `getControls` function in App.jsx.
 */
import { memo, useEffect, useRef } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Edit2,
  Eye,
  EyeOff,
  GripVertical,
  Maximize2,
  Minimize2,
  Trash2
} from '../../icons';

/** Prefixes for cards that support size toggling. */
const RESIZABLE_PREFIXES = [
  'light_', 'light.', 'vacuum.', 'automation.', 'climate_card_',
  'cost_card_', 'weather_temp_', 'androidtv_card_', 'calendar_card_',
  'calendar_booking_card_',
  'todo_card_', 'nordpool_card_', 'car_card_', 'cover_card_',
];

/** Prefixes that cycle through 3 sizes (small → medium → large). */
const TRIPLE_SIZE_PREFIXES = ['calendar_card_', 'calendar_booking_card_', 'todo_card_'];

function canResize(editId, settings) {
  if (editId) return true;
  if (['entity', 'toggle', 'sensor'].includes(settings?.type)) return true;
  return RESIZABLE_PREFIXES.some(p => editId.startsWith(p));
}

function getNextSize(editId, currentSize) {
  if (TRIPLE_SIZE_PREFIXES.some(p => editId.startsWith(p))) {
    return currentSize === 'small' ? 'medium' : (currentSize === 'medium' ? 'large' : 'small');
  }
  return currentSize === 'small' ? 'large' : 'small';
}

function EditOverlay({
  _cardId,
  editId,
  _settingsKey,
  isHidden,
  currentSize,
  currentGridSize,
  gridColumnCount,
  settings,
  canRemove,
  onMoveLeft,
  onMoveRight,
  onEdit,
  onToggleVisibility,
  onSaveSize,
  onIncreaseGridSize,
  onDecreaseGridSize,
  onAdjustGridSize,
  onRemove,
  dragHandleProps,
  t,
}) {
  const showResize = canResize(editId, settings);
  const isDividerCard = String(editId || '').startsWith('divider_card_') || settings?.type === 'divider';
  const isSmall = currentSize === 'small';
  const isTriple = TRIPLE_SIZE_PREFIXES.some(p => editId.startsWith(p));
  const resizeDragRef = useRef(null);
  const resizeCleanupRef = useRef(null);
  const resizeRafRef = useRef(0);
  const pendingDeltaRef = useRef({ x: 0, y: 0 });
  
  const parsePx = (value, fallback = 0) => {
    const parsed = Number.parseFloat(String(value || '').replace('px', ''));
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  const getAxisStep = (distance, threshold) => {
    if (!threshold || threshold <= 0) return 0;
    const sign = distance < 0 ? -1 : 1;
    return sign * Math.floor(Math.abs(distance) / threshold);
  };

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  const startResizeDrag = (e) => {
    e.stopPropagation();
    e.preventDefault();
    const cardElement = e.currentTarget.closest('[data-grid-card]');
    const gridElement = e.currentTarget.closest('[data-dashboard-grid]');

    const gridStyles = gridElement ? window.getComputedStyle(gridElement) : null;
    const colGap = parsePx(gridStyles?.columnGap ?? gridStyles?.gap, 0);
    const rowGap = parsePx(gridStyles?.rowGap ?? gridStyles?.gap, 0);
    const baseRowHeight = parsePx(gridStyles?.gridAutoRows, 100);
    const cardRect = cardElement?.getBoundingClientRect?.();
    const gridRect = gridElement?.getBoundingClientRect?.();
    const columnCount = Math.max(1, Number(gridColumnCount) || 1);
    const gridBasedColWidth = gridRect
      ? (gridRect.width - Math.max(0, columnCount - 1) * colGap) / columnCount
      : 0;
    const currentColSpan = Math.max(1, Number(currentGridSize?.colSpan) || Number(settings?.gridColSpan) || 1);
    const cardBasedColWidth = cardRect
      ? (cardRect.width - Math.max(0, currentColSpan - 1) * colGap) / currentColSpan
      : 0;
    const baseColWidth = Math.max(24, gridBasedColWidth || cardBasedColWidth || 120);

    const sensitivityFactor = 1.3;
    const xThreshold = clamp((baseColWidth + colGap) * sensitivityFactor, 72, 220);
    const yThreshold = clamp((baseRowHeight + rowGap) * sensitivityFactor, 72, 200);

    resizeDragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      lastStepX: 0,
      lastStepY: 0,
      stepX: xThreshold,
      stepY: yThreshold,
    };

    const handleMove = (event) => moveResizeDrag(event);
    const handleEnd = (event) => endResizeDrag(event);
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleEnd);
    resizeCleanupRef.current = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleEnd);
      resizeCleanupRef.current = null;
    };
  };

  const moveResizeDrag = (e) => {
    const drag = resizeDragRef.current;
    if (!drag) return;
    if (typeof e.pointerId === 'number' && e.pointerId !== drag.pointerId) return;
    e.stopPropagation();
    e.preventDefault();

    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    const stepX = getAxisStep(dx, drag.stepX);
    const stepY = getAxisStep(dy, drag.stepY);

    const deltaX = stepX - drag.lastStepX;
    const deltaY = stepY - drag.lastStepY;
    if (deltaX || deltaY) {
      pendingDeltaRef.current.x += deltaX;
      pendingDeltaRef.current.y += deltaY;
      if (!resizeRafRef.current) {
        resizeRafRef.current = window.requestAnimationFrame(() => {
          resizeRafRef.current = 0;
          const pending = pendingDeltaRef.current;
          if (pending.x || pending.y) {
            onAdjustGridSize?.(pending.x, pending.y);
            pendingDeltaRef.current = { x: 0, y: 0 };
          }
        });
      }
      drag.lastStepX = stepX;
      drag.lastStepY = stepY;
    }
  };

  const endResizeDrag = (e) => {
    if (!resizeDragRef.current) return;
    const drag = resizeDragRef.current;
    if (typeof e?.pointerId === 'number' && e.pointerId !== drag.pointerId) return;
    e?.stopPropagation?.();
    e?.preventDefault?.();
    if (resizeRafRef.current) {
      window.cancelAnimationFrame(resizeRafRef.current);
      resizeRafRef.current = 0;
    }
    const pending = pendingDeltaRef.current;
    if (pending.x || pending.y) {
      onAdjustGridSize?.(pending.x, pending.y);
      pendingDeltaRef.current = { x: 0, y: 0 };
    }
    resizeDragRef.current = null;
    resizeCleanupRef.current?.();
  };

  useEffect(() => () => {
    if (resizeRafRef.current) {
      window.cancelAnimationFrame(resizeRafRef.current);
      resizeRafRef.current = 0;
    }
    resizeCleanupRef.current?.();
  }, []);

  return (
    <>
      {/* Move buttons – top left */}
      <div className="absolute top-2 left-2 z-50 flex gap-2">
        <button
          onClick={(e) => { e.stopPropagation(); onMoveLeft(); }}
          className="p-2 rounded-full transition-colors hover:bg-blue-500/80 text-white border border-white/20 shadow-lg bg-black/60"
          title={t('tooltip.moveLeft')}
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onMoveRight(); }}
          className="p-2 rounded-full transition-colors hover:bg-blue-500/80 text-white border border-white/20 shadow-lg bg-black/60"
          title={t('tooltip.moveRight')}
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Action buttons – top right */}
      <div className="absolute top-2 right-2 z-50 flex gap-2">
        <button
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
          className="p-2 rounded-full text-white border border-white/20 shadow-lg bg-black/60"
          title={t('tooltip.editCard')}
        >
          <Edit2 className="w-4 h-4" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onToggleVisibility(); }}
          className="p-2 rounded-full transition-colors hover:bg-white/20 text-white border border-white/20 shadow-lg"
          style={{ backgroundColor: isHidden ? 'rgba(239, 68, 68, 0.8)' : 'rgba(0, 0, 0, 0.6)' }}
          title={isHidden ? t('tooltip.showCard') : t('tooltip.hideCard')}
        >
          {isHidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
        {showResize && (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSaveSize(getNextSize(editId, currentSize));
              }}
              className="p-2 rounded-full transition-colors hover:bg-purple-500/80 text-white border border-white/20 shadow-lg bg-black/60"
              title={isTriple ? 'Bytt storleik' : (isSmall ? t('tooltip.largeSize') : t('tooltip.smallSize'))}
            >
              {isSmall ? <Maximize2 className="w-4 h-4" /> : <Minimize2 className="w-4 h-4" />}
            </button>
          </>
        )}
        {canRemove && (
          <button
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            className="p-2 rounded-full transition-colors hover:bg-red-500/80 text-white border border-white/20 shadow-lg bg-black/60"
            title={t('tooltip.removeCard')}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {showResize && (
        <div className={`absolute bottom-2 z-50 ${isDividerCard ? 'right-14' : 'right-2'}`}>
          <button
            onPointerDown={startResizeDrag}
            className="p-2 rounded-full text-white border border-white/20 shadow-lg bg-purple-500/80 cursor-nwse-resize touch-none"
            title="Drag to resize"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Central drag handle */}
      <div className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none">
        <div
          data-drag-handle
          {...dragHandleProps}
          style={{ touchAction: 'none' }}
          className="flex items-center justify-center p-3 rounded-full bg-black/50 border border-white/10 text-white/80 shadow-lg pointer-events-auto"
        >
          <GripVertical className="w-5 h-5" />
        </div>
      </div>
    </>
  );
}

export default memo(EditOverlay);
