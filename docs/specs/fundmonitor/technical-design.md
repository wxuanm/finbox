# Fund Monitor Technical Design

## Scope

- Tool: Fund Monitor
- Path: `/fundmonitor/`
- Spec source: `docs/specs/fundmonitor/sdd.md`
- API paths: `/api/fundgz`, `/api/fundnav`
- API source files: `functions/api/fundgz.js`, `functions/api/fundnav.js`
- Design target: current implementation baseline

## Architecture

Fund Monitor is a standalone static ES module application backed by two Cloudflare Pages Functions for Eastmoney data proxying.

```text
fundmonitor/
├─ index.html
├─ css/
│  ├─ variables.css
│  └─ main.css
└─ js/
   ├─ app.js
   ├─ api/
   │  ├─ fundApi.js
   │  └─ fundNavApi.js
   ├─ config/
   │  ├─ i18n.js
   │  └─ state.js
   ├─ core/
   │  └─ theme.js
   ├─ ui/
   │  ├─ dashboard.js
   │  ├─ fundTable.js
   │  └─ modal.js
   └─ utils/
      ├─ formatter.js
      ├─ navMetrics.js
      └─ storage.js

functions/
└─ api/
   ├─ fundgz.js
   └─ fundnav.js
```

## Runtime State

`state.js` owns in-memory state:

```js
{
  currentTheme: localStorage.getItem('fund-monitor-theme') || 'light',
  currentLang: localStorage.getItem('fund-monitor-lang') || 'zh',
  fundCodes: new Set(),
  groups: ['default'],
  fundGroups: {},
  groupExpanded: {},
  activeGroup: 'default',
  currentSortColumn: 2,
  sortOrder: -1
}
```

`activeGroup` exists in state but is not a central navigation driver in the current table-based implementation.

## Persistence

Storage keys:

```text
fund-monitor-saved-codes
fund-monitor-groups
fund-monitor-fund-groups
fund-monitor-theme
fund-monitor-lang
fund-nav-3y:<sorted-codes>
```

Rules:

- `fund-monitor-saved-codes` stores an array of fund code strings.
- `fund-monitor-groups` stores an array of group IDs and must include `default` to be accepted on load.
- `fund-monitor-fund-groups` stores a code-to-group object.
- `fund-monitor-theme` stores `light` or `dark`.
- `fund-monitor-lang` stores `zh` or `en`.
- `fund-nav-3y:<sorted-codes>` stores same-day historical NAV response cache.
- Storage reads tolerate missing, malformed, or unavailable localStorage and return safe defaults.
- NAV cache cleanup also removes legacy `fund-nav-1y:*` keys.

## Boot Flow

`app.js` coordinates initialization on `DOMContentLoaded`:

1. Apply theme from state.
2. Apply language strings to static DOM.
3. Render empty state and initial dashboard stats.
4. Initialize modal listeners.
5. Initialize mobile pull-to-refresh listeners.
6. Load saved groups and fund-to-group mapping.
7. Create group table bodies.
8. Load saved fund codes.
9. Render saved fund rows.
10. Fetch real-time data for saved funds.
11. Update latest refresh time when saved funds exist.

## Module Responsibilities

### `app.js`

- Applies language strings and theme updates.
- Owns group create, rename, delete, and move orchestration.
- Owns fund add and refresh orchestration.
- Exposes pragmatic global handlers used by inline HTML event attributes.
- Re-renders open modals when language changes.

### `fundTable.js`

- Renders group sections, group headers, fund rows, inline action rows, empty states, and mobile detail rows.
- Handles table sorting and group collapse.
- Handles group analysis and historical trend entry points.
- Opens a single-fund historical trend modal when a desktop fund row is clicked; mobile row taps keep showing inline details.
- Updates fund row cells from Eastmoney `fundinfo` field arrays.
- Removes funds from state and storage after inline page confirmation rather than browser `confirm` prompts.

Destructive group and fund removal actions use inline confirmation rows in the table instead of browser `confirm` prompts.

### `modal.js`

- Owns modal open, close, stale-request protection, and Escape handling.
- Renders period return comparison from `fundinfo_yjpj` data.
- Renders historical NAV trend summaries, charts, and metric cards.
- Supports desktop comparison-table sorting and mobile comparison-card sorting.
- Uses `modalRequestSeq` and modal dataset fields to ignore async responses from closed or replaced modal sessions.

### `fundApi.js`

- Loads `/api/fundgz` responses through script injection.
- Reads `window.fundinfo` and updates fund rows.
- Marks rows as failed on script or parsing errors.

### `fundNavApi.js`

- Fetches `/api/fundnav` JSON.
- Normalizes code lists for cache keys.
- Stores same-day NAV response cache in `localStorage`.
- Clears current and legacy NAV cache keys when the watchlist or grouping changes.

### `navMetrics.js`

- Normalizes unit NAV and accumulated NAV points.
- Builds normalized return series.
- Calculates period returns, max drawdown, annualized volatility, Calmar ratio, and up-day ratio.
- Builds period-specific chart series for `1M`, `3M`, `6M`, `1Y`, and `3Y`.

### `dashboard.js`

- Updates monitored count.
- Counts positive and negative estimated change rows.
- Updates latest refresh display.

### `theme.js`

- Applies `data-theme` to the document root.
- Updates theme button icon and localized title.
- Persists theme preference.

### `storage.js`

