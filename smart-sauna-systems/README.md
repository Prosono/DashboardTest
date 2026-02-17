# Smart Sauna Systems (Home Assistant Add-on)

This add-on serves the Smart Sauna Systems dashboard with Home Assistant ingress enabled.

## Access

After installation, open it from the Home Assistant sidebar as **Smart Sauna Systems**.

Ingress entry is configured to:

`<HA_REMOTE_ACCESS_LINK>/SmartSaunaSystems`

Home Assistant will prepend the secure ingress path automatically.

## Data

Persistent data (SQLite DB) is stored in the add-on config mount (`/config` in container).
