# Tunet Dashboard — Setup Guide

> See also [README.md](README.md) for features and screenshots.

## Prerequisites

| Requirement | Version |
|---|---|
| Node.js | 18+ |
| npm | 9+ |
| Docker (optional) | 20+ |
| Home Assistant | Any recent version with long-lived access tokens |

## Project Structure

```
tunet/
├── src/
│   ├── App.jsx              # Main dashboard component
│   ├── main.jsx             # React entry point + error boundary
│   ├── components/          # UI cards & widgets (30+ components)
│   ├── modals/              # All dialog modals (20+ modals)
│   ├── contexts/            # React contexts (Config, HA, Pages)
│   ├── hooks/               # Custom hooks (modals, theme, energy, history)
│   ├── services/            # Home Assistant WebSocket client + actions
│   ├── i18n/                # Translations (en, nn)
│   ├── layouts/             # Header, StatusBar
│   ├── constants.js         # Timing & layout constants
│   ├── cardUtils.js         # Card visibility & removal logic
│   ├── gridLayout.js        # Grid layout algorithm
│   ├── themes.js            # Theme definitions
│   ├── icons.js             # Icon re-exports
│   ├── iconMap.js           # MDI icon mapping
│   ├── utils.js             # Shared utilities
│   └── dashboard.css        # Dashboard-specific styles
├── public/                  # Static assets & screenshots
├── index.html               # HTML entry point
├── package.json             # Dependencies & scripts
├── vite.config.js           # Vite build config
├── tailwind.config.js       # Tailwind CSS config
├── eslint.config.js         # ESLint flat config
├── Dockerfile               # Multi-stage Docker build
├── docker-compose.yml       # Docker Compose config
├── .prettierrc              # Code formatting
└── .editorconfig            # Editor settings
```

## Local Development

```bash
# Install dependencies
npm install

# Start dev server at http://localhost:5173
npm run dev

# Lint code
npm run lint

# Production build
npm run build

# Preview production build
npm run preview
```

## Docker

### Using Docker Compose (recommended)

```bash
docker-compose up -d
```

Access at `http://localhost:5173`.

### Using Docker directly

```bash
docker build -t tunet-dashboard .
docker run -d -p 5173:5173 --name tunet-dashboard tunet-dashboard
```

### Common Docker commands

```bash
docker logs tunet-dashboard      # View logs
docker stop tunet-dashboard      # Stop
docker start tunet-dashboard     # Start
docker rm tunet-dashboard        # Remove container
```

## Configuration

1. Open the dashboard in your browser
2. Go to **Settings** (gear icon)
3. Enter your Home Assistant URL (e.g. `https://homeassistant.local:8123`)
4. Enter a **long-lived access token** (create one in HA → Profile → Security)
5. Click **Test Connection** to verify

All configuration is stored in `localStorage` — no server-side database needed.

## Troubleshooting

| Problem | Solution |
|---|---|
| Port 5173 in use | Change the port in `docker-compose.yml`: `"5174:5173"` |
| Build fails | Clear cache: `docker system prune -a` then rebuild |
| Connection error | Verify HA URL and token. Check CORS settings if using external access. |
| Docker daemon not running | Start Docker Desktop and wait for status indicator |

## Environment Variables

You can add environment variables in `docker-compose.yml`:

```yaml
environment:
  - NODE_ENV=production
```

### User invitation email

Creating users from the admin interface sends a one-time activation link. The user chooses their own username and password; the administrator only enters name, email, role, client, and dashboard.

Configure either `SMTP_URL` or the individual SMTP settings:

```yaml
environment:
  - APP_PUBLIC_URL=https://dashboard.example.com
  - SMTP_HOST=smtp.example.com
  - SMTP_PORT=587
  - SMTP_SECURE=false
  - SMTP_USER=mailer@example.com
  - SMTP_PASSWORD=replace-with-a-secret
  - SMTP_FROM=Smart Sauna Systems <mailer@example.com>
  - SMTP_REPLY_TO=support@example.com
  - USER_INVITATION_TTL_HOURS=72
```

`APP_PUBLIC_URL`, `SMTP_FROM`, and either `SMTP_URL` or `SMTP_HOST` are required. If email delivery fails, the pending user is rolled back instead of leaving an account without a usable invitation. Invitation tokens are stored as SHA-256 hashes, expire automatically, and can only be used once.
