# Tunet Dashboard

A modern React dashboard for home automation and energy monitoring with Home Assistant integration.


## Features

### Dashboard Controls
- Climate & heating control
- Energy consumption tracking with real-time pricing
- Vehicle status monitoring (generic car cards with entity mapping)
- Lighting control with color/warmth adjustment
- Door sensors & presence detection
- Vacuum cleaner control
- Media player control (Sonos, Jellyfin, Emby, NRK, Android TV)
- Presence & person status
- Calendar integration
- Customizable dashboard layout & header
- Dark/Light/Graphite theme
- Multi-language (English, Nynorsk)
- MDI icon support (same naming as Home Assistant, e.g. `mdi:car-battery`)

### Card Types
You can add various card types to customize your dashboard:
- **Sensor** - Display any numeric or text sensor with history
- **Light** - Control lights with brightness, color, and warmth
- **Climate** - Manage heat pump or AC with temperature targeting
- **Vacuum** - Control robot vacuum with suction and mop settings
- **Media Player** - Play/pause music, control volume on any media player
- **Sonos** - Dedicated Sonos player management with grouping
- **Weather** - Display weather with 12h forecast and temperature graph
- **Cost/Energy** - Track daily and monthly power costs
- **Nordpool** - Monitor spot prices (requires Nordpool sensor)
- **Calendar** - Show upcoming calendar events
- **Automation** - Toggle automations and scripts
- **Android TV** - Media control for Android TV devices
- **Toggle** - Quick switch for lights, automations, scripts

## Main Dashboard

![Main Dashboard](public/1.Main.jpg)

## Quick Start

### Prerequisites

- Node.js 18+
- Home Assistant instance with API token

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/oyvhov/tunet.git
   cd tunet
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start development server**
   ```bash
   npm run dev
   ```

4. **Open dashboard**
   - Access at `http://localhost:5173`
   - Go to Settings and add your Home Assistant URL and token

5. **Configure entities** (optional)
   - Use edit mode in the dashboard to add cards dynamically
   - Car cards use entity mapping via the UI configuration

### Docker Installation

Alternatively, run with Docker:

1. **Clone the repository** (if not already done)
   ```bash
   git clone https://github.com/oyvhov/tunet.git
   cd tunet
   ```

2. **Build and run with Docker Compose**
   ```bash
   docker-compose up
   ```

3. **Access dashboard**
   - Open `http://localhost:5173`
   - Go to Settings and add your Home Assistant URL and token

### Home Assistant Add-on

This repository includes a Home Assistant add-on package in `smart-sauna-systems/`.

1. Go to **Settings → Add-ons → Add-on Store → Repositories**
2. Add this repository URL
3. Install **Smart Sauna Systems**
4. Start the add-on and open it from the sidebar

Ingress entry is configured as `/SmartSaunaSystems`, so the app is opened through your Home Assistant ingress URL path.

## Configuration

1. Open dashboard settings
2. Add Home Assistant URL and token
3. Customize layout in edit mode

### Shared dashboard storage (all users see the same layout)

By default, the dashboard keeps a local cache for offline resilience. To make the dashboard layout shared across users, configure a persistent backend endpoint:

- Set `VITE_DASHBOARD_STORAGE_URL` (for example `/api/dashboard-config` or `https://your-api.example.com/dashboard-config`).
- The app sends `GET /api/dashboard-config` on startup to load the default shared dashboard.
- In **Settings → Global dashboards**, you can:
  - press **Save globally** to store the current dashboard,
  - press **Load dashboard** to load a selected saved dashboard.
- For named dashboards, the app uses:
  - `GET /api/dashboard-config/profiles` (list available dashboards)
  - `GET /api/dashboard-config/profiles/:id` (load one)
  - `PUT /api/dashboard-config/profiles/:id` (save one)
- If profile endpoints are unavailable, named dashboards are stored inside the default shared dashboard payload and remain available across browsers/users that use the same backend storage.
- The JSON payload shape is:

```json
{
  "version": 1,
  "updatedAt": "2026-01-01T12:00:00.000Z",
  "data": {
    "pagesConfig": {},
    "cardSettings": {},
    "customNames": {},
    "customIcons": {},
    "hiddenCards": [],
    "pageSettings": {},
    "gridColumns": 4,
    "gridGapH": 20,
    "gridGapV": 20,
    "cardBorderRadius": 16,
    "headerScale": 1,
    "sectionSpacing": { "headerToStatus": 16, "statusToNav": 24, "navToGrid": 24 },
    "headerTitle": "",
    "headerSettings": { "showTitle": true, "showClock": true, "showDate": true },
    "statusPillsConfig": []
  }
}
```

If the backend is unavailable, the app falls back to cached/local data until connectivity returns.

## Build & Deploy

```bash
npm run build
```

Docker:

```bash
docker-compose up
```

## Light Control

![Light Control](public/7.Popup_lights.jpg)

## Technologies

- React 18
- Vite 7
- Tailwind CSS
- Lucide Icons + MDI
- Home Assistant API

## Project Structure

```
src/
 App.jsx              # Main component
 components/          # UI cards & widgets
 modals/              # Dialog modals
 contexts/            # React contexts (Config, HA, Pages)
 hooks/               # Custom hooks
 services/            # HA WebSocket client
 i18n/                # Translations (en, nn)
 layouts/             # Header, StatusBar
```

See [SETUP.md](SETUP.md) for the full project structure and detailed setup instructions.

## License

GNU General Public License v3.0 - See [LICENSE](LICENSE) for details

## Author

[oyvhov](https://github.com/oyvhov)
