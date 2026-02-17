import { describe, it, expect } from 'vitest';
import { formatDuration, isToggleEntity } from '../utils';

describe('formatDuration', () => {
  it('formats seconds into m:ss', () => {
    expect(formatDuration(90)).toBe('1:30');
  });

  it('handles zero', () => {
    expect(formatDuration(0)).toBe('0:00');
  });

  it('handles non-number input', () => {
    expect(formatDuration(null)).toBe('0:00');
    expect(formatDuration(undefined)).toBe('0:00');
    expect(formatDuration('abc')).toBe('0:00');
  });

  it('handles large values', () => {
    expect(formatDuration(3661)).toBe('61:01');
  });
});

describe('isToggleEntity', () => {
  it('returns true for switch entities', () => {
    expect(isToggleEntity('switch.garden')).toBe(true);
  });

  it('returns true for automation entities', () => {
    expect(isToggleEntity('automation.morning')).toBe(true);
  });

  it('returns true for input_boolean entities', () => {
    expect(isToggleEntity('input_boolean.guest_mode')).toBe(true);
  });

  it('returns false for sensor entities', () => {
    expect(isToggleEntity('sensor.temperature')).toBe(false);
  });

  it('returns false for light entities (lights use dedicated card)', () => {
    expect(isToggleEntity('light.living_room')).toBe(false);
  });

  it('returns false for null/undefined', () => {
    expect(isToggleEntity(null)).toBe(false);
    expect(isToggleEntity(undefined)).toBe(false);
  });
});
