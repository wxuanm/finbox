# PAM Technical Design

## Scope

- Tool: PAM
- Path: `/pam/`
- Spec source: `docs/specs/pam/sdd.md`
- Design target: current implementation baseline

## Architecture

PAM is a standalone static ES module application. It does not import `fundmonitor` code. Authenticated PAM data uses `/api/pam/data` with D1-backed username/password login, recovery access keys, and sessions; holdings quote refresh continues to use `/api/quotes`.

```text
pam/
├─ index.html
├─ css/
│  ├─ variables.css
│  └─ main.css
└─ js/
   ├─ app.js
   ├─ config/
   │  ├─ i18n.js
   │  └─ state.js
   ├─ core/
   │  ├─ cloudSync.js
   │  └─ theme.js
   ├─ modules/
   │  ├─ accountPerformance/
   │  │  ├─ accountList.js
   │  │  ├─ snapshotForm.js
   │  │  ├─ performanceChart.js
   │  │  ├─ metricsPanel.js
   │  │  ├─ snapshotTable.js
   │  │  ├─ metrics.js
   │  │  └─ storage.js
   │  └─ holdings/
   │     ├─ holdingsMetrics.js
   │     ├─ holdingsPanel.js
   │     ├─ quoteApi.js
   │     └─ storage.js
   └─ utils/
      └─ formatter.js
```

Cloud resources are implemented in `functions/api/pam/[[path]].js` and the numbered D1 migrations under `migrations/`. Operator-side user provisioning is implemented by `scripts/create-pam-user.mjs`.

## Runtime State

`state.js` owns in-memory state:

```js
{
  accounts: [],
  snapshots: [],
  holdings: [],
  selectedAccountId: '',
  selectedPeriod: '3M',
  selectedHighlightAccountId: '',
  holdingFilters: { accountId: 'all', assetClass: 'all', market: 'all' },
  holdingSortKey: 'marketValue',
  holdingSortOrder: -1,
  holdingView: 'table',
  comparisonSortKey: 'periodReturn',
  comparisonSortOrder: -1,
  editingHoldingId: '',
  editingSnapshotId: '',
  activeView: 'analysis',
  assetDataAction: 'snapshot',
  assetDataMaintenanceOpen: false,
  amountsHidden: false,
  theme: 'light',
  currentLang: 'zh'
}
```

## Persistence

Storage keys:

```text
pam:v1:accounts
pam:v1:snapshots
pam:v1:holdings
pam:v1:preferences
```

Stored objects include `schemaVersion: 1`. Reads must tolerate missing or malformed data and return safe defaults.

`localStorage` is a local cache, first-migration source, and offline safety net. D1 is the source of truth after the browser is linked to an authenticated PAM user. `pam:v1:cloud-sync` stores synchronization metadata: cloud revision, pending domains, and the last linked user identity. `pam:v1:cache-owner` prevents one user from seeing another user's cached PAM data in the same browser profile.

The existing `pam_user_state.email` column and `userEmail` synchronization metadata are reserved for a future optional contact or notification identity. They are currently blank, do not participate in login, authorization, ownership, or cache isolation, and must not be treated as a verified email address. Authentication continues to use `pam_users.username`; any future email feature must add explicit collection and verification behavior before relying on these fields.

Cloud storage uses authentication tables `pam_users`, `pam_credentials`, and `pam_sessions`, plus normalized business tables `pam_user_state`, `pam_accounts`, `pam_snapshots`, `pam_holdings`, and `pam_preferences`. D1 stores HMAC-SHA-256 access-key hashes, per-user password salts and PBKDF2-SHA-256 password hashes, and SHA-256 session-token hashes; raw access keys, passwords, and session tokens are never stored there. Password derivation first applies the encrypted `PAM_KEY_PEPPER`, then 10,000 PBKDF2 iterations with a random 16-byte user salt. The PBKDF2 cost is bounded for the Cloudflare Pages edge CPU budget; the separately stored pepper prevents a D1-only leak from enabling offline password guesses. The server validates the `pam_session` HttpOnly cookie and derives `owner_id` as `user:<uuid>` from the session. Client-supplied user identifiers are never accepted for authorization. `/api/pam/data` supports authenticated full reads and domain-level replacement writes. Writes claim the expected revision and a unique write token in one D1 batch, preventing a stale client from modifying data.

