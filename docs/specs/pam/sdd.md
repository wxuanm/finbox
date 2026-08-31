# PAM Spec-Driven Development

## Document Scope

- Spec namespace: `pam`
- Spec path: `docs/specs/pam/sdd.md`
- Related tool path: `/pam/`
- Status: Current implementation baseline

This document belongs only to PAM. Other FinBox tools should use their own folders under `docs/specs/<tool-name>/` to avoid naming, storage, and acceptance-criteria conflicts.

## 1. Requirements Spec

### Product Identity

- Tool name: PAM
- Full English name: Portfolio & Asset Manager
- Chinese name: 投资组合与资产管理
- Path: `/pam/`
- Current modules: 账户收益, 账户管理

### Product Goal

PAM helps users manually track multiple investment accounts, calculate account-level performance after excluding cash flow impact, compare return trends and risk metrics, and manage current holdings under each account.

The current implementation covers account performance and account-scoped data maintenance. Account maintenance combines manual snapshots, current holdings, quote refresh, snapshot generation from holdings, local JSON backup/import, demo data, language/theme preferences, and a lightweight hide-amount display mode.

### Confirmed Decisions

- The first release supports Chinese and English UI switching, following the Fund Monitor pattern of a local dictionary plus persisted language preference.
- Deleting an account requires confirmation and removes all snapshots for that account.
- A demo data button is allowed, but no demo data is shown by default.
- PAM is an independent static tool and must not be mixed into `fundmonitor`.
- PAM may reference good product and implementation patterns from `fundmonitor`, but it must not share runtime state, localStorage keys, or business modules with it.
- PAM specs, design notes, and implementation tasks live under `docs/specs/pam/`.
- 账户管理 combines account snapshots and current holdings in one account-scoped maintenance page.
- Current holdings track current positions only in the first release, and holdings must be bound to accounts.
- A-share and fund quote refresh are the first supported real-time quote targets for holdings.
- Cash is a supported holding type and is manually maintained as CNY-equivalent amount; no currency conversion is performed.
- PAM provides a lightweight hide-amount toggle for personal privacy. It masks displayed money amounts only and does not hide quantities, latest prices, percentages, calculations, form inputs, imports, or backup data.
- Money amounts are displayed as localized numbers without a currency prefix. Stored account and holding records still keep `currency: "CNY"` for schema clarity.
- PAM provides a Chinese/English language toggle in the header. The selected language is saved in `pam:v1:preferences.currentLang`; supported values are `zh` and `en`, with Chinese as the safe fallback.

### In Scope For First Release

- Create the independent `/pam/` static tool.
- Create, rename, and delete investment accounts.
- Manually add account snapshots.
- Edit and delete historical snapshots.
- Update an existing snapshot when the same account already has a snapshot on the same date.
- Calculate account unit NAV and performance using cash-flow-adjusted logic.
- Compare multiple accounts in one performance chart.
- Support chart periods: `1M`, `3M`, `6M`, `YTD`, `1Y`, `3Y`, `ALL`.
- The default account return period is `3M`; saved user preference takes precedence.
- Show account metrics: latest value, net contribution, cumulative profit/loss, cumulative return, selected-period return, selected-period annualized return, max drawdown, annualized volatility, Calmar ratio, and latest date.
- In the account comparison table, fund-style account performance columns include `区间收益`, `年化收益`, `最大回撤`, `年化波动`, and `卡玛比率`, all controlled by the active period switch.
- Persist all user data in browser `localStorage`.
- Support dark mode.
- Provide empty, insufficient-data, and invalid-data states.
- Support desktop and mobile layouts.
- Manage current holdings bound to accounts.
- Refresh supported A-share and fund prices through `/api/quotes`.
- Generate previous-trading-day or current-day account snapshots from current holdings after preview and confirmation.
- Export and import all PAM local data as JSON backup files.
- Hide displayed money amounts through a global header toggle.

### Out Of Scope For First Release

- Brokerage or platform integrations.
- CSV or Excel import/export.
- Cloud sync.
- Login or user accounts.
- Historical holdings and transaction-level position history.
- Transaction ledger.
- Multi-currency conversion.
- Brokerage APIs or cloud sync APIs.
- Reusing `fundmonitor` groups, state, storage, or UI modules.
- Sharing Fund Monitor i18n runtime code or localStorage keys.

