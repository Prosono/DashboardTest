import React, { useState } from 'react';

const DEFAULT_ACTIVE_STATES = [
  'on', 'open', 'unlocked', 'detected', 'occupied', 'presence', 'active',
  'true', '1', 'yes', 'ja', 'heat', 'heating', 'playing',
];

const parseTimeMs = (value) => {
  if (!value) return NaN;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value < 1e12 ? value * 1000 : value;
  const direct = Date.parse(String(value));
  if (Number.isFinite(direct)) return direct;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric < 1e12 ? numeric * 1000 : numeric;
  return NaN;
};

const isStateActive = (state, activeStates = DEFAULT_ACTIVE_STATES) => {
  const normalized = String(state ?? '').trim().toLowerCase();
  return activeStates.map((entry) => String(entry).trim().toLowerCase()).includes(normalized);
};

const createLinePath = (points) => points.reduce((acc, point, index) => {
  if (index === 0) return `M ${point[0].toFixed(2)},${point[1].toFixed(2)}`;
  return `${acc} L ${point[0].toFixed(2)},${point[1].toFixed(2)}`;
}, '');

const buildOverlaySegments = (events, startMs, endMs, activeStates) => {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return [];
  const sorted = (Array.isArray(events) ? events : [])
    .map((event) => ({ ...event, ms: parseTimeMs(event?.time) }))
    .filter((event) => Number.isFinite(event.ms))
    .sort((a, b) => a.ms - b.ms);

  if (!sorted.length) return [{ start: startMs, end: endMs, active: false }];

  const previous = [...sorted].reverse().find((event) => event.ms <= startMs);
  let currentState = previous ? previous.state : sorted[0].state;
  let cursor = startMs;
  const segments = [];

  sorted.forEach((event) => {
    if (event.ms <= startMs) return;
    if (event.ms > endMs) return;
    if (event.ms > cursor) {
      segments.push({ start: cursor, end: event.ms, active: isStateActive(currentState, activeStates) });
      cursor = event.ms;
    }
    currentState = event.state;
  });

  if (cursor < endMs) {
    segments.push({ start: cursor, end: endMs, active: isStateActive(currentState, activeStates) });
  }

  return segments;
};

