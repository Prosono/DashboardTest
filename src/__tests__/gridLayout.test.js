import { describe, expect, it } from 'vitest';
import { buildGridLayout, getCardGridSize, MAX_CARD_ROW_SPAN } from '../utils/gridLayout';

describe('grid layout sizing', () => {
  const getKey = (id) => id;

  it('uses explicit gridColSpan and gridRowSpan from card settings', () => {
    const size = getCardGridSize('sensor.kitchen', getKey, {
      'sensor.kitchen': { gridColSpan: 4, gridRowSpan: 3 },
    }, 'home', 4);

    expect(size).toEqual({ colSpan: 4, rowSpan: 3 });
  });

  it('clamps explicit row span to the shared maximum', () => {
    const size = getCardGridSize('sensor.tall', getKey, {
      'sensor.tall': { gridColSpan: 2, gridRowSpan: MAX_CARD_ROW_SPAN + 7 },
    }, 'home', 4);

    expect(size).toEqual({ colSpan: 2, rowSpan: MAX_CARD_ROW_SPAN });
  });


  it('keeps legacy size behavior when explicit grid spans are not set', () => {
    const size = getCardGridSize('calendar_card_home', getKey, {
      'calendar_card_home': { size: 'medium' },
    }, 'home', 4);

    expect(size).toEqual({ colSpan: 2, rowSpan: 2 });
  });

  it('reserves enough rows for sauna launcher buttons on compact grids', () => {
    const size = getCardGridSize('popup_launcher_card_home', getKey, {
      'popup_launcher_card_home': {
        type: 'popup_launcher',
        columns: 4,
        buttons: [
          { targetCardId: 'sauna_card_one' },
          { targetCardId: 'sauna_card_two' },
          { targetCardId: 'sauna_card_three' },
        ],
      },
    }, 'home', 2);

    expect(size).toEqual({ colSpan: 2, rowSpan: 5 });
  });

  it('reserves enough rows for two-column sauna launcher buttons on mobile', () => {
    const size = getCardGridSize('popup_launcher_card_home', getKey, {
      'popup_launcher_card_home': {
        type: 'popup_launcher',
        columns: 2,
        buttons: [
          { targetCardId: 'sauna_card_one' },
          { targetCardId: 'sauna_card_two' },
          { targetCardId: 'sauna_card_three' },
        ],
      },
    }, 'home', 2, { isMobile: true });

    expect(size).toEqual({ colSpan: 2, rowSpan: 5 });
  });

  it('expands sauna launcher cards to four columns on desktop grids', () => {
    const size = getCardGridSize('popup_launcher_card_home', getKey, {
      'popup_launcher_card_home': {
        type: 'popup_launcher',
        gridColSpan: 2,
        columns: 2,
        buttons: [
          { targetCardId: 'sauna_card_one' },
          { targetCardId: 'sauna_card_two' },
          { targetCardId: 'sauna_card_three' },
          { targetCardId: 'sauna_card_four' },
          { targetCardId: 'sauna_card_five' },
        ],
      },
    }, 'home', 4);

    expect(size).toEqual({ colSpan: 4, rowSpan: 5 });
  });

  it('keeps sauna cards tall enough for their mobile content', () => {
    const size = getCardGridSize('sauna_card_home', getKey, {
      'sauna_card_home': { type: 'sauna' },
    }, 'home', 2, { isMobile: true });

    expect(size).toEqual({ colSpan: 2, rowSpan: 8 });
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