Username/password is the default daily login. Access keys use `pam_<key-id>_<secret>` format, are shown once when an operator provisions a user, and remain the first-time password setup and recovery mechanism. After Access-key authentication, the browser requires a 12–128 character password before entering the workspace; using an Access key again allows password replacement. A successful login creates a seven-day opaque session; the raw token exists only in a `HttpOnly; SameSite=Strict; Secure` production cookie. Login, password changes, logout, and data writes require a same-origin browser request. Logout revokes the server-side session, and disabling a user or increasing `auth_version` invalidates that user's sessions.

The browser groups local writes by domain and debounces synchronization. An HTTP `409 revision_conflict` pauses synchronization and requires an explicit user decision; cloud data never silently overwrites pending local changes.

`pam:v1:preferences` stores selected account, selected period, highlighted comparison account, comparison sort, active view, account-management action state, hide-amount state, holdings view (`table`, `allocation`, or `contribution`; the retired `treemap` maps to `allocation`, and other invalid values, including the removed `bubble`, fall back to `table`), theme, and language. `currentLang` supports `zh` and `en`; missing or invalid values fall back to `zh`.

## Data Rules

Accounts:

- `id` is generated on creation.
- `name` is required and trimmed.
- `currency` is fixed to `CNY` in first release.
- `createdAt` and `updatedAt` are ISO strings.

Snapshots:

- `id` is generated on creation.
- `accountId` must reference an existing account.
- `date` is required in `YYYY-MM-DD` format.
- In account data, `totalValue` is manually entered and must be greater than 0.
- First valid performance snapshot must have `totalValue > 0`.
- `netFlow` must be numeric and can be positive, negative, or 0.
- `netFlow` remains manually maintained by the user and represents the net cash flow between snapshots.
- `totalValue` is stored independently per snapshot, so adding or correcting a past snapshot's `netFlow` does not change later snapshots by default. When saving would change the cumulative net flow up to any later same-account snapshot, the snapshot form shows an unchecked "adjust later snapshot totals" option. If checked, each later snapshot's `totalValue` shifts by its cumulative net-flow difference (counted flow on or before its date after saving minus before saving), which also covers moved dates and same-day overwrites. The account's earliest snapshot is excluded from counted flow on both sides because the unit-NAV baseline ignores its `netFlow`, so editing the earliest snapshot's flow never shifts later totals. Saving is blocked if any adjusted total would become negative. Use it only when later totals were recorded without the cash movement.
- In holdings management, users can generate account snapshots from current holdings market value for either the previous trading day or the current day. For previous-trading-day snapshots, A-shares use previous close, funds use latest disclosed unit NAV, and the snapshot date is resolved before writing snapshots from built-in ordinary-fund NAV disclosure references: `110001` 易方达平稳增长混合, `000001` 华夏成长混合, and `270002` 广发稳健增长混合A. If the built-in reference disclosure date cannot be obtained, the confirmation prompt states that the date has fallen back to the local previous trading day. For current-day snapshots, A-shares use latest price and fall back to previous close when latest price is unavailable, while funds use latest disclosed unit NAV. Generated snapshots use `source = 'holdings'`. The preview shows an editable net-flow input per account, defaulting to the same-day snapshot's `netFlow` when one exists and `0` otherwise; values typed in the preview survive recalculation when the resolved date is unchanged. Confirming may overwrite same-account same-date snapshots: `totalValue` is replaced, while the existing note is kept and `netFlow` comes from the preview input.
- Same-account same-date overwrite requires confirmation.

Holdings:

- `accountId` must reference an existing account.
- `name` is required and trimmed.
- `assetClass` is one of `stock`, `fund`, `bond`, `cash`, `other`.
- `market` is one of `CN`, `Fund`, `Cash`, `Other`.
- `quantity`, `costPrice`, and `currentPrice` must be finite numbers greater than or equal to 0.
- First quote refresh supports `CN` and `Fund`; unsupported markets remain manual.
- Cash holdings use amount mode: `quantity = 1`, `costPrice = currentPrice = cash amount`.
- Quote refresh updates current price, optional name, price source, and price update time only; cost, quantity, account binding, and notes remain user-maintained.

