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
- Account cards remain the account-level asset and cash-flow-adjusted return overview. Holdings detail shows a lightweight count and valuation-quality status, plus filtered market value, holding P/L, and cost-based unrealized return (`持仓浮动收益率`) in the panel header opposite the `持仓明细` title, because filtered subsets cannot be read from account cards. The figures are shared by all three views, sit on the title's right on desktop, and drop under the title as an even three-column row on phones; they are hidden when there are no holdings.
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
- The `仓位分布` view shows one horizontal bar per invested (non-cash) holding with positive market value, sorted by weight descending, each bar labeled with its weight to two decimals, matching the table. Above the bars a stats row shows the largest holding (weight and name), the top-five combined weight when there are more than five invested holdings, and the cash weight; cash is a stat rather than a bar so bars stay in strict descending order. Bars use a single lightened primary hue and carry no P/L color, so this view only answers where the money sits; P/L stays in `盈亏来源`. With one invested holding the view shows a sentence instead of a single full-width bar; with only cash it says there are no invested holdings. On desktop bar charts stop at 760px wide and side labels size to the longest name (capped near a third of the width); below 480px chart width names sit on their own line above each bar so long fund names (including A/C share suffixes) are not truncated. It replaced an asset-class treemap: area is harder to compare than bar length, small tiles could not hold labels on phones, and P/L coloring competed with the allocation question. Grouping by asset class is deferred until holdings carry an underlying-asset classification.
- The `盈亏来源` view shows one horizontal bar per non-cash holding, sorted descending, where contribution = holding unrealized P/L ÷ total cost of the filtered holdings (cash included). Contributions sum to `持仓浮动收益率` in the panel header; the chart has no separate total. The header figure's tooltip distinguishes this cost-based return from the cash-flow-adjusted account return. Bar labels show the P/L amount; under amount privacy they show the contribution as a plain `%` value instead. The axis name and tooltip label say `对整体收益贡献` so the `%` value is read as a share of the total return, not a holding's own return. Each bar's axis label shows the holding name and weight.
- Below 480px chart width the `盈亏来源` view renders as an HTML list instead of a chart, because diverging bar-end labels collide with names or clip on narrow screens. Each row shows name and weight with the amount (contribution `%` under privacy) right-aligned, then a full-width bar growing left or right from a center zero line. Tapping a row expands its details with an `编辑` button. The phone list does not need ECharts. Holding chart views re-render when the chart width crosses the breakpoint, such as on rotation.
- When the chart card is at least 900px wide (a CSS container query on the card), both bar views switch to two columns: the chart (capped at 960px) on the left and a stats column on the right, so the capped chart does not leave the rest of the row empty. `仓位分布` moves its stats row into that column; narrower cards keep it above the chart. `盈亏来源` shows `盈利合计` and `亏损合计` (contribution `%` with the P/L amount, amount omitted under privacy) and, when there is more than one gain or loss, `最大贡献` and `最大拖累` with the holding name. Gains and losses are summed separately so a small net return cannot hide large offsetting moves. These contribution stats appear only in the wide layout; narrower desktop widths and the phone list stay unchanged.
- The contribution view excludes cash bars because cash has no P/L, and its footnote states the cash weight while noting that cash still counts toward principal.
- When an asset class or market filter is active, chart footnotes state that weights are based on the current filter.
- With a mouse, clicking an allocation or contribution bar, or its name label, opens that holding in the edit dialog. On touch devices (`hover: none`) a tap only opens the tooltip, which stays open and carries an `编辑` button; the editor opens only from that button, so checking details never opens the editor by accident.
- On phones the view switch is a full-width three-segment control and the two filters split the next row; the chart drops its inner card frame so it uses the panel width.
- Charts flag stale prices (over three days old; cash is never stale because it is priced at 1): names get a `⚠` prefix, tooltips show price status and date, and a footnote states the stale count.
- Holdings detail provides a clear add-holding action and identifies manual, quoted, and stale (over three days old) valuations.
- A-share quote refresh updates current price from the latest price, including Shanghai exchange-traded funds stored as stock/CN holdings such as `510300`. Fund quote refresh updates current price from the latest disclosed unit NAV, not the intraday estimated NAV. Refresh also updates name when available, price source, and price update time.
- Quote refresh failure does not block manual holding maintenance.
- Latest price remains visible when amount privacy is enabled; money amounts render as masked values.
