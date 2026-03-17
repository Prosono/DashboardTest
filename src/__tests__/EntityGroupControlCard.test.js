import { describe, expect, it } from 'vitest';
import { buildGroupActivitySeries } from '../components/cards/EntityGroupControlCard';

describe('EntityGroupControlCard history aggregation', () => {
  it('builds a step series for grouped binary sensors over the last 24 hours', () => {
    const start = new Date('2026-03-16T00:00:00.000Z');
    const end = new Date('2026-03-17T00:00:00.000Z');

    const series = buildGroupActivitySeries({
      entityIds: ['binary_sensor.front_door', 'binary_sensor.back_door'],
      historyById: {
        'binary_sensor.front_door': [
          { state: 'off', last_changed: '2026-03-16T00:00:00.000Z' },
          { state: 'on', last_changed: '2026-03-16T06:00:00.000Z' },
          { state: 'off', last_changed: '2026-03-16T08:00:00.000Z' },
        ],
        'binary_sensor.back_door': [
          { state: 'on', last_changed: '2026-03-16T00:00:00.000Z' },
          { state: 'off', last_changed: '2026-03-16T09:00:00.000Z' },
          { state: 'on', last_changed: '2026-03-16T12:00:00.000Z' },
        ],
      },
      entities: {
        'binary_sensor.front_door': { state: 'off' },
        'binary_sensor.back_door': { state: 'on' },
      },
      fieldType: 'door',
      start,
      end,
    });

    expect(series.map((point) => [point.time.toISOString(), point.value])).toEqual([
      ['2026-03-16T00:00:00.000Z', 1],
      ['2026-03-16T06:00:00.000Z', 1],
      ['2026-03-16T06:00:00.000Z', 2],
      ['2026-03-16T08:00:00.000Z', 2],
      ['2026-03-16T08:00:00.000Z', 1],
      ['2026-03-16T09:00:00.000Z', 1],
      ['2026-03-16T09:00:00.000Z', 0],
      ['2026-03-16T12:00:00.000Z', 0],
      ['2026-03-16T12:00:00.000Z', 1],
      ['2026-03-17T00:00:00.000Z', 1],
    ]);
  });

  it('falls back to the current entity state when recorder history is empty', () => {
    const start = new Date('2026-03-16T00:00:00.000Z');
    const end = new Date('2026-03-17T00:00:00.000Z');

    const series = buildGroupActivitySeries({
      entityIds: ['lock.sauna'],
      historyById: {
        'lock.sauna': [],
      },
      entities: {
        'lock.sauna': { state: 'unlocked' },
      },
      fieldType: 'lock',
      start,
      end,
    });

    expect(series.map((point) => [point.time.toISOString(), point.value])).toEqual([
      ['2026-03-16T00:00:00.000Z', 1],
      ['2026-03-17T00:00:00.000Z', 1],
    ]);
  });
});
