import { useMemo } from 'react';

// Helper function to create smooth Bezier curves
const createBezierPath = (points, smoothing = 0.3) => {
  const line = (p1, p2) => {
    const dx = p2[0] - p1[0];
    const dy = p2[1] - p1[1];
    return { length: Math.sqrt(dx * dx + dy * dy), angle: Math.atan2(dy, dx) };
  };
  const controlPoint = (current, previous, next, reverse) => {
    const p = previous || current;
    const n = next || current;
    const l = line(p, n);
    const angle = l.angle + (reverse ? Math.PI : 0);
    const length = l.length * smoothing;
    return [current[0] + Math.cos(angle) * length, current[1] + Math.sin(angle) * length];
  };
  return points.reduce((acc, point, i, a) => {
    if (i === 0) return `M ${point[0]},${point[1]}`;
    const [cpsX, cpsY] = controlPoint(a[i - 1], a[i - 2], point, false);
    const [cpeX, cpeY] = controlPoint(point, a[i - 1], a[i + 1], true);
    return `${acc} C ${cpsX.toFixed(2)},${cpsY.toFixed(2)} ${cpeX.toFixed(2)},${cpeY.toFixed(2)} ${point[0].toFixed(2)},${point[1].toFixed(2)}`;
  }, '');
};

const parseTimeMs = (value) => {
  if (!value) return NaN;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value < 1e12 ? value * 1000 : value;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : NaN;
};