### Core User Stories

- As a user with multiple investment accounts, I want to create account records so that I can track them separately.
- As a user, I want to record a date, total account value, net cash flow, and optional note so that PAM can calculate account performance.
- As a user, I want account data to support fully manual account snapshots, while holdings management can generate snapshots from current holdings market value with net cash flow defaulting to 0.
- As a user, I want cash deposits and withdrawals excluded from return calculations so that account comparisons are fair.
- As a user, I want to compare multiple account return curves in one chart so that I can see which account performs better.
- As a user, I want to inspect return, drawdown, and volatility metrics so that I can compare both performance and risk.
- As a user, I want my data stored locally so that no sensitive account data is uploaded.
- As a user, I want demo data available on demand so that I can understand the tool before entering real data.

## 2. Product Spec

### Information Architecture

First release:

```text
PAM
├─ 账户收益
└─ 账户管理
```

Future modules:

```text
PAM
├─ 总览
├─ 账户收益
├─ 资产配置
├─ 交易记录
├─ 收益归因
└─ 风险分析
```

### Page Structure

```text
/pam/
├─ Header: product name, description, demo/import/export, amount privacy, language toggle, theme toggle
├─ Unified module navigation: 账户收益 / 账户管理 / future modules
├─ 账户收益: overview cards, performance chart, sortable account comparison table
└─ 账户管理: account cards, context action menu, snapshot/holding/generate dialogs, holdings table, asset records, add-account dialog
```

UI direction:

- Keep the default experience decision-first: account return overview, chart, and sortable comparison table.
- Keep account snapshots and current holdings together under `账户管理`, organized by the selected account rather than by separate modules.
- Show module-specific actions on the right side of the top navigation; when `账户管理` is active, show icon actions for snapshot entry, holding entry, snapshot generation, quote refresh, and add-account.
- Mobile header and account-management actions collapse into menus or floating actions to keep the workspace usable on small screens.
- Use short operational copy. Explanations should be one-line hints unless they prevent financial misunderstanding.
- Use a sortable comparison table instead of per-account metric cards for cross-account performance review.
- Keep holdings focused on current positions, valuation, unrealized profit/loss, and portfolio weight.
- Keep the `账户管理` layout mobile-first: account cards first, current account summary, dialog-based snapshot/holding forms, holdings detail, and asset records. On web, account cards support drag reordering and persist the user-defined order.

### Account Data Model

```js
{
  id: "account-001",
  name: "招商证券",
  currency: "CNY",
  createdAt: "2026-08-05T10:00:00.000Z",
  updatedAt: "2026-08-05T10:00:00.000Z"
}
```

### Snapshot Data Model

```js
{
  id: "snapshot-001",
  accountId: "account-001",
  date: "2026-08-05",
  totalValue: 120000,
  netFlow: 5000,
  note: "追加资金"
}
```

### Field Definitions

| Field | Meaning | Rule |
| --- | --- | --- |
| Date | Snapshot date | Required |
| Total value | Manual account total value in account data; generated from holdings only through holdings management action for the previous trading day or current day. Previous-trading-day snapshots use A-share previous close and fund latest disclosed unit NAV; current-day snapshots use A-share latest price and fund latest disclosed unit NAV. | Required, must be greater than 0 for new snapshots |
| Net flow | Net deposit or withdrawal between snapshots | Required, deposit is positive, withdrawal is negative, no cash flow is 0 |
| Note | Optional user note | Optional |

### Default Copy

Main title:

```text
PAM 投资组合与资产管理
```

Subtitle:

```text
从账户资产快照开始，追踪多个投资账户的收益曲线、回撤和风险指标。
```

Input help:

```text
总资产填账户总额；净流入填本次与上次之间的投入/取出。账户管理可用当前持仓市值生成上个交易日或当日快照。
```

Empty state:

```text
还没有投资账户。创建一个账户，并录入两条以上资产快照后，即可生成账户收益曲线。
```

### Demo Data

- Demo data is not displayed by default.
- A user-triggered demo data button may create sample accounts, more than one year of monthly snapshots with varied returns, and sample holdings.
- Demo data must be clearly labeled.
- If real user data already exists, demo data may only be added after confirmation.
- Demo data should be added as separate demo accounts rather than merged into real accounts.