## Calculation Flow

`metrics.js` exports:

- `PERIODS`
- `buildAccountMetrics(accounts, snapshots, periodKey)`
- `buildAccountSeries(account, snapshots)`
- `getPeriodStartDate(latestDate, periodKey)`

Calculation steps per account:

1. Filter snapshots by account.
2. Sort by date ascending.
3. Reject account performance if fewer than two snapshots exist.
4. Initialize first snapshot with `unitNav = 1`, `shares = totalValue`, `netContribution = totalValue`.
5. For each later snapshot, convert `netFlow` to shares using previous unit NAV.
6. Reject the series if shares become zero or negative.
7. Store point-level unit NAV, return percentage, total value, net contribution, and profit/loss.
8. Filter points by active period for chart and period metrics.

Annualized volatility uses observed intervals:

```text
annualizedVolatility = stdev(periodReturns) * sqrt(365 / averageIntervalDays)
```

This avoids treating sparse manual snapshots as daily market data.

Selected-period annualized return uses the actual day span between the active period anchor and latest snapshot:

```text
annualizedReturn = (latestUnitNav / anchorUnitNav) ^ (365 / days) - 1
```

It is not displayed when the span is shorter than 30 days. Calmar ratio uses the fund-style definition:

```text
calmarRatio = annualizedReturn / abs(maxDrawdown)
```

## UI Composition

`app.js` coordinates rendering:

1. Check the server-side session and keep the application shell hidden if unauthenticated.
2. Isolate or clear the browser cache when the authenticated user changes.
3. Load ECharts only after authentication, then load state from storage.
4. Initialize theme and language.
5. Render account list and snapshot form.
6. Calculate metrics and render overview cards, chart, account comparison table, holdings views, and snapshot table.
7. Keep the snapshot table account switch synchronized with the selected account.
8. Bind global actions and initialize D1 synchronization.
9. Persist user preferences after view, period, privacy, sort, language, theme, and account-selection changes.

UI modules render into fixed DOM containers and expose bind functions through global event handlers only where simple static HTML event binding is pragmatic.

Destructive and overwrite actions use an in-app confirmation dialog rather than browser `confirm` prompts. This includes deleting accounts, snapshots, holdings, overwriting same-day snapshots, importing backup data, and adding demo data when existing records are present.

## Chart Design

The performance chart uses ECharts from CDN.