export default function SparkLine({
  data,
  currentIndex,
  height = 40,
  fade = false,
  minValue,
  maxValue,
  variant = 'line',
  barColorAccessor,
  barMaxHeightRatio = 1,
  lineStrokeWidth = 2.5,
  overlaySeries = [],
  includeOverlayInRange = false,
  useTimeScale = false,
}) {
  if (!data || data.length === 0) return null;
  
  const idSuffix = useMemo(() => Math.random().toString(36).substr(2, 9), []);
  const areaId = `cardAreaGrad-${idSuffix}`;
  const lineId = `cardLineGrad-${idSuffix}`;
  const barId = `cardBarGrad-${idSuffix}`;
  const maskId = `cardMask-${idSuffix}`;

  const values = data.map(d => d.value);
  const normalizedOverlays = Array.isArray(overlaySeries)
    ? overlaySeries
      .map((series, index) => {
        const seriesData = Array.isArray(series?.data)
          ? series.data.filter((point) => Number.isFinite(Number(point?.value)))
          : [];
        if (!seriesData.length) return null;
        return {
          id: series.id || `overlay-${index}`,
          label: series.label || '',
          color: series.color || '#93c5fd',
          strokeWidth: Number.isFinite(Number(series.strokeWidth))
            ? Number(series.strokeWidth)
            : Math.max(1, lineStrokeWidth - 0.2),
          data: seriesData.map((point) => ({ ...point, value: Number(point.value) })),
        };
      })
      .filter(Boolean)
    : [];
  const overlayValues = includeOverlayInRange
    ? normalizedOverlays.flatMap((series) => series.data.map((point) => point.value))
    : [];
  const valuesForRange = includeOverlayInRange && overlayValues.length
    ? [...values, ...overlayValues]
    : values;
  let min = Number.isFinite(minValue) ? Number(minValue) : Math.min(...valuesForRange);
  let max = Number.isFinite(maxValue) ? Number(maxValue) : Math.max(...valuesForRange);
  if (max < min) {
    const tmp = max;
    max = min;
    min = tmp;
  }
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const range = max - min || 1;
  const width = 300;
  const safeCurrentIndex = Number.isFinite(Number(currentIndex))
    ? Math.max(0, Math.min(values.length - 1, Number(currentIndex)))
    : Math.max(0, values.length - 1);
  const allPointsForTime = useTimeScale
    ? [
      ...data,
      ...normalizedOverlays.flatMap((series) => series.data),
    ]
    : [];
  const allTimeMs = useTimeScale
    ? allPointsForTime
      .map((point) => parseTimeMs(point?.time))
      .filter((value) => Number.isFinite(value))
    : [];
  const startMs = allTimeMs.length ? Math.min(...allTimeMs) : NaN;
  const endMs = allTimeMs.length ? Math.max(...allTimeMs) : NaN;
  const hasTimeScale = useTimeScale && Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs;

  const getXByPoint = (point, index, count) => {
    if (hasTimeScale) {
      const ms = parseTimeMs(point?.time);
      if (Number.isFinite(ms)) {
        const ratio = Math.max(0, Math.min(1, (ms - startMs) / (endMs - startMs)));
        return ratio * width;
      }
    }
    if (count <= 1) return width / 2;
    return (index / (count - 1)) * width;
  };
  const toPointArray = (series) => series.map((point, index) => [
    getXByPoint(point, index, series.length),
    height - (((Number(point.value) - min) / range) * height),
  ]);

  const points = toPointArray(data);

  const pathData = useMemo(() => createBezierPath(points, 0.3), [points]);
  const areaData = useMemo(() => `${pathData} L ${width},${height} L 0,${height} Z`, [pathData, height]);
  const currentPoint = points[safeCurrentIndex] || points[0];
  const useBars = String(variant || '').toLowerCase() === 'bar';
  const barWidth = values.length <= 1
    ? 26
    : Math.max(2.8, Math.min(16, (width / values.length) * 0.52));
  const safeBarHeightRatio = Number.isFinite(Number(barMaxHeightRatio))
    ? Math.max(0.25, Math.min(1, Number(barMaxHeightRatio)))
    : 1;

  const getDotColor = (val) => {
    const t = (val - min) / range;
    if (t > 0.6) return "#ef4444";
    if (t > 0.3) return "#eab308";
    return "#3b82f6";
  };

  return (
    <div className="mt-1 relative opacity-80 group-hover:opacity-100 transition-all duration-700">
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio={useBars ? 'xMidYMid meet' : 'none'}
        className="overflow-visible"
      >
        <defs>
          {/* Area gradient - more opaque at top */}
          <linearGradient id={areaId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ef4444" stopOpacity="0.2" />
            <stop offset="50%" stopColor="#eab308" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.04" />
          </linearGradient>
          
          {/* Line gradient - color based on value */}
          <linearGradient id={lineId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ef4444" />
            <stop offset="50%" stopColor="#eab308" />
            <stop offset="100%" stopColor="#3b82f6" />
          </linearGradient>

          <linearGradient id={barId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#60a5fa" stopOpacity="0.7" />
          </linearGradient>
          
          {/* Fade mask for smooth bottom */}
          <linearGradient id={maskId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="white" stopOpacity="1" />
            <stop offset="70%" stopColor="white" stopOpacity="0.5" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </linearGradient>
          
          <mask id={`${maskId}-use`}>
            <rect x="0" y="0" width={width} height={height} fill={`url(#${maskId})`} />
          </mask>
        </defs>
        
        {useBars ? (
          <>
            {values.map((v, i) => {
              const point = data[i];
              const normalized = (v - min) / range;
              const barDrawHeight = height * safeBarHeightRatio;
              const y = height - (normalized * barDrawHeight);
              const h = Math.max(1.5, height - y);
              const x = points[i][0] - (barWidth / 2);
              const customBarColor = typeof barColorAccessor === 'function'
                ? barColorAccessor(point, i)
                : (point && point.barColor ? point.barColor : null);
              return (
                <rect
                  key={`bar-${i}`}
                  x={x}
                  y={y}
                  width={barWidth}
                  height={h}
                  rx={Math.min(4, barWidth / 2)}
                  fill={customBarColor || `url(#${barId})`}
                  opacity={i === safeCurrentIndex ? 0.95 : 0.66}
                />
              );
            })}
          </>
        ) : (
          <>
            {/* Area fill with smooth fade */}
            <path d={areaData} fill={`url(#${areaId})`} mask={`url(#${maskId}-use)`} />

            {/* Bezier line with gradient */}
            <path d={pathData} fill="none" stroke={`url(#${lineId})`} strokeWidth={lineStrokeWidth} strokeLinecap="round" strokeLinejoin="round" />

            {normalizedOverlays.map((series) => {
              const overlayPoints = toPointArray(series.data);
              if (!overlayPoints.length) return null;
              const overlayPath = createBezierPath(overlayPoints, 0.25);
              return (
                <path
                  key={series.id}
                  d={overlayPath}
                  fill="none"
                  stroke={series.color}
                  strokeWidth={series.strokeWidth}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity="0.85"
                />
              );
            })}

            {/* Current point marker */}
            <circle cx={currentPoint[0]} cy={currentPoint[1]} r="3.5" fill={getDotColor(values[safeCurrentIndex])} className="animate-pulse" />
          </>
        )}
      </svg>
      {fade && (
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[var(--glass-bg)] opacity-60" />
      )}
    </div>
  );
}