### Data Portability

- Users can export all PAM local data as a JSON backup file.
- Users can import a PAM JSON backup file into the current browser.
- Import replaces current PAM accounts, snapshots, holdings, and preferences only after user confirmation.
- Import validates schema version, account records, snapshot records, and account references before applying data.
- Import normalizes holdings and drops holdings whose account references are not present in the imported account list.
- CSV import/export is out of scope for the first backup feature and can be added later for batch snapshot entry.
- Holdings are included in PAM JSON backups. Older backups without holdings are imported with an empty holdings list.
- The hide-amount preference is included in preferences, but exported account, snapshot, and holding data remains unchanged.

### Holdings

See `docs/specs/pam/holdings.md` for detailed holdings requirements, data model, quote scope, and acceptance criteria.

## 3. Calculation Spec

### Default Performance Method

PAM uses an account unit NAV method for the first release. The purpose is to exclude deposits and withdrawals from return calculations and make account performance comparable.

### Unit NAV Rules

- Sort snapshots by date ascending before calculation.
- The first valid snapshot initializes `unitNav = 1` and establishes the initial capital baseline.
- Account shares represent capital units.
- `netFlow` is treated as cash flow that occurred during the period ending on the snapshot date and is converted using the previous snapshot's unit NAV.
- Deposits increase shares and do not directly increase return.
- Withdrawals decrease shares and do not directly decrease return.
- Return series uses `unitNav / initialUnitNav - 1`.
- At least two valid snapshots are required for a visible performance curve.
- A first snapshot with `totalValue <= 0` is invalid for performance calculation.
- Any calculation step that creates zero or negative shares is invalid for that account.

### Suggested Formula

Initial snapshot:

```text
unitNav = 1
shares = totalValue / unitNav
netContribution = totalValue
```

Next snapshots:

```text
flowShares = netFlow / previousUnitNav
shares = previousShares + flowShares
unitNav = totalValue / shares
return = unitNav / initialUnitNav - 1
netContribution = previousNetContribution + netFlow
```

This formula is intentionally approximate for manual snapshot tracking. It is designed for clear user input and fair account comparison, not for precise intraday cash-flow attribution.

### Metrics

- Latest value: latest snapshot total value.
- Net contribution: first snapshot total value plus all later net flows.
- Cumulative profit/loss: latest value minus net contribution.
- Cumulative return: latest unit NAV relative to initial unit NAV.
- Selected-period return: latest unit NAV divided by the first available unit NAV at or before the selected period start, minus 1. If no anchor point exists before the period start, use the first point inside the selected period.
- Selected-period annualized return: selected-period return annualized by the actual number of days between the period anchor and latest snapshot. Do not display it when the span is shorter than 30 days.
- Max drawdown: largest decline from a unit NAV peak.
- Annualized volatility: standard deviation of snapshot-to-snapshot returns annualized by observed date intervals. The implementation should avoid pretending sparse manual snapshots are daily market data.
- Calmar ratio: selected-period annualized return divided by absolute max drawdown when drawdown is negative.
- Latest date: latest valid snapshot date.
- Overview latest snapshot date: the most recent valid manually entered snapshot date across calculable accounts.
- Overview data freshness: show how many calculable accounts share the latest snapshot date, so users can spot account data lag before comparing performance.

### Period Rules

- `1M`, `3M`, `6M`, `1Y`, and `3Y` are calendar lookback windows from the latest valid snapshot date.
- `YTD` starts from January 1 of the latest valid snapshot year.
- `ALL` starts from the first valid snapshot.
- Summary cards, chart series, and account comparison table must use the same active period.
- Chart series are normalized to the active period anchor, so the latest chart value matches the account comparison table's selected-period return.
- The chart should keep personal-user review compact: show a `0%` reference line, show each account's active-period return in the legend, keep the annualized `10%` benchmark visible as a dashed line without adding it to the legend or tooltip, and only show drawdown shading for the selected highlighted account.
- The chart return axis should use the current visible period's values with compact, evenly spaced ticks, allowing `0.2%` or `0.5%` steps for sub-1% moves and integer steps for larger moves to avoid excessive vertical blank space on short periods such as `1M`.
- The chart labels lowest, latest, and highest return values only when one account is shown, when an account is selected, or while an account legend item is hovered in a multi-account chart; when the highest or lowest value matches the latest value, only the latest value is shown.

