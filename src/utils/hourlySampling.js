export const HOURLY_SAMPLE_MINUTE = 2;

const HOUR_MS = 60 * 60 * 1000;

export const parseTimestampMs = (value) => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? NaN : value.getTime();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 1e12 ? value : value * 1000;
  }
  const parsed = Date.parse(String(value || '').trim());
  return Number.isFinite(parsed) ? parsed : NaN;
};

export const toHourKey = (timestampMs) => {
  if (!Number.isFinite(timestampMs)) return '';
  const date = new Date(timestampMs);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  return `${year}-${month}-${day}-${hour}`;
};

export const toScheduledHourlySampleMs = (timestampMs, sampleMinute = HOURLY_SAMPLE_MINUTE) => {
  if (!Number.isFinite(timestampMs)) return NaN;
  const date = new Date(timestampMs);
  date.setMinutes(sampleMinute, 0, 0);
  return date.getTime();
};

export const getFirstScheduledHourlySampleAtOrAfter = (timestampMs, sampleMinute = HOURLY_SAMPLE_MINUTE) => {
  if (!Number.isFinite(timestampMs)) return NaN;
  const scheduledMs = toScheduledHourlySampleMs(timestampMs, sampleMinute);
  return timestampMs <= scheduledMs ? scheduledMs : scheduledMs + HOUR_MS;
};

export const getEntityStateChangedMs = (entity) => parseTimestampMs(
  entity?.last_changed
  || entity?.last_updated
  || entity?.last_reported,
);

export const getCurrentEligibleHourlyWindowStartMs = ({
  bookingActive,
  serviceActive,
  activeEntity,
  serviceEntity,
  nowMs = Date.now(),
}) => {
  if (!bookingActive || serviceActive) return null;

  const activeChangedMs = getEntityStateChangedMs(activeEntity);
  let eligibleStartMs = Number.isFinite(activeChangedMs) ? activeChangedMs : nowMs;

  if (serviceEntity) {
    const serviceChangedMs = getEntityStateChangedMs(serviceEntity);
    if (Number.isFinite(serviceChangedMs)) {
      eligibleStartMs = Math.max(eligibleStartMs, serviceChangedMs);
    }
  }

  return eligibleStartMs;
};

export const collectPendingHourlySampleTimes = ({
  nowMs = Date.now(),
  eligibleStartMs,
  existingHourKeys = [],
  ignoredHourKeys = [],
  sampleMinute = HOURLY_SAMPLE_MINUTE,
}) => {
  if (!Number.isFinite(nowMs) || !Number.isFinite(eligibleStartMs) || nowMs < eligibleStartMs) {
    return [];
  }

  const existing = new Set((Array.isArray(existingHourKeys) ? existingHourKeys : []).map((value) => String(value || '').trim()).filter(Boolean));
  const ignored = new Set((Array.isArray(ignoredHourKeys) ? ignoredHourKeys : []).map((value) => String(value || '').trim()).filter(Boolean));
  const pending = [];

  let sampleMs = getFirstScheduledHourlySampleAtOrAfter(eligibleStartMs, sampleMinute);
  while (Number.isFinite(sampleMs) && sampleMs <= nowMs) {
    const hourKey = toHourKey(sampleMs);
    if (hourKey && !existing.has(hourKey) && !ignored.has(hourKey)) {
      pending.push(sampleMs);
    }
    sampleMs += HOUR_MS;
  }

  return pending;
};

export const getRecommendedHourlyMaxEntries = (keepDays) => {
  const days = Number.isFinite(Number(keepDays)) ? Math.max(1, Math.ceil(Number(keepDays))) : 1;
  return days * 24;
};
