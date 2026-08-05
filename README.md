# FinBox

FinBox is a lightweight financial monitoring toolkit. The current release includes a responsive mutual fund monitor and PAM, a standalone portfolio and asset management tool focused first on manually tracked account performance.

## Current Tools

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

### PAM

PAM (Portfolio & Asset Manager, 投资组合与资产管理) is a standalone browser tool for manually tracking investment account performance.

Production URL:

`https://finbox.pages.dev/pam/`

Key features:

- Independent `/pam/` static tool, separate from `fundmonitor`.
- Create, rename, and delete investment accounts.
- Manually add, edit, and delete account snapshots.
- Cash-flow-adjusted account unit NAV calculation for fair account comparison.
- Multi-account performance chart with period switches: 1M, 3M, 6M, YTD, 1Y, 3Y, and ALL.
- Account metrics including latest value, net contribution, profit/loss, cumulative return, period return, max drawdown, annualized volatility, and Calmar ratio.
- Current holdings management with account binding, manual valuation, allocation summaries, and A-share/fund quote refresh.
- Optional demo data generated only by user action.
- Dark mode and local-only persistence using `pam:v1:*` `localStorage` keys.

## Data Proxies

Fund Monitor uses Cloudflare Pages Functions at:

```text
/api/fundgz
/api/fundnav
```

`/api/fundgz` forwards real-time fund comparison and period-return requests to Eastmoney's fund data endpoint.

`/api/fundnav` fetches and normalizes Eastmoney fund historical NAV scripts for the historical trend modal.

Examples:

```text
/api/fundgz?code=003026
/api/fundgz?code=003026,001123,017512
/api/fundgz?code=003026,001123&t=1
/api/fundnav?code=003026,001123
```

Notes:

- Eastmoney's `bzdm` parameter reliably supports up to 10 fund codes per request.
- For more than 10 codes, the proxy splits requests into chunks of 10 and merges the returned `fundinfo` arrays.
- `t=1` is used by the deep analysis modal and is kept as a single-code request path.
- `/api/fundnav` supports up to 10 six-digit fund codes per request and returns JSON with normalized three-year NAV points plus `failedCodes` for partial failures.

PAM uses a Cloudflare Pages Function at:

`/api/quotes`

Examples:

```text
/api/quotes?items=CN:600519
/api/quotes?items=CN:600519,Fund:003026
```

Notes:

- The first quote release supports A-share (`CN`) and fund (`Fund`) holdings.
- Unsupported markets remain manually priced in PAM.

## Project Structure

```text
finbox/
├─ functions/
│  └─ api/
│     ├─ fundgz.js              # Cloudflare Pages API proxy
│     ├─ fundnav.js             # Fund NAV trend proxy
│     └─ quotes.js              # PAM A-share/fund quote proxy
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
├─ pam/
│  ├─ index.html                # PAM page
│  ├─ css/
│  │  ├─ main.css               # PAM layout and components
│  │  └─ variables.css          # PAM theme variables
│  └─ js/
│     ├─ app.js                 # PAM bootstrap and orchestration
│     ├─ config/
│     │  └─ state.js            # Runtime state
│     ├─ core/
│     │  └─ theme.js            # Theme handling
│     ├─ modules/
│     │  ├─ accountPerformance/ # Account performance module
│     │  └─ holdings/           # Current holdings module
│     └─ utils/
│        └─ formatter.js        # Formatting helpers
├─ docs/
│  └─ specs/
│     ├─ fundmonitor/           # Fund Monitor SDD specs and implementation tasks
│     └─ pam/                   # PAM SDD specs and implementation tasks
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
/pam/
```

Why use Wrangler locally:

- Static files are served correctly.
- `/api/fundgz`, `/api/fundnav`, and `/api/quotes` are available locally through the Pages Function runtime.
- The app can test the same proxy path used in production.

## Persistence

The monitor stores user data in browser `localStorage`:

- Fund codes.
- Group list and group order.
- Fund-to-group mapping.
- Theme preference.
- Language preference.

PAM stores user data in browser `localStorage`:

- `pam:v1:accounts`.
- `pam:v1:snapshots`.
- `pam:v1:holdings`.
- `pam:v1:preferences`.

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