- X axis: date.
- Y axis: active-period return percentage, normalized from each account's period anchor point and rendered on the right side of the plot.
- Series: one line per valid account.
- Lines use straight segments between manually entered snapshots instead of smoothed curves, avoiding implied unobserved performance between data points. Preset ranges use `metric.periodPoints[0]`, exactly matching the metric/table anchor; custom ranges use the latest snapshot on or before the visible start. Snapshot dots are enabled only when there are at most 12 visible points and their minimum horizontal spacing is at least 16px; this prevents daily `1M` series from appearing dotted while retaining point cues for genuinely sparse manual snapshots. With fewer than two visible snapshots, the line is suppressed and only the data point plus an insufficient-data hint is shown.
- Series colors come from `--chart-series-1..6` in `pam/css/variables.css` (validated light and dark steps, no red/green hues). The color slot is the account's index in the full account list; slots past six reuse the hues with a dotted line. Normal/highlighted strokes are 2.4px/3.6px; highlight and legend hover keep the account color and dim the other lines to 28% opacity.
- The y-axis bounds always include zero; its regular split line acts as the break-even reference and its `0%` label is emphasized through rich axis-label text, avoiding a duplicate zero-value series or `markLine`. The chart also includes a subdued dashed, compounded `10%` annualized benchmark line from the active period anchor date. There is a single return axis on the right. The benchmark uses the stable internal series name `__benchmark__`, appears in the legend through the localized `benchmarkShort` formatter, and remains omitted from the tooltip.
- Legend labels show account names plus the short benchmark item; active-period account returns live in the overview cards and comparison table. Hiding the benchmark excludes it from y-axis bounds.
- Lowest, latest, and highest return point markers are shown only for single-account charts, the selected account, or the legend-hovered account in multi-account charts; if the highest or lowest return value matches the latest value, only the latest value marker is shown.
- Tooltip rows use aligned account names and right-aligned percentage values for multi-account readability. The selected account is first, remaining rows sort by return, and a row whose nearest point is not on the title date shows its own snapshot date. Coarse-pointer devices trigger the tooltip by click and keep it visible. Tooltip, axes, legend, and slider read theme CSS variables, and the app re-renders after a theme toggle so the chart follows the theme.
- Marker labels use a surface-colored text halo; the high label moves to the left of its point when it is within 64px of the latest label, and the low label moves to the right when it sits on the axis floor.
- Active account highlight dims other series to 28% opacity and shows the max drawdown for the selected account (or the only account in a single-account chart). The drawdown series follows the peak-to-trough curve and uses `areaStyle.origin: 'start'` with a vertical `--negative-color` gradient (20% to 2% alpha) toward the plot floor. Peak and trough remain unlabelled marks. A third invisible `markPoint` carries only the numeric drawdown percentage at the peak/trough time midpoint; its y coordinate interpolates the curve there and then places the label 32% of the way up from the y-axis floor. The drawdown series is always emitted (empty when there is no drawdown) so merge-mode updates clear stale fills and points. Unselected accounts do not show drawdown.
- The performance chart supports `Ctrl` + wheel / pinch zoom, drag panning, and a visible ECharts slider. Presets retain the shared metric/table anchor; custom windows rebase accounts from the latest snapshot on or before the window start, while benchmark, markers, and drawdown follow that visible window. ECharts' inside dataZoom swallows every wheel event over the plot regardless of `zoomOnMouseWheel`, so a capture-phase `wheel` listener on the chart container stops non-`Ctrl` wheel events before they reach ECharts and the page keeps scrolling.
- A user zoom stores an absolute custom window (`customZoomWindow`) that clears the active chip and shows `#chartRangeNote`; it is reapplied on every re-render until a period chip or `#chartRangeReset` clears it, or until it no longer overlaps the data.
- The chart instance is reused across renders (`setOption` with `replaceMerge: ['series']`) instead of being disposed, so unrelated re-renders do not reset zoom or flash. Series have stable ids; legend visibility is kept per account name and excluded accounts are left out of the y-axis range and drawdown.
- ECharts `aria` is enabled with a generated description of the visible window and each visible account's latest return.
- The return axis range is calculated from the current visible window and snapped to compact, evenly spaced ticks on a 1-2-5 sequence with a `0.2%` minimum step. The snapped bounds provide natural margin without an additional padding interval, and `#chartScaleHint` states when the y-axis follows a partial visible window. Narrow charts (under 520px) request fewer date ticks.
- Period chips update chart and metrics together.
- If ECharts is unavailable, show an inline warning without blocking account management.

## UI/UX Refinements

