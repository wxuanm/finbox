# PAM Holdings Spec

## Scope

- Module: 账户管理 current holdings capability
- Parent tool: PAM
- First release focus: current holdings only
- Quote scope: A-share and fund quotes first

## Product Goal

The current holdings capability lets users maintain current positions under each investment account from `账户管理`, review current market value, cost, unrealized profit/loss, and portfolio weight. Holdings must be bound to an existing account.

## Confirmed Decisions

- First release tracks current holdings only, not historical holding snapshots.
- Holdings must be bound to an account.
- Price can be manually entered.
- A-share and fund quote refresh is implemented first; cash is manually maintained as a first-class holding; unsupported markets remain manual.
- Latest prices are not hidden by the amount privacy toggle. Market value, cost amount, and unrealized profit/loss are hidden when amount privacy is enabled.
- No transaction ledger, dividend handling, fee handling, or cost-basis automation in this release.

## In Scope

- Integrate holdings into `账户管理` instead of exposing a separate top-level `持仓管理` navigation item.
- Add, edit, and delete holdings.
- Filter holdings by the selected account plus asset class and market.
- Holding market options are constrained by asset class: stocks use A-share/other, funds use fund/other, bonds and other assets use other, and cash is fixed to cash.
- Sort holdings table.
- Calculate market value, cost amount, cumulative profit/loss, cumulative profit/loss percentage, and portfolio weight.
- Account cards remain the account-level asset and cash-flow-adjusted return overview. Holdings detail shows a lightweight count and valuation-quality status, plus a summary strip of filtered market value, holding P/L, and cost-based unrealized return (`持仓浮动收益率`), because filtered subsets cannot be read from account cards.
- Persist holdings in D1 after authenticated synchronization, with `localStorage` as the browser cache.
- Include holdings in JSON import/export.
- Add demo holdings.
- Refresh supported A-share and fund quotes through `/api/quotes`.
- Generate account snapshots from current holdings valuation after preview and confirmation.

## Out Of Scope

- Historical holdings.
- Transaction ledger.
- Brokerage import or sync.
- CSV/Excel import.
- Multi-currency conversion.
- Real-time quotes for HK and US markets in the first quote release.
- Foreign currency conversion. First release treats all values as CNY-equivalent manual values.
- Tax, dividend, fee, or realized profit/loss calculation.

## Holding Data Model

```js
{
  id: "holding-001",
  accountId: "account-001",
  symbol: "600519",
  name: "贵州茅台",
  assetClass: "stock",
  market: "CN",
  quantity: 100,
  costPrice: 1500,
  currentPrice: 1680,
  currency: "CNY",
  priceSource: "manual",
  priceUpdatedAt: "2026-08-05T10:00:00.000Z",
  asOfDate: "2026-08-05",
  note: ""
}
```

## Asset Classes

```text
stock: 股票
fund: 基金
bond: 债券
cash: 现金
other: 其他
```

## Markets

```text
CN: A股/境内
Fund: 基金
Cash: 现金
Other: 其他
```

Only `CN` and `Fund` are quote-refresh targets in the first quote release. `Cash` is manual and uses amount mode.

## Calculations

```text
costAmount = quantity * costPrice
marketValue = quantity * currentPrice
unrealizedPnl = marketValue - costAmount
unrealizedPnlPct = costAmount > 0 ? unrealizedPnl / costAmount * 100 : null
weight = totalMarketValue > 0 ? marketValue / totalMarketValue * 100 : null
```

The holdings detail table keeps de-duplicated asset class, symbol, and market context under the name, with no separate asset-class column. The visible columns are name, market value, `成本/现价`, `持仓盈亏`, weight, price time, and actions. The `成本/现价` column displays cost price and current price together; sorting that column continues to use `currentPrice`. The `持仓盈亏` column displays unrealized profit/loss and its percentage together. Holdings surfaces use `持仓盈亏` rather than `累计盈亏`, which stays reserved for cash-flow-adjusted account metrics. Price time displays status and date on separate lines.

## Quote API

Path:

```text
/api/quotes?items=CN:600519,Fund:003026
```

Response:

```js
{
  source: "mixed",
  updatedAt: "2026-08-05T10:00:00.000Z",
  quotes: [
    {
      market: "CN",
      symbol: "600519",
      name: "贵州茅台",
      price: 1680.12,
      changePct: 1.24,
      currency: "CNY",
      quoteTime: "2026-08-05 15:00:00"
    }
  ],
  failedItems: []
}
```

## Acceptance Criteria

- Holdings can be added only when at least one account exists.
- Every holding is bound to an account.
- Invalid quantity, cost price, or current price cannot be saved.
- Holdings persist after refresh.
- Holdings are included in JSON export and restored by JSON import.
- Old PAM backups without holdings import successfully with an empty holdings list.
- Holdings management can generate account snapshots from current holdings market value for either the previous trading day or the current day. Previous-trading-day snapshots use A-share previous close and fund latest disclosed unit NAV, with the snapshot date resolved before writing snapshots from built-in ordinary-fund NAV disclosure references: `110001` 易方达平稳增长混合, `000001` 华夏成长混合, and `270002` 广发稳健增长混合A. If the built-in reference disclosure date cannot be obtained, the confirmation prompt states that the date has fallen back to the local previous trading day. Current-day snapshots use A-share latest price, falling back to previous close when latest price is unavailable, and fund latest disclosed unit NAV. Account data remains the manual-entry path for snapshots, including net cash flow.
- Cash holdings use amount mode: quantity is stored as 1, and cost/current price both represent the cash amount.
- Holdings table supports filtering and sorting.
- Cash holdings always render as the last rows of the holdings table, regardless of the active sort key or direction.
- Holdings detail offers a table/allocation/P&L-contribution view switch (persisted in preferences, defaults to table). If ECharts is unavailable, chart views show a notice and the table remains usable. Chart tooltips respect amount privacy.
- View switch labels name the question each view answers: `列表` (table), `仓位分布` (allocation), `盈亏来源` (contribution). A bubble view was removed because its size channel duplicated position and its average-weight line had no decision meaning; a persisted `bubble` preference falls back to table, and a persisted `treemap` preference maps to `allocation`. The view switch and the asset class / market filters share one toolbar row (switch left, filters right); filters stay visible even when the filter yields no holdings, so it can be undone.
- The `仓位分布` view shows one horizontal bar per holding with positive market value, sorted by weight descending with cash last, each bar labeled with its weight. Bars use a single primary hue (cash in neutral gray) and carry no P/L color, so this view only answers where the money sits; P/L stays in `盈亏来源`. When there are more than five non-cash holdings, the footnote states the top-five combined weight. It replaced an asset-class treemap: area is harder to compare than bar length, small tiles could not hold labels on phones, and P/L coloring competed with the allocation question. Grouping by asset class is deferred until holdings carry an underlying-asset classification.
- The `盈亏来源` view shows one horizontal bar per non-cash holding, sorted descending, where contribution = holding unrealized P/L ÷ total cost of the filtered holdings (cash included). Contributions sum to `持仓浮动收益率` in the shared summary strip; the chart has no separate total. The strip tooltip distinguishes this cost-based return from the cash-flow-adjusted account return. Bar labels show the P/L amount; under amount privacy they show percentage points instead. The axis and tooltip use percentage points (`个百分点` / `pp`) so contributions are not mistaken for a holding's own return. Each bar's axis label shows the holding name and weight.
- The contribution view excludes cash bars because cash has no P/L, and its footnote states the cash weight while noting that cash still counts toward principal.
- When an asset class or market filter is active, chart footnotes state that weights are based on the current filter.
- Clicking an allocation or contribution bar, or its name label, opens that holding in the edit dialog.
- Charts flag stale prices (over three days old): names get a `⚠` prefix, tooltips show price status and date, and a footnote states the stale count.
- Holdings detail provides a clear add-holding action and identifies manual, quoted, and stale (over three days old) valuations.
- A-share quote refresh updates current price from the latest price, including Shanghai exchange-traded funds stored as stock/CN holdings such as `510300`. Fund quote refresh updates current price from the latest disclosed unit NAV, not the intraday estimated NAV. Refresh also updates name when available, price source, and price update time.
- Quote refresh failure does not block manual holding maintenance.
- Latest price remains visible when amount privacy is enabled; money amounts render as masked values.
