import { useEffect, useMemo, useRef, useState } from 'react';

const parseTimeMs = (value) => {
  if (value == null || value === '') return NaN;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number' && Number.isFinite(value)) return value > 1e12 ? value : value * 1000;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return NaN;
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) return numeric > 1e12 ? numeric : numeric * 1000;
    const parsed = Date.parse(trimmed);
    return Number.isFinite(parsed) ? parsed : NaN;
  }
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : NaN;
};

const createLinearPath = (points) => points.reduce((acc, point, index) => {
  if (index === 0) return `M ${point[0].toFixed(2)} ${point[1].toFixed(2)}`;
  return `${acc} L ${point[0].toFixed(2)} ${point[1].toFixed(2)}`;
}, '');

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const findNearestByTime = (sortedValues, targetMs) => {
  if (!Array.isArray(sortedValues) || sortedValues.length === 0 || !Number.isFinite(targetMs)) return null;
  let low = 0;
  let high = sortedValues.length - 1;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (sortedValues[mid].ms < targetMs) low = mid + 1;
    else high = mid;
  }
  const candidate = sortedValues[low];
  const prev = sortedValues[Math.max(0, low - 1)];
  if (!candidate) return prev || null;
  if (!prev) return candidate;
  return Math.abs(candidate.ms - targetMs) <= Math.abs(prev.ms - targetMs) ? candidate : prev;
};