- Overview cards prioritize account readiness, total assets, profit/loss, best period performer, and data synchronization.
- Data synchronization is shown as accounts updated to the latest snapshot date over calculable accounts.
- Snapshot input includes short inline guidance for total value, net flow, and unit-NAV return logic.
- Account list items expose readiness status and selected-period return to reduce navigation ambiguity.
- Account performance is compared in a sortable table rather than per-account cards, because table rows make return, drawdown, volatility, asset value, and data freshness easier to compare across accounts.
- The header includes a lightweight hide-amount toggle. When enabled, rendered money amounts use `****`, while quantities, latest prices, percentages, chart returns, calculations, form inputs, and JSON backups remain unchanged. Money amounts render as localized numbers without a `CN`/currency prefix.
- Numeric display is formatted by value type: money amounts use localized grouping with exactly 2 decimal places; returns, drawdowns, volatility, and tooltips use 2 decimal places; portfolio weights use 2 decimal places without a leading positive sign; holding prices use fixed 4 decimal places for funds, fixed 3 decimal places for stocks, and fixed 2 decimal places for cash and other assets; chart axis percentages use 0-1 decimal places to reduce visual noise. User-entered and stored numeric values are not truncated by display formatting.
- The header includes a Chinese/English language toggle. Static HTML uses `data-i18n`, `data-i18n-title`, `data-i18n-placeholder`, and `data-i18n-aria-label`; dynamic render modules use `t()` from `pam/js/config/i18n.js`. The language preference is persisted separately from Fund Monitor and PAM does not import Fund Monitor i18n code.
- Comparison table labels use fund-style account performance terms. `区间收益`, `年化收益`, `最大回撤`, `年化波动`, and `卡玛比率` are controlled by the active period switch.
- The top module navigation includes `账户收益` and `账户管理` alongside disabled future modules, keeping performance review separate from data maintenance while combining account snapshots and holdings under one account-scoped page.
- The top navigation exposes module-specific context actions on the right. For `账户管理`, actions open snapshot and holding forms, generate snapshots, refresh quotes, and open the add-account dialog. Mobile uses a context menu and floating account-action button.
- `账户管理` uses a mobile-first single flow: account cards, current account summary, dialog-based snapshot/holding forms, holdings detail, and asset records. Account cards show name, update date, total assets, cumulative return, annualized return, and account-level actions. On web, users can drag account cards to reorder them; the persisted `accounts` array order is the display order.
- Snapshot and holding forms are bound to the selected account. To record data for a different account, the user switches account cards before opening the form.
- When the holding type is cash, the form accepts a cash balance and hides instrument-only fields such as code, market, quantity, and cost price.
- The interface favors compact decision screens: shorter copy, fewer decorative elements, four overview cards, and table-first comparisons.

## Demo Data

Demo data is generated only through user action.

- If no data exists, demo accounts are added directly.
- If data exists, user confirmation is required through an in-app dialog instead of the browser `confirm` prompt.
- Demo account names are prefixed with `示例`.
- Demo accounts include deterministic monthly snapshots covering more than one year and representative holdings for account-management views.

## Data Import And Export

PAM supports JSON backup import and export for portable recovery alongside cloud synchronization.

Export payload:

```js
{
  app: 'pam',
  schemaVersion: 1,
  exportedAt: '2026-08-05T10:00:00.000Z',
  data: {
    accounts: [],
    snapshots: [],
    holdings: [],
    preferences: {}
  }
}
```

Import behavior:

- Accept only `app: 'pam'` and `schemaVersion: 1`.
- Normalize accounts, snapshots, holdings, and preferences before applying.
- Drop snapshots whose `accountId` does not exist in the imported accounts.
- Drop holdings whose `accountId` does not exist in the imported accounts.
- Older backups without holdings import with `holdings: []`.
- Replace current local PAM data only after confirmation.
- Cache imported data locally and queue it for authenticated cloud synchronization after confirmation.

## Quote API

`/api/quotes` normalizes supported quote responses into JSON.

```text
/api/quotes?items=CN:600519,Fund:003026
```

- `CN` uses batched Sina A-share quote data first and batched Eastmoney stock quote data as fallback. Shanghai exchange-traded funds such as `510300` are treated as Shanghai `CN` instruments when they are stored as stock holdings.
- `Fund` uses Eastmoney fund comparison data and normalizes the refresh price to the latest disclosed unit NAV, not the intraday estimated NAV.
- Unsupported markets are returned in `failedItems`.
- Quote refresh updates only current price, name when available, price source, and price update time.
- The endpoint accepts up to 40 unique `market:symbol` items and returns `Cache-Control: no-store`.

## Verification

Minimum verification:

- Static file path exists at `/pam/`.
- ES modules load without syntax errors.
- Account and snapshot CRUD work locally.
- Holding CRUD, quote refresh, and snapshot generation from holdings work locally.
- JSON backup export/import round-trips accounts, snapshots, holdings, and preferences.
- Refresh persists data.
- Deposits and withdrawals do not create artificial performance jumps.
- Mobile layout remains usable.
