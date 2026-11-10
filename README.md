# FinBox

FinBox is a lightweight financial monitoring toolkit. The current release includes a responsive mutual fund monitor and PAM, a standalone portfolio and asset management tool for manually tracked account performance and current holdings.

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
- Group period-return comparison and three-year historical NAV trend comparison.
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
- Holdings-generated account snapshots for previous trading day or current day after preview and confirmation.
- JSON backup export/import for accounts, snapshots, holdings, and preferences.
- Chinese and English UI.
- Hide-amount display mode that masks money amounts without hiding latest prices, quantities, percentages, charts, form inputs, or backup data.
- Optional demo data generated only by user action.
- Username/password login with Access-key bootstrap and recovery, D1-backed cloud persistence, and a `pam:v1:*` browser cache.
- Dark mode.

### Portfolio Backtest

Portfolio Backtest (组合回测) is a standalone browser tool for backtesting target-weight portfolios of A-shares and funds.

Production URL:

`https://finbox.pages.dev/backtest/`

Key features:

- Independent `/backtest/` static tool, separate from `fundmonitor` and `pam`.
- A-shares use back-adjusted (后复权) prices; funds use a dividend-reinvested NAV series.
- Rebalancing: none, monthly, quarterly, or yearly to target weights.
- Compare up to 3 portfolios on one shared period, against an index benchmark (沪深300, 中证500, 中证1000, 上证50, 上证指数, 创业板指).
- Metrics: final value, total return, CAGR, max drawdown, volatility, Sharpe, Calmar, best and worst year.
- Cumulative return, drawdown, and annual return charts, plus returns-by-year and per-asset weight tables.
- Notices when an asset starts later than the requested start date.
- Chinese and English UI, dark mode, and a phone layout.
- Portfolios and parameters persisted in `localStorage`.

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

PAM uses Cloudflare Pages Functions at:

```text
/api/pam/auth/login
/api/pam/auth/password
/api/pam/auth/logout
/api/pam/auth/session
/api/pam/data
/api/quotes
```

Examples:

```text
/api/quotes?items=CN:600519
/api/quotes?items=CN:600519,Fund:003026
```

Notes:

- The first quote release supports A-share (`CN`) and fund (`Fund`) holdings.
- Unsupported markets remain manually priced in PAM.
- `/api/quotes` accepts up to 40 unique `market:symbol` items and returns `failedItems` for unsupported or failed quotes.

Portfolio Backtest uses:

```text
/api/history?items=CN:600519,Fund:110011,Index:000300&start=2020-01-01
```

Notes:

- Accepts up to 25 unique items. `CN` and `Fund` take 6-digit codes; `Index` takes an allowlisted index code.
- `CN` returns back-adjusted daily closes; `Index` returns unadjusted closes; `Fund` returns a series chained from Eastmoney's daily growth rate, so dividends and unit splits are handled.
- `start` defaults to 10 years ago. Partial failures are returned in `failedItems`.

## Project Structure

```text
finbox/
├─ functions/
│  └─ api/
│     ├─ _lib/                  # Shared modules (not routed)
│     ├─ fundgz.js              # Cloudflare Pages API proxy
│     ├─ fundnav.js             # Fund NAV trend proxy
│     ├─ history.js             # Backtest daily price history
│     └─ quotes.js              # PAM A-share/fund quote proxy
├─ backtest/
│  ├─ index.html                # Portfolio Backtest page
│  ├─ css/                      # Theme variables and layout
│  └─ js/
│     ├─ app.js                 # Bootstrap and run orchestration
│     ├─ api/historyApi.js      # /api/history client
│     ├─ config/                # i18n and runtime state
│     ├─ engine/                # Pure backtest engine and metrics
│     ├─ ui/                    # Portfolio editor and results
│     └─ utils/                 # Formatting and storage helpers
├─ fundmonitor/
│  ├─ index.html                # Fund Monitor page
│  ├─ css/
│  │  ├─ main.css               # Layout, responsive UI, component styles
│  │  └─ variables.css          # Theme variables
│  └─ js/
│     ├─ app.js                 # App bootstrap, language, groups, refresh
│     ├─ api/
│     │  ├─ fundApi.js          # Fund data script loading and row updates
│     │  └─ fundNavApi.js       # Historical NAV fetch and cache
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
│        ├─ navMetrics.js       # Historical NAV metric calculations
│        └─ storage.js          # localStorage persistence
├─ pam/
│  ├─ index.html                # PAM page
│  ├─ css/
│  │  ├─ main.css               # PAM layout and components
│  │  └─ variables.css          # PAM theme variables
│  └─ js/
│     ├─ app.js                 # PAM bootstrap and orchestration
│     ├─ config/
│     │  ├─ i18n.js             # Chinese/English strings
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
│     ├─ backtest/              # Portfolio Backtest SDD specs and implementation tasks
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
/backtest/
```

Why use Wrangler locally:

- Static files are served correctly.
- `/api/fundgz`, `/api/fundnav`, `/api/history`, and `/api/quotes` are available locally through the Pages Function runtime.
- The app can test the same proxy path used in production.

## Persistence

The monitor stores user data in browser `localStorage`:

- Fund codes.
- Group list and group order.
- Fund-to-group mapping.
- Theme preference.
- Language preference.
- Same-day NAV trend response cache for historical comparison.

PAM stores authenticated business data in Cloudflare D1 and keeps these browser `localStorage` cache entries:

- `pam:v1:accounts`.
- `pam:v1:snapshots`.
- `pam:v1:holdings`.
- `pam:v1:preferences`.

PAM preferences include selected account, selected period, highlighted comparison account, comparison sort, active view, account-management action state, hide-amount state, theme, and language.

Each PAM user is isolated by a server-derived owner ID. Daily sign-in uses a username and password. Passwords are protected with a per-user salt, PBKDF2-SHA-256, and the server-side pepper; D1 stores no raw password. Operator-issued access keys remain available for first-time password setup and account recovery, while raw session tokens remain in HttpOnly cookies.

Portfolio Backtest stores its portfolios and parameters in `backtest:v1:config` and its theme and language in `backtest:v1:preferences`. Price history is kept in memory only.

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