export default function SensorHistoryGraph({
  data,
  height = 200,
  color = '#3b82f6',
  strokeColor,
  areaColor,
  variant = 'line',
  overlays = [],
  noDataLabel = 'No history data available',
  formatXLabel,
}) {
  const safeData = Array.isArray(data) ? data : [];
  const [hoverIndex, setHoverIndex] = useState(null);
  const isLightTheme = typeof document !== 'undefined' && document.documentElement?.dataset?.theme === 'light';
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1024;

  if (safeData.length === 0) {
    return (
      <div
        className="h-[200px] flex items-center justify-center text-sm"
        style={{ color: isLightTheme ? 'rgba(71, 85, 105, 0.86)' : 'rgba(148, 163, 184, 0.8)' }}
      >
        {noDataLabel}
      </div>
    );
  }

  const padding = { top: 20, right: 20, bottom: 30, left: 40 };
  const width = 600;
  const graphWidth = width - padding.left - padding.right;
  const graphHeight = height - padding.top - padding.bottom;
  const lineColor = strokeColor || color;
  const fillColor = areaColor || lineColor;
  const chartVariant = variant === 'bars' ? 'bars' : 'line';

  const values = safeData.map((d) => d.value);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (chartVariant === 'bars') min = Math.min(0, min);
  if (min === max) {
    min -= 1;
    max += 1;
  }

  const range = max - min;
  const renderMin = min;
  const renderMax = max + (range * 0.05);
  const renderRange = renderMax - renderMin;

  const timeMs = safeData.map((point) => parseTimeMs(point?.time)).filter((ms) => Number.isFinite(ms));
  const startMs = timeMs.length ? Math.min(...timeMs) : 0;
  const endMs = timeMs.length ? Math.max(...timeMs) : 0;
  const hasTimeScale = Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs;
  const indexDenominator = Math.max(1, safeData.length - 1);

  const xForPoint = (point, index) => {
    if (hasTimeScale) {
      const ms = parseTimeMs(point?.time);
      if (Number.isFinite(ms)) {
        const ratio = Math.max(0, Math.min(1, (ms - startMs) / (endMs - startMs)));
        return padding.left + (ratio * graphWidth);
      }
    }
    return padding.left + ((index / indexDenominator) * graphWidth);
  };

  const xFromMs = (ms) => {
    if (!hasTimeScale) return padding.left;
    const ratio = Math.max(0, Math.min(1, (ms - startMs) / (endMs - startMs)));
    return padding.left + (ratio * graphWidth);
  };

  const pointsArray = safeData.map((point, index) => ([
    xForPoint(point, index),
    padding.top + graphHeight - (((point.value - renderMin) / renderRange) * graphHeight),
  ]));

  const pathData = createLinePath(pointsArray);
  const areaData = `${pathData} L ${padding.left + graphWidth},${height} L ${padding.left},${height} Z`;
  const barStep = pointsArray.length > 1 ? (graphWidth / Math.max(1, pointsArray.length - 1)) : graphWidth;
  const barWidth = Math.max(2, Math.min(22, barStep * 0.62));

  const yLabels = [
    { value: max, y: padding.top },
    { value: (max + min) / 2, y: padding.top + graphHeight / 2 },
    { value: min, y: height - padding.bottom },
  ];

  const xLabels = [];
  const labelCount = viewportWidth < 480 ? 3 : (viewportWidth < 768 ? 4 : 5);
  const axisLabelFill = isLightTheme ? 'rgba(51,65,85,0.88)' : 'var(--text-secondary)';
  const axisLabelOpacity = isLightTheme ? 0.92 : 0.6;
  const gridStroke = isLightTheme ? 'rgba(100,116,139,0.16)' : 'currentColor';
  const gridStrokeOpacity = isLightTheme ? 1 : 0.05;
  for (let i = 0; i < labelCount; i += 1) {
    const fraction = i / (labelCount - 1);
    const x = padding.left + (fraction * graphWidth);
    let label = '';
    if (hasTimeScale) {
      const ts = startMs + ((endMs - startMs) * fraction);
      label = formatXLabel ? formatXLabel(new Date(ts)) : new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else {
      const index = Math.round(fraction * (safeData.length - 1));
      const point = safeData[index];
      label = point
        ? (formatXLabel ? formatXLabel(new Date(point.time)) : new Date(point.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
        : '';
    }
    const anchor = i === 0 ? 'start' : (i === labelCount - 1 ? 'end' : 'middle');
    xLabels.push({ x, label, anchor });
  }

  const overlayRows = hasTimeScale
    ? (Array.isArray(overlays) ? overlays : [])
      .map((overlay) => {
        const events = Array.isArray(overlay?.events) ? overlay.events : [];
        if (!events.length) return null;
        return {
          label: overlay.label || '',
          color: overlay.color || '#60a5fa',
          segments: buildOverlaySegments(events, startMs, endMs, overlay.activeStates),
        };
      })
      .filter(Boolean)
    : [];

  const idSeed = `${Math.round(startMs)}_${Math.round(endMs)}_${data.length}`;
  const areaGradientId = `area-gradient-${idSeed}`;
  const fadeGradientId = `fade-gradient-${idSeed}`;
  const maskId = `mask-${idSeed}`;

  const formatTooltipValue = (value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return '--';
    if (chartVariant === 'bars') return `${Math.round(numeric)}`;
    if (Math.abs(numeric % 1) < 0.005) return numeric.toFixed(0);
    if (Math.abs((numeric * 10) - Math.round(numeric * 10)) < 0.005) return numeric.toFixed(1);
    return numeric.toFixed(2);
  };

  const formatTooltipTime = (value) => {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '--';
    return date.toLocaleString([], {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const hoveredPoint = hoverIndex !== null && pointsArray[hoverIndex]
    ? {
      index: hoverIndex,
      x: pointsArray[hoverIndex][0],
      y: pointsArray[hoverIndex][1],
      dataPoint: safeData[hoverIndex],
    }
    : null;

  const tooltipData = hoveredPoint?.dataPoint
    ? (() => {
      const timeLabel = formatTooltipTime(hoveredPoint.dataPoint.time);
      const valueLabel = formatTooltipValue(hoveredPoint.dataPoint.value);
      const boxWidth = Math.max(104, Math.max(timeLabel.length * 5.6, valueLabel.length * 9) + 22);
      const boxHeight = 42;
      const desiredX = hoveredPoint.x > (width - 160)
        ? hoveredPoint.x - boxWidth - 12
        : hoveredPoint.x + 12;
      const desiredY = hoveredPoint.y < (padding.top + 52)
        ? hoveredPoint.y + 10
        : hoveredPoint.y - boxHeight - 10;

      return {
        timeLabel,
        valueLabel,
        boxWidth,
        boxHeight,
        boxX: Math.max(padding.left, Math.min(width - padding.right - boxWidth, desiredX)),
        boxY: Math.max(8, Math.min(height - padding.bottom - boxHeight, desiredY)),
      };
    })()
    : null;

  const handlePointerMove = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width) return;
    const ratioX = (event.clientX - rect.left) / rect.width;
    const svgX = Math.max(padding.left, Math.min(width - padding.right, ratioX * width));
    let nextIndex = 0;
    let minDistance = Number.POSITIVE_INFINITY;
    pointsArray.forEach((point, index) => {
      const distance = Math.abs(point[0] - svgX);
      if (distance < minDistance) {
        minDistance = distance;
        nextIndex = index;
      }
    });
    setHoverIndex((prev) => (prev === nextIndex ? prev : nextIndex));
  };

  const clearHover = () => setHoverIndex(null);

  return (
    <div className="w-full relative select-none">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-full overflow-visible"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id={areaGradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={fillColor} stopOpacity="0.25" />
            <stop offset="50%" stopColor={fillColor} stopOpacity="0.12" />
            <stop offset="100%" stopColor={fillColor} stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id={fadeGradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="white" stopOpacity="1" />
            <stop offset="80%" stopColor="white" stopOpacity="0.6" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </linearGradient>
          <mask id={maskId}>
            <rect x="0" y="0" width={width} height={height} fill={`url(#${fadeGradientId})`} />
          </mask>
        </defs>

        {yLabels.map((label, index) => (
          <line
            key={index}
            x1={padding.left}
            y1={label.y}
            x2={width - padding.right}
            y2={label.y}
            stroke={gridStroke}
            strokeOpacity={gridStrokeOpacity}
            strokeDasharray="4 4"
          />
        ))}

        {overlayRows.map((overlay, overlayIndex) => (
          <g key={`${overlay.label}-${overlayIndex}`}>
            {overlay.segments
              .filter((segment) => segment.active && segment.end > segment.start)
              .map((segment, segmentIndex) => {
                const x1 = xFromMs(segment.start);
                const x2 = xFromMs(segment.end);
                return (
                  <rect
                    key={`${overlay.label}-${segmentIndex}`}
                    x={x1}
                    y={padding.top}
                    width={Math.max(0.5, x2 - x1)}
                    height={graphHeight}
                    fill={overlay.color}
                    opacity={0.09}
                  />
                );
              })}
            {overlay.segments.length > 0 && (
              <path
                d={overlay.segments
                  .map((segment, segmentIndex) => {
                    const y = segment.active
                      ? (padding.top + 14 + (overlayIndex * 11))
                      : (padding.top + graphHeight);
                    const x1 = xFromMs(segment.start);
                    const x2 = xFromMs(segment.end);
                    if (segmentIndex === 0) return `M ${x1.toFixed(2)} ${y.toFixed(2)} L ${x2.toFixed(2)} ${y.toFixed(2)}`;
                    return `L ${x1.toFixed(2)} ${y.toFixed(2)} L ${x2.toFixed(2)} ${y.toFixed(2)}`;
                  })
                  .join(' ')}
                fill="none"
                stroke={overlay.color}
                strokeWidth="1.8"
                strokeOpacity="0.85"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
          </g>
        ))}

        {chartVariant === 'line' ? (
          <>
            <path d={areaData} fill={`url(#${areaGradientId})`} mask={`url(#${maskId})`} />
            <path
              d={pathData}
              fill="none"
              stroke={lineColor}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.9"
            />
          </>
        ) : (
          pointsArray.map(([x, y], index) => (
            <rect
              key={`bar-${index}`}
              x={x - (barWidth / 2)}
              y={y}
              width={barWidth}
              height={Math.max(1, (height - padding.bottom) - y)}
              rx={Math.min(3, barWidth / 3)}
              fill={lineColor}
              fillOpacity={hoverIndex === index ? 0.94 : 0.72}
            />
          ))
        )}

        <rect
          x={padding.left}
          y={padding.top}
          width={graphWidth}
          height={graphHeight}
          fill="transparent"
          pointerEvents="all"
          onMouseMove={handlePointerMove}
          onMouseLeave={clearHover}
          onPointerMove={handlePointerMove}
          onPointerLeave={clearHover}
        />

        {hoveredPoint && (
          <>
            <line
              x1={hoveredPoint.x}
              y1={padding.top}
              x2={hoveredPoint.x}
              y2={height - padding.bottom}
              stroke={lineColor}
              strokeWidth="1.1"
              strokeDasharray="4 4"
              strokeOpacity="0.42"
            />
            <circle
              cx={hoveredPoint.x}
              cy={hoveredPoint.y}
              r={chartVariant === 'bars' ? Math.max(4, barWidth * 0.28) : 4.5}
              fill="#07111d"
              stroke={lineColor}
              strokeWidth="2"
            />
          </>
        )}

        {tooltipData && (
          <g pointerEvents="none">
            <rect
              x={tooltipData.boxX}
              y={tooltipData.boxY}
              width={tooltipData.boxWidth}
              height={tooltipData.boxHeight}
              rx="10"
              fill="#0d1b2a"
              fillOpacity="0.94"
              stroke="rgba(255,255,255,0.12)"
            />
            <text
              x={tooltipData.boxX + 10}
              y={tooltipData.boxY + 15}
              className="text-[9px] fill-current font-mono tracking-tight"
              style={{ fill: isLightTheme ? 'rgba(226,232,240,0.92)' : 'var(--text-secondary)' }}
            >
              {tooltipData.timeLabel}
            </text>
            <text
              x={tooltipData.boxX + 10}
              y={tooltipData.boxY + 31}
              className="text-[14px] fill-current font-semibold tracking-tight"
              style={{ fill: 'var(--text-primary)' }}
            >
              {tooltipData.valueLabel}
            </text>
          </g>
        )}

        {yLabels.map((label, index) => (
          <text
            key={index}
            x={padding.left - 8}
            y={label.y}
            textAnchor="end"
            dominantBaseline="middle"
            className="text-[10px] fill-current opacity-60 font-mono tracking-tighter"
            style={{ fill: axisLabelFill, opacity: axisLabelOpacity }}
          >
            {label.value.toFixed(1)}
          </text>
        ))}

        {xLabels.map((label, index) => (
          <text
            key={index}
            x={label.x}
            y={height - 5}
            textAnchor={label.anchor}
            className="text-[10px] fill-current opacity-60 font-mono tracking-tighter"
            style={{ fill: axisLabelFill, opacity: axisLabelOpacity }}
          >
            {label.label}
          </text>
        ))}
      </svg>
    </div>
  );
}