### Invalid Data Cases

- Non-numeric total value or net flow.
- Negative total value.
- First snapshot total value less than or equal to 0.
- Missing date.
- Duplicate same-account same-date snapshot without update confirmation when the existing snapshot would be overwritten.
- Snapshot sequence that creates zero or negative shares.
- Insufficient snapshots for performance calculation.

### Data Versioning

Stored data should include a schema version so that future holdings, transactions, or allocation modules can migrate local data without corrupting account performance records.

## 4. Technical Design

### Directory Structure

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

### Storage Keys

```text
pam:v1:accounts
pam:v1:snapshots
pam:v1:holdings
pam:v1:preferences
```

Preferences include selected account, selected period, highlighted comparison account, comparison sort, active view, account-management action state, hide-amount state, theme, and language. Future modules should use the same `pam:v1:<domain>` pattern and must not use `fund-monitor-*` keys.

### Dependencies

- Native ES modules.
- ECharts CDN for charts.
- Browser `localStorage`.
- Cloudflare Pages static hosting.

Account performance itself requires no backend API. Holdings quote refresh and holdings-generated snapshots use `/api/quotes` as a Cloudflare Pages Function for supported A-share and fund prices.

## 5. Acceptance Criteria

### Functional Acceptance

- `/pam/` opens an independent PAM page.
- PAM does not import or depend on `fundmonitor` business modules.
- Users can create, rename, and delete accounts.
- Deleting an account requires confirmation and removes its snapshots.
- Users can add, edit, and delete snapshots.
- Historical snapshots can be switched by account inside the snapshot table panel.
- Same-account same-date entries update the existing snapshot only after confirmation.
- Accounts and snapshots persist after page refresh.
- Two or more valid snapshots generate a performance curve.
- Deposits do not appear as artificial return jumps.
- Withdrawals do not appear as artificial return drops.
- Multiple accounts can be compared in one chart.
- Period switches update chart and metrics.
- Dark mode persists after refresh.
- Language selection persists after refresh.
- The amount privacy toggle masks money amounts while leaving latest prices, quantities, percentages, charts, and form inputs visible.
- Demo data can be generated only by user action.
- JSON backup export includes accounts, snapshots, holdings, and preferences.
- JSON backup import validates and normalizes data, then replaces local PAM data only after confirmation.
- Holdings quote refresh updates supported A-share and fund positions without blocking manual unsupported holdings.
- Snapshot generation from holdings previews date, account count, total value, overwrite warnings, and quote fallback warnings before writing snapshots.

### Data Acceptance

- Dates are sorted ascending before calculation.
- Invalid money inputs cannot be saved.
- Negative total value cannot be saved.
- A first snapshot with zero total value does not produce a performance series.
- Snapshot sequences that create zero or negative shares show an error state.
- Insufficient data shows a clear empty or guidance state.

### UI Acceptance

- Desktop layout shows account performance, account management, holding entry, snapshot entry, chart, metrics, and tables clearly.
- Mobile layout remains usable for account switching, snapshot entry, holding entry, quote refresh, chart viewing, and table review.
- ECharts loading failure does not break the full page.
- Sensitive-data messaging makes it clear that data is stored locally.

## 6. Implementation Tasks

- Create `/pam/` static page skeleton.
- Add independent PAM CSS variables and layout styles.
- Implement runtime state.
- Implement dark mode.
- Implement account and snapshot storage.
- Implement account unit NAV and metrics calculation.
- Implement account list and account actions.
- Implement snapshot form.
- Implement snapshot table.
- Implement performance chart and period switch.
- Implement overview cards and account comparison table.
- Implement demo data action.
- Implement empty, invalid, and insufficient-data states.
- Implement mobile responsive layout.
- Implement holdings management and `/api/quotes` integration.
- Implement JSON backup import/export.
- Implement snapshot generation from holdings.
- Implement hide-amount and language preferences.
- Update `README.md` and PAM specs with current behavior.
- Run local static verification.
