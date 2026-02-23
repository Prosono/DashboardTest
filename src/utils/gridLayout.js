/**
 * Grid layout algorithm – computes card positions & spans for the dashboard grid.
 * Pure functions with zero React / UI dependencies.
 */

/**
 * Determine how many grid columns a card should span.
 *
 * @param {string} cardId
 * @param {Function} getCardSettingsKey  (cardId) => settingsKey
 * @param {Object}  cardSettings         Full card-settings map
 * @param {string}  activePage           Current active page id
 * @returns {number} 1 | 2 | 4
 */
// Size-to-span mappings per card type category
const SPAN_TABLE = {
  // { small, medium, large } → column count
  triSize:  { small: 1, medium: 2, default: 4 },   // calendar, todo
  dualSize: { small: 1, default: 2 },               // light, car, room
  single:   { default: 1 },
};

const CARD_SPAN_RULES = [
  // prefix match → category  (checked in order)
  { prefix: 'calendar_card_', category: 'triSize' },
  { prefix: 'calendar_booking_card_', category: 'triSize' },
  { prefix: 'todo_card_',     category: 'triSize' },
  { prefix: 'light_',         category: 'dualSize' },
  { prefix: 'light.',         category: 'dualSize' },
  { prefix: 'car_card_',      category: 'dualSize' },
  { prefix: 'room_card_',     category: 'dualSize' },
  { prefix: 'fan_card_',      category: 'dualSize' },
  { prefix: 'door_card_',     category: 'dualSize' },
  { prefix: 'motion_card_',   category: 'dualSize' },
  { prefix: 'lock_card_',     category: 'dualSize' },
  { prefix: 'switch_card_',   category: 'dualSize' },
  { prefix: 'number_card_',   category: 'dualSize' },
  { prefix: 'camera_card_',   category: 'dualSize' },
  { prefix: 'alarm_card_',    category: 'dualSize' },
  { prefix: 'timer_card_',    category: 'dualSize' },
  { prefix: 'select_card_',   category: 'dualSize' },
  { prefix: 'button_card_',   category: 'dualSize' },
  { prefix: 'script_card_',   category: 'dualSize' },
  { prefix: 'divider_card_',  category: 'triSize' },
  { prefix: 'empty_card_',    category: 'single' },
];

export const getCardGridSpan = (cardId, getCardSettingsKey, cardSettings, activePage) => {
  // Automations have their own logic based on type sub-setting
  if (cardId.startsWith('automation.')) {
    const settings = cardSettings[getCardSettingsKey(cardId)] || cardSettings[cardId] || {};
    if (['sensor', 'entity', 'toggle'].includes(settings.type)) {
      return settings.size === 'small' ? 1 : 2;
    }
    return 1;
  }

  // Exact-match for legacy 'car' id
  if (cardId === 'car') {
    const sizeSetting = cardSettings[getCardSettingsKey(cardId)]?.size || cardSettings[cardId]?.size;
    return sizeSetting === 'small' ? 1 : 2;
  }

  // Table-driven lookup for prefix-matched card types
  for (const rule of CARD_SPAN_RULES) {
    if (cardId.startsWith(rule.prefix)) {
      const sizeSetting = cardSettings[getCardSettingsKey(cardId)]?.size || cardSettings[cardId]?.size;
      const mapping = SPAN_TABLE[rule.category];
      return mapping[sizeSetting] ?? mapping.default;
    }
  }

  // Default behaviour for all other cards
  const sizeSetting = cardSettings[getCardSettingsKey(cardId)]?.size || cardSettings[cardId]?.size;
  if (sizeSetting === 'small') return 1;
  if (cardId.startsWith('weather_temp_')) return 2;
  if (activePage === 'settings' && cardId !== 'car' && !cardId.startsWith('media_player')) return 1;

  return 2;
};

const clampSpan = (value, fallback, max = 8) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(max, Math.round(parsed)));
};

export const getCardGridSize = (cardId, getCardSettingsKey, cardSettings, activePage, columns = 4) => {
  const settings = cardSettings[getCardSettingsKey(cardId)] || cardSettings[cardId] || {};
  const legacySpan = getCardGridSpan(cardId, getCardSettingsKey, cardSettings, activePage);

  const colSpan = clampSpan(settings.gridColSpan, legacySpan, Math.max(1, columns));
  const rowSpan = clampSpan(settings.gridRowSpan, legacySpan);

  return { colSpan, rowSpan };
};

/**
 * Build a position map for a list of card ids.
 *
 * @param {string[]}  ids       Ordered card ids
 * @param {number}    columns   Number of grid columns
 * @param {Function}  sizeFn    (cardId) => { colSpan, rowSpan }
 * @returns {Object}  { [cardId]: { row, col, colSpan, rowSpan } }
 */
export const buildGridLayout = (ids, columns, sizeFn) => {
  if (!columns || columns < 1) return {};
  const occupancy = [];
  const positions = {};

  const ensureRow = (row) => {
    if (!occupancy[row]) occupancy[row] = Array(columns).fill(false);
  };

  const canPlace = (row, col, colSpan, rowSpan) => {
    if (col + colSpan > columns) return false;
    for (let r = row; r < row + rowSpan; r += 1) {
      ensureRow(r);
      for (let c = col; c < col + colSpan; c += 1) {
        if (occupancy[r][c]) return false;
      }
    }
    return true;
  };

  const place = (row, col, colSpan, rowSpan) => {
    for (let r = row; r < row + rowSpan; r += 1) {
      ensureRow(r);
      for (let c = col; c < col + colSpan; c += 1) {
        occupancy[r][c] = true;
      }
    }
  };

  const placeSingle = (id, colSpan, rowSpan) => {
    let placed = false;
    let row = 0;
    while (!placed) {
      ensureRow(row);
      for (let col = 0; col < columns; col += 1) {
        if (canPlace(row, col, colSpan, rowSpan)) {
          place(row, col, colSpan, rowSpan);
          positions[id] = { row: row + 1, col: col + 1, colSpan, rowSpan };
          placed = true;
          break;
        }
      }
      if (!placed) row += 1;
    }
  };

  for (let i = 0; i < ids.length; i += 1) {
    const id = ids[i];
    const size = sizeFn(id) || { colSpan: 1, rowSpan: 1 };
    const colSpan = Math.max(1, Math.min(columns, Number(size.colSpan) || 1));
    const rowSpan = Math.max(1, Number(size.rowSpan) || 1);
    placeSingle(id, colSpan, rowSpan);
  }

  return positions;
};
