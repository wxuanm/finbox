# FinBox

FinBox brings lightweight fund and A-share stock monitoring into VS Code. It is designed for quick market checks from the Activity Bar without opening a browser dashboard.

## Features

- Monitor mutual funds in grouped watchlists.
- Refresh real-time fund estimates from Eastmoney.
- Open single-fund and group historical NAV trend views in editor panels.
- Review single-fund trend details with a chart/list switch, max-drawdown marking, all-period metrics, and paginated NAV records.
- Monitor A-share stocks under the `A Stock` group.
- Refresh A-share quotes using Sina first and Eastmoney as fallback.
- Show in-sidebar refresh indicators while fund or stock quotes are updating.
- Keep stock rows in your add order, with context menu actions to move stocks up or down.
- Persist funds, fund groups, stock symbols, and preferences with VS Code global storage.

## Fund Monitor

The `FUND` view shows grouped fund rows with:

- Estimated percentage change
- Estimated NAV
- Fund name
- Refresh failure state when quote data is unavailable

Available fund actions include:

- Add funds by six-digit code
- Refresh fund estimates
- Create, rename, and delete custom groups
- Add funds directly to a group
- Remove funds
- Open single-fund trend views
- Open group trend comparison views

Deleting a custom fund group moves contained funds back to the default group.

Single-fund trend panels default to the recent three-month period. The editor tab uses the fund code, while the page title keeps the fund name and code when quote metadata is available. The chart tooltip shows cumulative return; when only one fund is displayed it also shows unit NAV and daily return. Single-fund panels provide a `曲线 / 列表` switch. The list view shows date, unit NAV, accumulated NAV, and daily return in a compact paginated table with direct page jumps.

Group trend panels focus on comparison. They show normalized return curves and comparison metric cards, but do not show the historical NAV list switch.

## Stock Monitor

The `STOCK` view contains an `A Stock` group for A-share symbols.

Each stock row shows:

- Percentage change
- Latest price
- Stock name

Stock rows keep the order in which you added them. Use a stock item's context menu to move it up or down.

The stock tooltip shows:

```text
Stock Name (Symbol)
涨幅: +1.23%    涨跌: +0.45
最高: 12.34     最低: 11.98
今开: 12.00     昨收: 11.89
成交量: 123.45万    成交额: 1.23亿
```

Available stock actions include:

- Add A-share symbols by six-digit code
- Refresh stock quotes
- Remove stocks
- Move stocks up or down

Optional automatic stock refresh can be enabled in FinBox settings. When enabled, stock refresh starts when the `STOCK` view is visible and can be limited to A-share trading windows.

## Usage

Open the `FinBox` Activity Bar entry, then use the `FUND`, `STOCK`, and `SETTINGS` views.

Examples:

```text
Fund codes: 003026, 110022, 161725
Stock symbols: 600519, 000001
```

Use view title buttons or item context menus for add, refresh, remove, trend, and ordering actions.

## Data Sources

- Fund real-time estimates: Eastmoney fund comparison data.
- Fund historical NAV trends: Eastmoney fund historical script data.
- A-share stock quotes: Sina quote data first, Eastmoney single-stock quote data as fallback.

All quote requests are made from the VS Code extension host. The extension does not require FinBox Cloudflare Pages Functions at runtime.

## Persistence

FinBox stores watchlists and preferences through VS Code extension `globalState`.

Persisted data includes:

- Fund groups
- Fund-to-group mapping
- A-share stock symbols and their order
- Extension preferences

Quote values are refreshed from data sources and are not treated as the canonical persisted watchlist.

## Limitations

- Fund and stock input currently accepts six-digit codes.
- Historical trend comparison is limited to up to 10 fund codes.
- Quote refresh depends on network access to Sina and Eastmoney.
- `SETTINGS` is reserved for future extension settings.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history.
