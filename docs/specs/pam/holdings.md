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
- A-share and fund quote refresh is planned first; cash is manually maintained as a first-class holding; unsupported markets remain manual.
- No transaction ledger, dividend handling, fee handling, or cost-basis automation in this release.

## In Scope

- Integrate holdings into `账户管理` instead of exposing a separate top-level `持仓管理` navigation item.
- Add, edit, and delete holdings.
- Filter holdings by the selected account plus asset class and market.
- Holding market options are constrained by asset class: stocks use A-share/other, funds use fund/other, bonds and other assets use other, and cash is fixed to cash.
- Sort holdings table.
- Calculate market value, cost amount, unrealized profit/loss, profit/loss percentage, and portfolio weight.
- Keep account cards as the only asset and return overview. Holdings detail instead shows a lightweight count and valuation-quality status for the active filter.
- Persist holdings in localStorage.
- Include holdings in JSON import/export.
- Add demo holdings.
- Refresh supported A-share and fund quotes through `/api/quotes`.

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

## Quote API

Path:

```text
/api/quotes?items=CN:600519,Fund:003026
```

Response:

```js
{
  source: "eastmoney",
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
- Holdings detail provides a clear add-holding action and identifies manual, quoted, and stale (over three days old) valuations.
- A-share and fund quote refresh updates current price, name when available, price source, and price update time.
- Quote refresh failure does not block manual holding maintenance.
