# FinBox

FinBox is a lightweight financial monitoring toolkit. The current release focuses on a responsive mutual fund monitor with real-time market data, custom grouping, mobile-friendly interactions, and a Cloudflare Pages API proxy.

## Current Tool

### Fund Monitor

Fund Monitor is a browser-based dashboard for tracking mutual funds.

Production URL:

`https://finbox.pages.dev/fundmonitor/`

Key features:

- Real-time fund data including estimated NAV, estimated change, latest NAV, accumulated NAV, NAV change, previous NAV, and fund manager.
- Custom fund groups with local persistence.
- Group actions from a compact `...` menu: add funds, rename group, move group up/down, and delete group.
- Deleting a custom group moves its funds back to the default group instead of removing them from monitoring.
- Default group is kept as a system fallback and is hidden when it is empty and custom groups exist.
- Empty states for the whole monitor and for empty custom groups.
- Sortable desktop table.
- Mobile-optimized compact rows with inline full fund details on tap.
- Mobile pull-to-refresh.
- Light and dark themes.
- Chinese and English UI.
- Data and preferences persisted in `localStorage`.

## Data Proxy

The app uses a Cloudflare Pages Function at:

`/api/fundgz`

The proxy forwards requests to Eastmoney's fund data endpoint.

Examples:

```text
/api/fundgz?code=003026
/api/fundgz?code=003026,001123,017512
```

Notes:

- Eastmoney's `bzdm` parameter reliably supports up to 10 fund codes per request.
- For more than 10 codes, the proxy splits requests into chunks of 10 and merges the returned `fundinfo` arrays.
- `t=1` is used by the deep analysis modal and is kept as a single-code request path.

## Project Structure

```text
finbox/
├─ functions/
│  └─ api/
│     └─ fundgz.js              # Cloudflare Pages API proxy
├─ fundmonitor/
│  ├─ index.html                # Fund Monitor page
│  ├─ css/
│  │  ├─ main.css               # Layout, responsive UI, component styles
│  │  └─ variables.css          # Theme variables
│  └─ js/
│     ├─ app.js                 # App bootstrap, language, groups, refresh
│     ├─ api/
│     │  └─ fundApi.js          # Fund data script loading and row updates
│     ├─ config/
│     │  ├─ i18n.js             # Chinese/English strings
│     │  └─ state.js            # Runtime state
│     ├─ core/
│     │  └─ theme.js            # Theme handling
│     ├─ ui/
│     │  ├─ dashboard.js        # Dashboard statistics
│     │  ├─ fundTable.js        # Fund rows, groups, inline actions
│     │  └─ modal.js            # Deep analysis modal
│     └─ utils/
│        ├─ formatter.js        # Formatting helpers
│        └─ storage.js          # localStorage persistence
└─ README.md
```

## Local Development

This is a static ES module application with a Cloudflare Pages Function.

Recommended local run command:

```bash
npx wrangler pages dev .
```

Then open the local URL printed by Wrangler and navigate to:

```text
/fundmonitor/
```

Why use Wrangler locally:

- Static files are served correctly.
- `/api/fundgz` is available locally through the Pages Function runtime.
- The app can test the same proxy path used in production.

## Persistence

The monitor stores user data in browser `localStorage`:

- Fund codes.
- Group list and group order.
- Fund-to-group mapping.
- Theme preference.
- Language preference.

No backend database is required.

## Browser Support

The UI is designed for modern browsers with ES module support. Mobile behavior is optimized for touch devices and includes compact group menus, compact fund rows, inline details, and pull-to-refresh.

## Roadmap

Potential future tools:

- Stock market tracking panels.
- Asset allocation and rebalancing calculators.
- Macro-economic indicators dashboard.

Potential Fund Monitor improvements:

- Import/export fund lists.
- Optional cloud sync.
- More detailed error states for unavailable fund codes.
- Configurable dashboard cards.

## License

MIT