- Saves fund codes, groups, and fund-to-group mapping together.
- Loads each storage domain with parse guards and safe fallbacks.

## API Proxy Design

### `/api/fundgz`

Purpose: proxy Eastmoney real-time fund comparison and period-return JavaScript endpoints.

Request examples:

```text
/api/fundgz?code=003026
/api/fundgz?code=003026,001123,017512
/api/fundgz?code=003026,001123&t=1
```

Behavior:

- Missing `code` returns HTTP 400.
- `t` defaults to `0`.
- When `t=0` and more than 10 codes are requested, codes are split into chunks of 10.
- Chunked `fundinfo` arrays are parsed and merged into one JavaScript response.
- The response content type is `application/javascript;charset=utf-8`.
- Errors return HTTP 500 with plain text.

### `/api/fundnav`

Purpose: proxy and normalize Eastmoney fund historical NAV scripts into JSON.

Request example:

```text
/api/fundnav?code=003026,001123
```

Behavior:

- Parses unique six-digit fund codes.
- Missing valid codes returns HTTP 400.
- More than 10 valid codes returns HTTP 400.
- Fetches each code concurrently with `Promise.allSettled`.
- Returns successful funds and failed code list.
- Returns HTTP 200 when at least one fund succeeds, otherwise HTTP 502.
- Adds cache headers for browser and edge caching.

Normalized response shape:

```js
{
  range: '3y',
  source: 'eastmoney',
  updatedAt: '2026-08-05T10:00:00.000Z',
  funds: [],
  failedCodes: []
}
```

## Data Rules

Groups:

- `default` is immutable and reserved.
- Custom group names are trimmed.
- Empty custom group names are ignored.
- Duplicate custom group names are rejected.
- Deleting a custom group moves all mapped funds to `default`.
- Moving groups cannot move `default` or move a custom group before `default`.

Funds:

- Input is split by English comma.
- Empty code entries are ignored.
- Adding a new code creates a loading row and fetches data.
- Adding an existing code to a different group moves the existing row and updates mapping.
- Removing a fund deletes its code and group mapping.

Historical NAV:

- Fund trend comparison is limited to 10 codes by UI and API.
- Points require a valid date and positive NAV value.
- Accumulated NAV is preferred for return calculations.
- The chart and metric calculations use the latest three-year window available from source data.

## UI Composition

Main page:

1. `index.html` provides fixed containers and inline event hooks.
2. `app.js` loads preferences and saved watchlist data.
3. `fundTable.js` creates group sections and fund rows.
4. `fundApi.js` updates rows asynchronously after `/api/fundgz` returns.
5. `dashboard.js` recalculates dashboard cards from rendered row states.

Modal flow:

1. A group action calls `showGroupAnalysis()` or `showGroupTrend()`.
2. The group row list is used to collect fund codes.
3. Empty groups and groups over 10 funds are blocked with alerts.
4. `modal.js` opens the modal, records request identity, and shows loading state.
5. Data loads through `/api/fundgz?t=1` or `/api/fundnav`.
6. Stale async responses are ignored if the modal session has changed.
7. The modal renders comparison tables/cards or NAV chart/metrics.

## Calculation Flow

Historical NAV metrics:

1. Normalize raw `items` to `{ date, value }` using accumulated NAV first, otherwise unit NAV.
2. Drop invalid or non-positive values.
3. Sort by date ascending.
4. Use the first point as normalized baseline.
5. Build normalized return series in percentage points.
6. For each period, gather points inside the lookback window or fallback to the last point before the window.
7. Calculate period return from first period point to latest point.
8. Calculate max drawdown from running peaks.
9. Calculate point-to-point returns for volatility and up-day ratio.
10. Calculate annualized volatility with `standardDeviation(returns) * sqrt(252) * 100`.
11. Calculate Calmar ratio when max drawdown is negative.

## Chart Design

The historical trend chart uses ECharts from CDN.

- X axis: date/time.
- Y axes: return percentage on left and mirrored invisible right axis.
- Series: one line per valid fund.
- Lines use straight segments rather than smoothing, matching common financial time-series chart conventions and avoiding implied interpolation between disclosed NAV points.
- Chart periods: `1M`, `3M`, `6M`, `1Y`, `3Y`.
- Selected fund metric card highlights its chart series and dims others.
- Lowest point markers are shown when available.
- Latest point marker is shown for selected fund.
- Inside data zoom is enabled, and zoom end is kept anchored at 100.

## Responsive Behavior

- Desktop uses a dense grouped table.
- Mobile hides secondary row density behind tap-to-open inline details.
- Mobile header actions collapse into a `...` menu.
- Mobile supports pull-to-refresh only at top scroll position.
- Mobile comparison uses cards and sort chips instead of relying only on wide tables.

## Verification

Minimum verification after Fund Monitor changes:

- Open `/fundmonitor/` locally through `npx wrangler pages dev .`.
- Add a valid fund code and confirm row data loads.
- Add multiple comma-separated fund codes.
- Create, rename, move, and delete a custom group.
- Confirm deleting a custom group moves funds to the default group.
- Remove a fund and refresh the page to confirm persistence.
- Toggle theme and language and refresh to confirm persistence.
- Test desktop column sorting.
- Test group return comparison for 1 to 10 funds.
- Test historical NAV trend comparison for 1 to 10 funds.
- Test mobile row detail and pull-to-refresh in responsive mode.
