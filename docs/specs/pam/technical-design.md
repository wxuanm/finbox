# PAM Technical Design

## Scope

- Tool: PAM
- Path: `/pam/`
- Spec source: `docs/specs/pam/sdd.md`
- Release target: account performance and current holdings modules

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
   │  └─ state.js
   ├─ core/
   │  └─ theme.js
   ├─ modules/
   │  └─ accountPerformance/
   │     ├─ accountList.js
   │     ├─ snapshotForm.js
   │     ├─ performanceChart.js
   │     ├─ metricsPanel.js
   │     ├─ snapshotTable.js
   │     ├─ metrics.js
   │     └─ storage.js
   │  └─ holdings/
   │     ├─ holdingForm.js
   │     ├─ holdingTable.js
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
  editingHoldingId: '',
  editingSnapshotId: '',
  activeView: 'analysis',
  amountsHidden: false,
  theme: 'light'
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

## UI Composition

`app.js` coordinates rendering:

1. Load state from storage.
2. Initialize theme.
3. Render account list.
4. Render snapshot form.
5. Calculate metrics.
6. Render overview cards, chart, account comparison table, holdings views, and snapshot table.
7. Keep the snapshot table account switch synchronized with the selected account.
8. Bind global actions.

UI modules render into fixed DOM containers and expose bind functions through global event handlers only where simple static HTML event binding is pragmatic.

## Chart Design

The performance chart uses ECharts from CDN.

- X axis: date.
- Y axis: active-period return percentage, normalized from each account's period anchor point.
- Series: one line per valid account.
- Lines use straight segments between manually entered snapshots instead of smoothed curves, avoiding implied unobserved performance between data points.
- The chart includes a `0%` reference line and mirrors the return axis on the right for easier scanning.
- Legend labels include each account's active-period return.
- Active account highlight dims other series and shows a subtle drawdown area between the selected line and its prior peak; unselected accounts do not show drawdown shading.
- Period chips update chart and metrics together.
- If ECharts is unavailable, show an inline warning without blocking account management.

## UI/UX Refinements

- Overview cards prioritize account readiness, total assets, profit/loss, best period performer, and data synchronization.
- Data synchronization is shown as accounts updated to the latest snapshot date over calculable accounts.
- Snapshot input includes short inline guidance for total value, net flow, and unit-NAV return logic.
- Account list items expose readiness status and selected-period return to reduce navigation ambiguity.
- Account performance is compared in a sortable table rather than per-account cards, because table rows make return, drawdown, volatility, asset value, and data freshness easier to compare across accounts.
- The header includes a lightweight hide-amount toggle. When enabled, rendered money amounts use `****`, while quantities, prices, percentages, chart returns, calculations, form inputs, and JSON backups remain unchanged.
- Comparison table labels must distinguish period-scoped metrics from cumulative/current metrics. `区间收益`, `区间回撤`, and `区间波动` are controlled by the active period switch.
- The top module navigation includes `账户收益` and `账户管理` alongside disabled future modules, keeping performance review separate from data maintenance while combining account snapshots and holdings under one account-scoped page.
- The top navigation exposes module-specific context actions on the right. For `账户管理`, icon actions open snapshot and holding forms, generate snapshots, refresh quotes, and open the add-account dialog.
- `账户管理` uses a mobile-first single flow: account cards, current account summary, dialog-based snapshot/holding forms, holdings detail, allocation, and asset records. Account cards show name, update date, total assets, cumulative return, annualized return, and account-level actions.
- Snapshot and holding forms are bound to the selected account. To record data for a different account, the user switches account cards before opening the form.
- When the holding type is cash, the form accepts a cash balance and hides instrument-only fields such as code, market, quantity, and cost price.
- The interface favors compact decision screens: shorter copy, fewer decorative elements, four overview cards, and table-first comparisons.

## Demo Data

Demo data is generated only through user action.

- If no data exists, demo accounts are added directly.
- If data exists, user confirmation is required.
- Demo account names are prefixed with `示例`.
- Demo accounts include 19 monthly snapshots (covering more than one year) with deterministic return variation and representative holdings for account-management views.

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
- Normalize accounts and snapshots before applying.
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

- `CN` uses Eastmoney stock quote data.
- `Fund` uses Eastmoney fund comparison data.
- Unsupported markets are returned in `failedItems`.
- Quote refresh updates only current price, name when available, price source, and price update time.

## Verification

Minimum verification:

- Static file path exists at `/pam/`.
- ES modules load without syntax errors.
- Account and snapshot CRUD work locally.
- Refresh persists data.
- Deposits and withdrawals do not create artificial performance jumps.
- Mobile layout remains usable.