export default function DebugMultiSeriesChart({
  series = [],
  height = 160,
  normalizeSeries = true,
  lineStrokeWidth = 1.1,
  onCursorSnapshotChange,
}) {
  const svgRef = useRef(null);
  const [cursorMs, setCursorMs] = useState(null);

  const width = 960;
  const padTop = 10;
  const padRight = 10;
  const padBottom = 14;
  const padLeft = 10;
  const innerWidth = width - padLeft - padRight;
  const innerHeight = height - padTop - padBottom;

  const preparedSeries = useMemo(() => (
    (Array.isArray(series) ? series : [])
      .map((entry, index) => {
        const points = (Array.isArray(entry?.data) ? entry.data : [])
          .map((point) => ({
            ms: parseTimeMs(point?.time),
            value: Number(point?.value),
          }))
          .filter((point) => Number.isFinite(point.ms) && Number.isFinite(point.value))
          .sort((a, b) => a.ms - b.ms);
        if (!points.length) return null;
        return {
          id: entry.id || `series-${index}`,
          label: entry.label || entry.id || `Series ${index + 1}`,
          color: entry.color || '#60a5fa',
          strokeWidth: Number.isFinite(Number(entry.strokeWidth))
            ? Number(entry.strokeWidth)
            : lineStrokeWidth,
          points,
        };
      })
      .filter(Boolean)
  ), [series, lineStrokeWidth]);

  const timeBounds = useMemo(() => {
    if (!preparedSeries.length) return null;
    const allMs = preparedSeries.flatMap((entry) => entry.points.map((point) => point.ms));
    const startMs = Math.min(...allMs);
    const endMs = Math.max(...allMs);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;
    if (endMs <= startMs) return { startMs, endMs: startMs + 60_000 };
    return { startMs, endMs };
  }, [preparedSeries]);

  const globalBounds = useMemo(() => {
    if (!preparedSeries.length) return null;
    const values = preparedSeries.flatMap((entry) => entry.points.map((point) => point.value));
    let min = Math.min(...values);
    let max = Math.max(...values);
    if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
    if (min === max) {
      min -= 1;
      max += 1;
    }
    return { min, max };
  }, [preparedSeries]);

  const chartData = useMemo(() => {
    if (!preparedSeries.length || !timeBounds || !globalBounds) return [];
    const { startMs, endMs } = timeBounds;
    const timeSpan = endMs - startMs;
    return preparedSeries.map((entry) => {
      const localMin = Math.min(...entry.points.map((point) => point.value));
      const localMax = Math.max(...entry.points.map((point) => point.value));
      const bounds = normalizeSeries
        ? (() => {
          if (localMin === localMax) return { min: localMin - 1, max: localMax + 1 };
          return { min: localMin, max: localMax };
        })()
        : globalBounds;
      const valueSpan = bounds.max - bounds.min || 1;

      const points = entry.points.map((point) => {
        const x = padLeft + (((point.ms - startMs) / timeSpan) * innerWidth);
        const yRatio = (point.value - bounds.min) / valueSpan;
        const y = padTop + innerHeight - (yRatio * innerHeight);
        return [x, y];
      });

      return {
        ...entry,
        path: createLinearPath(points),
      };
    });
  }, [preparedSeries, timeBounds, globalBounds, normalizeSeries, innerHeight, innerWidth, padLeft, padTop]);

  useEffect(() => {
    if (!timeBounds) return;
    setCursorMs((prev) => {
      if (Number.isFinite(prev)) return clamp(prev, timeBounds.startMs, timeBounds.endMs);
      return timeBounds.endMs;
    });
  }, [timeBounds]);

  const cursorSnapshot = useMemo(() => {
    if (!timeBounds || !chartData.length || !Number.isFinite(cursorMs)) return null;
    const ms = clamp(cursorMs, timeBounds.startMs, timeBounds.endMs);
    const rows = chartData
      .map((entry) => {
        const nearest = findNearestByTime(entry.points, ms);
        if (!nearest) return null;
        return {
          id: entry.id,
          label: entry.label,
          color: entry.color,
          value: nearest.value,
          pointMs: nearest.ms,
        };
      })
      .filter(Boolean);
    return {
      ms,
      time: new Date(ms),
      rows,
    };
  }, [chartData, cursorMs, timeBounds]);

  useEffect(() => {
    if (typeof onCursorSnapshotChange === 'function') {
      onCursorSnapshotChange(cursorSnapshot);
    }
  }, [cursorSnapshot, onCursorSnapshotChange]);

  const cursorX = useMemo(() => {
    if (!timeBounds || !Number.isFinite(cursorMs)) return null;
    const ms = clamp(cursorMs, timeBounds.startMs, timeBounds.endMs);
    const ratio = (ms - timeBounds.startMs) / (timeBounds.endMs - timeBounds.startMs || 1);
    return padLeft + (ratio * innerWidth);
  }, [cursorMs, timeBounds, innerWidth, padLeft]);

  const updateCursorFromPointer = (event) => {
    if (!svgRef.current || !timeBounds) return;
    const rect = svgRef.current.getBoundingClientRect();
    const clientX = Number.isFinite(event?.clientX) ? event.clientX : 0;
    const cssX = clamp(clientX - rect.left, 0, rect.width);
    const viewBoxX = rect.width > 0 ? (cssX / rect.width) * width : padLeft;
    const x = clamp(viewBoxX, padLeft, padLeft + innerWidth);
    const ratio = (x - padLeft) / (innerWidth || 1);
    const ms = timeBounds.startMs + (ratio * (timeBounds.endMs - timeBounds.startMs));
    setCursorMs(ms);
  };

  if (!chartData.length) {
    return (
      <div className="w-full h-[140px] rounded-xl border border-[var(--glass-border)] bg-[var(--card-bg)] flex items-center justify-center text-xs text-[var(--text-secondary)]">
        No chart data
      </div>
    );
  }

  return (
    <div className="w-full">
      <div
        className="relative w-full"
        style={{ touchAction: 'none' }}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture?.(event.pointerId);
          updateCursorFromPointer(event);
        }}
        onPointerMove={updateCursorFromPointer}
      >
        <svg
          ref={svgRef}
          width="100%"
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          className="overflow-visible rounded-xl"
        >
          <line
            x1={padLeft}
            y1={padTop + innerHeight}
            x2={padLeft + innerWidth}
            y2={padTop + innerHeight}
            stroke="currentColor"
            strokeOpacity="0.12"
            strokeWidth="1"
          />
          {chartData.map((entry) => (
            <path
              key={entry.id}
              d={entry.path}
              fill="none"
              stroke={entry.color}
              strokeWidth={entry.strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              shapeRendering="geometricPrecision"
              opacity="0.95"
            />
          ))}

          {Number.isFinite(cursorX) && (
            <>
              <line
                x1={cursorX}
                y1={padTop}
                x2={cursorX}
                y2={padTop + innerHeight}
                stroke="#cbd5e1"
                strokeOpacity="0.52"
                strokeWidth="1"
                strokeDasharray="4 3"
                vectorEffect="non-scaling-stroke"
              />
              <circle
                cx={cursorX}
                cy={padTop}
                r="3.2"
                fill="#cbd5e1"
                fillOpacity="0.8"
                vectorEffect="non-scaling-stroke"
              />
              <circle
                cx={cursorX}
                cy={padTop + innerHeight}
                r="3.2"
                fill="#cbd5e1"
                fillOpacity="0.8"
                vectorEffect="non-scaling-stroke"
              />
              {cursorSnapshot?.rows.map((row) => {
                const seriesEntry = chartData.find((entry) => entry.id === row.id);
                if (!seriesEntry) return null;
                const nearest = findNearestByTime(seriesEntry.points, cursorSnapshot.ms);
                if (!nearest) return null;
                const x = padLeft + (((nearest.ms - timeBounds.startMs) / (timeBounds.endMs - timeBounds.startMs || 1)) * innerWidth);
                const localMin = normalizeSeries ? Math.min(...seriesEntry.points.map((point) => point.value)) : globalBounds.min;
                const localMax = normalizeSeries ? Math.max(...seriesEntry.points.map((point) => point.value)) : globalBounds.max;
                const bounds = localMin === localMax ? { min: localMin - 1, max: localMax + 1 } : { min: localMin, max: localMax };
                const y = padTop + innerHeight - (((nearest.value - bounds.min) / ((bounds.max - bounds.min) || 1)) * innerHeight);
                return (
                  <circle
                    key={`cursor-${row.id}`}
                    cx={x}
                    cy={y}
                    r="2.6"
                    fill={row.color}
                    stroke="#0b1222"
                    strokeWidth="1.1"
                    vectorEffect="non-scaling-stroke"
                  />
                );
              })}
            </>
          )}
        </svg>
      </div>

      {cursorSnapshot && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
          <span className="px-2 py-1 rounded-md border border-[var(--glass-border)] bg-[var(--card-bg)] text-[var(--text-secondary)]">
            {cursorSnapshot.time.toLocaleString()}
          </span>
          {cursorSnapshot.rows.map((row) => (
            <span
              key={`snapshot-${row.id}`}
              className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md border border-[var(--glass-border)] bg-[var(--card-bg)] text-[var(--text-secondary)]"
            >
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: row.color }} />
              <span className="text-[var(--text-primary)]">{row.label}</span>
              <span className="font-semibold text-[var(--text-primary)]">{Number(row.value).toFixed(2)}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
