# Tunet Dashboard — Copilot Instructions

## Big picture
- React 18 + Vite Home Assistant dashboard. Real‑time entity updates via `window.HAWS` WebSocket; all configuration persists to simple localStorage keys (no database).
- **Architecture**:
  - **Data/Config**: Managed in `src/contexts` (`ConfigContext`, `PageContext`, `HomeAssistantContext`).
  - **UI Orchestration**: `src/App.jsx` handles main layout, modal visibility state, and drag-and-drop.
  - **Modals**: Rendered inline in `App.jsx` (no portals), controlled by local state.

## Core data flow
1. **Init**: Read `ha_url`/`ha_token` from localStorage (via context).
2. **Connection**: `createConnection()` + `subscribeEntities()` updates global `entities` object.
3. **Usage**: Components consume config/entities via hooks. User changes persist immediately to localStorage.

## Key files & modules
- [src/App.jsx](src/App.jsx): Main layout, grid rendering, modal managers.
- [src/contexts](src/contexts): Global state managers.
- [src/services/haClient.js](src/services/haClient.js): WebSocket wrapper.
- [src/modals](src/modals): All dialogs (edit settings, device controls).
- [src/components](src/components): Dashboard cards and widgets.

## Patterns & conventions
- **Card Data**: Generic cards (e.g., `GenericClimateCard`) read entity IDs from `cardSettings[settingsKey]`.
- **Sizing**: `settings.size` is `'small'|'large'`. Toggle capability checked via `canToggleSize()`.
- **Hooks**: `useEnergyData(entity, now)` expects a single entity object.
- **Icons**: selection stored as string names; mapped via `src/iconMap.js`.
- **i18n**: keys in `src/i18n/{en,nn}.json`. Setup is manual (no i18next).
- **Styling**:
  - **Modals**: Use `.popup-surface` for boxed content (lists, groups) inside modals. Avoid manual `bg-[var(--glass-bg)]` where `.popup-surface` works.
  - **Cards**: Keep minimal. No heavy borders. 
  - **Glassmorphism**: heavily used via CSS variables (`--glass-bg`, `--glass-border`).

## LocalStorage keys (prefix `tunet_*`)
- `tunet_pages_config` (layout), `tunet_card_settings` (entity mappings), `tunet_hidden_cards`, `tunet_theme`, `tunet_language`.

## Dev workflow
- `npm run dev` (Vite, port 5173)
- `npm run build` -> `dist/`
- `docker-compose up`

## Pitfalls to avoid
- **State split**: Don't put everything in `App.jsx`. Use contexts for data/config.
- **HA Connection**: Always check `if (!conn)` or `!connected` before making calls.
- **Hooks**: Don't change hook order.
- **Modals**: Ensure they have `popup-anim` class for entry animation.
