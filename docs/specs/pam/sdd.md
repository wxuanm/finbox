# PAM Spec-Driven Development

## Document Scope

- Spec namespace: `pam`
- Spec path: `docs/specs/pam/sdd.md`
- Related tool path: `/pam/`
- Status: Draft, reviewed for first implementation baseline

This document belongs only to PAM. Other FinBox tools should use their own folders under `docs/specs/<tool-name>/` to avoid naming, storage, and acceptance-criteria conflicts.

## 1. Requirements Spec

### Product Identity

- Tool name: PAM
- Full English name: Portfolio & Asset Manager
- Chinese name: 投资组合与资产管理
- Path: `/pam/`
- First module: 账户收益

### Product Goal

PAM helps users manually track multiple investment accounts, calculate account-level performance after excluding cash flow impact, and compare return trends, drawdowns, and risk metrics across accounts.

The first release focuses on account performance. The product name and structure should leave room for future modules such as holdings, allocation, transactions, attribution, and risk analysis.

### Confirmed Decisions

- The first release uses Chinese UI only.
- Deleting an account requires confirmation and removes all snapshots for that account.
- A demo data button is allowed, but no demo data is shown by default.
- PAM is an independent static tool and must not be mixed into `fundmonitor`.
- PAM may reference good product and implementation patterns from `fundmonitor`, but it must not share runtime state, localStorage keys, or business modules with it.
- PAM specs, design notes, and implementation tasks live under `docs/specs/pam/`.

### In Scope For First Release

- Create the independent `/pam/` static tool.
- Create, rename, and delete investment accounts.
- Manually add account snapshots.
- Edit and delete historical snapshots.
- Update an existing snapshot when the same account already has a snapshot on the same date.
- Calculate account unit NAV and performance using cash-flow-adjusted logic.
- Compare multiple accounts in one performance chart.
- Support chart periods: `1M`, `3M`, `6M`, `YTD`, `1Y`, `3Y`, `ALL`.
- Show account metrics: latest value, net contribution, cumulative profit/loss, cumulative return, selected-period return, max drawdown, annualized volatility, Calmar ratio, and latest date.
- Persist all user data in browser `localStorage`.
- Support dark mode.
- Provide empty, insufficient-data, and invalid-data states.
- Support desktop and mobile layouts.

### Out Of Scope For First Release

- Brokerage or platform integrations.
- CSV or Excel import.
- Cloud sync.
- Login or user accounts.
- Holdings detail.
- Transaction ledger.
- Multi-currency conversion.
- Backend APIs or Cloudflare Pages Functions.
- Reusing `fundmonitor` groups, state, storage, or UI modules.
- English UI.

### Core User Stories

- As a user with multiple investment accounts, I want to create account records so that I can track them separately.
- As a user, I want to record a date, total account value, net cash flow, and optional note so that PAM can calculate account performance.
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
└─ 账户收益
```

Future modules:

```text
PAM
├─ 总览
├─ 账户收益
├─ 持仓管理
├─ 资产配置
├─ 交易记录
├─ 收益归因
└─ 风险分析
```

### Page Structure

```text
/pam/
├─ Header: product name, description, theme toggle
├─ Module navigation: 账户收益, future modules disabled or hidden
├─ Unified module navigation: 账户收益 / 账户数据 / future modules
├─ 账户收益: overview cards, performance chart, account metric cards
└─ 账户数据: account list, snapshot input form, snapshot table with account switch
```

UI direction:

- Keep the default experience decision-first: account return overview, chart, and compact metric cards.
- Keep account maintenance separate under `账户数据`.
- Use short operational copy. Explanations should be one-line hints unless they prevent financial misunderstanding.

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
| Total value | Total account value on the date | Required, must be greater than or equal to 0 |
| Net flow | Net deposit or withdrawal on the date | Required, deposit is positive, withdrawal is negative, no cash flow is 0 |
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
总资产填写账户当天全部资产价值；净流入填写当天新增投入或取出资金，投入为正，取出为负，无资金变化填 0。
```

Empty state:

```text
还没有投资账户。创建一个账户，并录入两条以上资产快照后，即可生成账户收益曲线。
```

### Demo Data

- Demo data is not displayed by default.
- A user-triggered demo data button may create sample accounts and snapshots.
- Demo data must be clearly labeled.
- If real user data already exists, demo data may only be added after confirmation.
- Demo data should be added as separate demo accounts rather than merged into real accounts.

### Data Portability

- Users can export all PAM local data as a JSON backup file.
- Users can import a PAM JSON backup file into the current browser.
- Import replaces current PAM accounts, snapshots, and preferences only after user confirmation.
- Import validates schema version, account records, snapshot records, and account references before applying data.
- CSV import/export is out of scope for the first backup feature and can be added later for batch snapshot entry.

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
- Max drawdown: largest decline from a unit NAV peak.
- Annualized volatility: standard deviation of snapshot-to-snapshot returns annualized by observed date intervals. The implementation should avoid pretending sparse manual snapshots are daily market data.
- Calmar ratio: selected-period return divided by absolute max drawdown when drawdown is negative.
- Latest date: latest valid snapshot date.
- Overview latest snapshot date: the most recent valid manually entered snapshot date across calculable accounts.
- Overview data freshness: show how many calculable accounts share the latest snapshot date, so users can spot account data lag before comparing performance.

### Period Rules

- `1M`, `3M`, `6M`, `1Y`, and `3Y` are calendar lookback windows from the latest valid snapshot date.
- `YTD` starts from January 1 of the latest valid snapshot year.
- `ALL` starts from the first valid snapshot.
- Summary cards, chart series, and account metric cards must use the same active period.

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

## 4. Technical Design Draft

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

### Storage Keys

```text
pam:v1:accounts
pam:v1:snapshots
pam:v1:preferences
```

Preferences include selected account, selected period, and theme. Future modules should use the same `pam:v1:<domain>` pattern and must not use `fund-monitor-*` keys.

### Dependencies

- Native ES modules.
- ECharts CDN for charts.
- Browser `localStorage`.
- Cloudflare Pages static hosting.

No backend API is required for the first release.

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
- Demo data can be generated only by user action.

### Data Acceptance

- Dates are sorted ascending before calculation.
- Invalid money inputs cannot be saved.
- Negative total value cannot be saved.
- A first snapshot with zero total value does not produce a performance series.
- Snapshot sequences that create zero or negative shares show an error state.
- Insufficient data shows a clear empty or guidance state.

### UI Acceptance

- Desktop layout shows account management, snapshot input, chart, metrics, and table clearly.
- Mobile layout remains usable for account switching, snapshot entry, chart viewing, and table review.
- ECharts loading failure does not break the full page.
- Sensitive-data messaging makes it clear that data is stored locally.

## 6. Implementation Tasks Draft

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
- Implement metric cards and overview cards.
- Implement demo data action.
- Implement empty, invalid, and insufficient-data states.
- Implement mobile responsive layout.
- Update `README.md` with PAM details and local URL.
- Run local static verification.
