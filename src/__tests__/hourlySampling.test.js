import { describe, expect, it } from 'vitest';
import {
  HOURLY_SAMPLE_MINUTE,
  collectPendingHourlySampleTimes,
  getCurrentEligibleHourlyWindowStartMs,
  getFirstScheduledHourlySampleAtOrAfter,
  getRecommendedHourlyMaxEntries,
  toHourKey,
} from '../utils/hourlySampling';

describe('hourlySampling', () => {
  it('schedules the first sample at 2 minutes past the next valid hour boundary', () => {
    const first = getFirstScheduledHourlySampleAtOrAfter(Date.parse('2026-03-18T10:00:00.000Z'));
    const second = getFirstScheduledHourlySampleAtOrAfter(Date.parse('2026-03-18T10:03:00.000Z'));

    expect(HOURLY_SAMPLE_MINUTE).toBe(2);
    expect(new Date(first).toISOString()).toBe('2026-03-18T10:02:00.000Z');
    expect(new Date(second).toISOString()).toBe('2026-03-18T11:02:00.000Z');
  });

  it('collects all missing hourly samples during a continuous active booking', () => {
    const pending = collectPendingHourlySampleTimes({
      eligibleStartMs: Date.parse('2026-03-18T09:00:00.000Z'),
      nowMs: Date.parse('2026-03-18T12:30:00.000Z'),
      existingHourKeys: [toHourKey(Date.parse('2026-03-18T10:02:00.000Z'))],
    });

    expect(pending.map((value) => new Date(value).toISOString())).toEqual([
      '2026-03-18T09:02:00.000Z',
      '2026-03-18T11:02:00.000Z',
      '2026-03-18T12:02:00.000Z',
    ]);
  });

  it('starts sampling from the later of active start and service-state change', () => {
    const eligibleStartMs = getCurrentEligibleHourlyWindowStartMs({
      bookingActive: true,
      serviceActive: false,
      activeEntity: { last_changed: '2026-03-18T08:40:00.000Z' },
      serviceEntity: { last_changed: '2026-03-18T09:15:00.000Z' },
      nowMs: Date.parse('2026-03-18T10:30:00.000Z'),
    });

    expect(new Date(eligibleStartMs).toISOString()).toBe('2026-03-18T09:15:00.000Z');
  });

  it('recommends enough entries to store hourly history for the full retention window', () => {
    expect(getRecommendedHourlyMaxEntries(30)).toBe(720);
    expect(getRecommendedHourlyMaxEntries(365)).toBe(8760);
  });
});
