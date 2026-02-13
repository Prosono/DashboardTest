import { describe, expect, it } from 'vitest';
import { buildGridLayout, getCardGridSize } from '../utils/gridLayout';

describe('grid layout sizing', () => {
  const getKey = (id) => id;

  it('uses explicit gridColSpan and gridRowSpan from card settings', () => {
    const size = getCardGridSize('sensor.kitchen', getKey, {
      'sensor.kitchen': { gridColSpan: 4, gridRowSpan: 3 },
    }, 'home', 4);

    expect(size).toEqual({ colSpan: 4, rowSpan: 3 });
  });

  it('places mixed card sizes without overlap', () => {
    const sizeFn = (id) => {
      if (id === 'a') return { colSpan: 4, rowSpan: 4 };
      if (id === 'b') return { colSpan: 1, rowSpan: 4 };
      return { colSpan: 2, rowSpan: 1 };
    };

    const layout = buildGridLayout(['a', 'b', 'c'], 4, sizeFn);

    expect(layout.a).toEqual({ row: 1, col: 1, colSpan: 4, rowSpan: 4 });
    expect(layout.b.row).toBeGreaterThanOrEqual(5);
    expect(layout.b.col).toBe(1);
    expect(layout.c.col).toBeGreaterThanOrEqual(2);
  });
});
