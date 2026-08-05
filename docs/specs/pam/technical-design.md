# PAM Technical Design

## Scope

- Tool: PAM
- Path: `/pam/`
- Spec source: `docs/specs/pam/sdd.md`
- Release target: first account performance module

## Architecture

PAM is a standalone static ES module application. It does not import `fundmonitor` code and does not require a backend API for the first release.

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
   └─ utils/
      └─ formatter.js
```

## Runtime State

`state.js` owns in-memory state:

```js
{
  accounts: [],
  snapshots: [],
  selectedAccountId: '',
  selectedPeriod: '3M',
  selectedHighlightAccountId: '',
  editingSnapshotId: '',
  activeView: 'analysis',
  theme: 'light'
}
```

## Persistence

Storage keys:

```text
pam:v1:accounts
pam:v1:snapshots
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
- `totalValue` must be numeric and greater than or equal to 0 for storage.
- First valid performance snapshot must have `totalValue > 0`.
- `netFlow` must be numeric and can be positive, negative, or 0.
- Same-account same-date overwrite requires confirmation.

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
6. Render overview cards, chart, metric cards, and snapshot table.
7. Keep the snapshot table account switch synchronized with the selected account.
7. Bind global actions.

UI modules render into fixed DOM containers and expose bind functions through global event handlers only where simple static HTML event binding is pragmatic.

## Chart Design

The performance chart uses ECharts from CDN.

- X axis: date.
- Y axis: active-period return percentage, normalized from each account's period anchor point.
- Series: one line per valid account.
- Lines use straight segments between manually entered snapshots instead of smoothed curves, avoiding implied unobserved performance between data points.
- Active account highlight dims other series.
- Period chips update chart and metrics together.
- If ECharts is unavailable, show an inline warning without blocking account management.

## UI/UX Refinements

- Overview cards prioritize account readiness, total assets, profit/loss, best period performer, and data synchronization.
- Data synchronization is shown as accounts updated to the latest snapshot date over calculable accounts.
- Snapshot input includes short inline guidance for total value, net flow, and unit-NAV return logic.
- Account list items expose readiness status and selected-period return to reduce navigation ambiguity.
- Account performance is compared in a sortable table rather than per-account cards, because table rows make return, drawdown, volatility, asset value, and data freshness easier to compare across accounts.
- The top module navigation includes `账户收益` and `账户数据` alongside disabled future modules, avoiding two separate menu rows while keeping performance review separate from account maintenance.
- The interface favors compact decision screens: shorter copy, fewer decorative elements, four overview cards, and six high-signal metrics per account card.

## Demo Data

Demo data is generated only through user action.

- If no data exists, demo accounts are added directly.
- If data exists, user confirmation is required.
- Demo account names are prefixed with `示例`.

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
    preferences: {}
  }
}
```

Import behavior:

- Accept only `app: 'pam'` and `schemaVersion: 1`.
- Normalize accounts and snapshots before applying.
- Drop snapshots whose `accountId` does not exist in the imported accounts.
- Replace current local PAM data only after confirmation.
- Preserve local-only design: no upload or backend API.

## Verification

Minimum verification:

- Static file path exists at `/pam/`.
- ES modules load without syntax errors.
- Account and snapshot CRUD work locally.
- Refresh persists data.
- Deposits and withdrawals do not create artificial performance jumps.
- Mobile layout remains usable.
