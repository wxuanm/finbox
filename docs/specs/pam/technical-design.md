# PAM Technical Design

## Scope

- Tool: PAM
- Path: `/pam/`
- Spec source: `docs/specs/pam/sdd.md`
- Design target: current implementation baseline

## Architecture

PAM is a standalone static ES module application. It does not import `fundmonitor` code. Holdings quote refresh uses a dedicated Cloudflare Pages Function at `/api/quotes`.

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

`pam:v1:preferences` stores selected account, selected period, highlighted comparison account, comparison sort, active view, account-management action state, hide-amount state, theme, and language. `currentLang` supports `zh` and `en`; missing or invalid values fall back to `zh`.

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
- In holdings management, users can generate account snapshots from current holdings market value for either the previous trading day or the current day. For previous-trading-day snapshots, A-shares use previous close, funds use latest disclosed unit NAV, and the snapshot date is resolved before writing snapshots from built-in ordinary-fund NAV disclosure references: `110001` 易方达平稳增长混合, `000001` 华夏成长混合, and `270002` 广发稳健增长混合A. If the built-in reference disclosure date cannot be obtained, the confirmation prompt states that the date has fallen back to the local previous trading day. For current-day snapshots, A-shares use latest price and fall back to previous close when latest price is unavailable, while funds use latest disclosed unit NAV. Generated snapshots use `netFlow = 0`, `source = 'holdings'`, and may overwrite same-account same-date snapshots after confirmation.
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

1. Load state from storage.
2. Initialize theme and language.
3. Render account list.
4. Render snapshot form.
5. Calculate metrics.
6. Render overview cards, chart, account comparison table, holdings views, and snapshot table.
7. Keep the snapshot table account switch synchronized with the selected account.
8. Bind global actions.
9. Persist user preferences after view, period, privacy, sort, language, theme, and account-selection changes.

UI modules render into fixed DOM containers and expose bind functions through global event handlers only where simple static HTML event binding is pragmatic.

Destructive and overwrite actions use an in-app confirmation dialog rather than browser `confirm` prompts. This includes deleting accounts, snapshots, holdings, overwriting same-day snapshots, importing backup data, and adding demo data when existing records are present.

## Chart Design

The performance chart uses ECharts from CDN.

- X axis: date.
- Y axis: active-period return percentage, normalized from each account's period anchor point.
- Series: one line per valid account.
- Lines use straight segments between manually entered snapshots instead of smoothed curves, avoiding implied unobserved performance between data points.
- The chart includes a `0%` reference line, a compounded `10%` annualized benchmark line from the active period anchor date, and mirrors the return axis on the right for easier scanning. The benchmark line is visible in the chart but omitted from the legend and tooltip to keep account comparison focused.
- Legend labels include each account's active-period return.
- Latest and highest return point markers are shown only for single-account charts, the selected account, or the legend-hovered account in multi-account charts; if the highest return point equals the latest point, only one value marker is shown.
- Tooltip rows use aligned account names and right-aligned percentage values for multi-account readability.
- Active account highlight dims other series and shows a subtle drawdown area between the selected line and its prior peak; unselected accounts do not show drawdown shading.
- Period chips update chart and metrics together.
- If ECharts is unavailable, show an inline warning without blocking account management.

## UI/UX Refinements

- Overview cards prioritize account readiness, total assets, profit/loss, best period performer, and data synchronization.
- Data synchronization is shown as accounts updated to the latest snapshot date over calculable accounts.
- Snapshot input includes short inline guidance for total value, net flow, and unit-NAV return logic.
- Account list items expose readiness status and selected-period return to reduce navigation ambiguity.
- Account performance is compared in a sortable table rather than per-account cards, because table rows make return, drawdown, volatility, asset value, and data freshness easier to compare across accounts.
- The header includes a lightweight hide-amount toggle. When enabled, rendered money amounts use `****`, while quantities, latest prices, percentages, chart returns, calculations, form inputs, and JSON backups remain unchanged. Money amounts render as localized numbers without a `CN`/currency prefix.
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

PAM supports JSON backup import and export for local-only data portability.

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
- Preserve local-only design: no upload or backend API.

## Quote API

`/api/quotes` normalizes supported quote responses into JSON.

```text
/api/quotes?items=CN:600519,Fund:003026
```

- `CN` uses Sina A-share quote data first and Eastmoney stock quote data as fallback.
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
