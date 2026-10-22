# FinBox

FinBox brings lightweight fund and A-share stock monitoring into VS Code. It is designed for quick market checks from the Activity Bar without opening a browser dashboard.

## Features

- Monitor mutual funds in grouped watchlists.
- Refresh real-time fund estimates.
- Open single-fund and group historical NAV trend views in editor panels, including by clicking a fund row.
- Select monitored funds for custom historical comparison with a two-step comparison flow.
- Review single-fund trend details with a chart/list switch, low/high/latest labels, max-drawdown shading, all-period metrics, and paginated NAV records.
- Monitor A-share stocks under the `A Stock` group.
- Refresh A-share quotes with automatic fallback handling.
- Open A-share stock real-time trend views in editor panels by clicking a stock row.
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
- Select funds for custom comparison
- Add a fund row to the comparison basket from its context menu

The reserved default fund group is displayed as `Default`. Deleting a custom fund group moves contained funds back to `Default`.

Fund trend panels default to the recent three-month period unless `FinBox > Fund: Trend Default Period` is changed. Single-fund panels open on the historical NAV list first unless `FinBox > Fund: Trend Default View` is changed to `chart`. The editor tab uses the fund code, while the page title keeps the fund name and code when quote metadata is available. ECharts-powered trend charts remain available through the `曲线 / 列表` switch and provide a top legend, compact right-side value axis with a highlighted `0%` baseline, bottom time-window slider, and an annualized 10% benchmark line that can be hidden from the legend. The slider keeps the full history (this year plus the previous five years) available while rebasing visible-window returns to the selected range start. Hold `Ctrl` while scrolling (or pinch on a trackpad) to zoom and drag to pan; normal scrolling keeps scrolling the page. After a manual zoom the chart title shows the custom date range with a link to reset to the selected period. When only one fund is displayed, the chart labels the visible window's highest, lowest, and latest return values at their own points, showing only the latest label when the highest or lowest value is essentially the same, and shades the visible-window max drawdown as a green area under the curve with its percentage. The chart tooltip shows the visible-window return and the benchmark; when only one fund is displayed it also shows unit NAV, daily return, and excess return over the benchmark. The list view shows date, unit NAV, accumulated NAV, and daily return in a compact paginated table with direct page jumps. The single-fund detail card also lists annual returns and max drawdowns for this year and the previous five years. Returns treat dividends as reinvested and are calculated from four-decimal NAV data, matching the yearly returns published by the fund platform.

Group trend panels focus on comparison. They show normalized return curves with the same zoomable ECharts controls and comparison metric cards, but do not show the historical NAV list switch. Fund lines use colors that stay clear of the red/green rise-and-fall colors and match the swatch on each comparison card; the tooltip lists funds by return. Funds with a shorter history are marked where their data starts. Below the cards, an annual table compares each fund's return or max drawdown for this year and the previous five years, underlining the best fund in each year; clicking a row filters the chart like a card. Clicking a comparison card filters the chart to that fund, showing the same low/high/latest labels and max-drawdown shading used by single-fund charts.

Custom fund comparison reuses the same trend panel and historical NAV service. Start `选择对比基金` from the `FUND` view, choose 2-10 monitored funds from the simulated grouped selector, then open the comparison from the second step. Group rows can select or clear all funds in that group, and individual fund rows remain selectable. Fund row context menus also provide `加入对比` for building a temporary comparison basket.

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
- Open stock real-time trend views
- Remove stocks
- Move stocks up or down

Clicking a stock row opens a VS Code editor tab titled `实时走势(<stock code>)`. The trend page uses a darkened embedded panel and refreshes when the tab becomes visible again.

Optional automatic stock refresh can be enabled in FinBox settings. When enabled, stock refresh starts when the `STOCK` view is visible and can be limited to A-share trading windows.

## Settings

- `FinBox > Fund: Trend Default View`: choose `list` or `chart` for newly opened single-fund trend panels. Group trend panels always open as charts.
- `FinBox > Fund: Trend Default Period`: choose `ytd`, `m1`, `m3`, `m6`, `y1`, `y3`, or `y5` for newly opened fund trend panels.
- `FinBox > Stock Auto Refresh: Enabled`: enable automatic stock quote refresh.
- `FinBox > Stock Auto Refresh: Interval Minutes`: set the automatic stock quote refresh interval.
- `FinBox > Stock Auto Refresh: Trading Hours Only`: limit automatic stock quote refresh to A-share trading windows.

## Usage

Open the `FinBox` Activity Bar entry, then use the `FUND`, `STOCK`, and `SETTINGS` views.

Examples:

```text
Fund codes: 003026, 110022, 161725
Stock symbols: 600519, 000001
```

Use view title buttons or item context menus for add, refresh, remove, trend, and ordering actions.

All quote requests are made from the VS Code extension host. The extension does not require FinBox Cloudflare Pages Functions at runtime.

Historical NAV data is cached for the current day by individual fund code, so single-fund views, group comparisons, and custom comparisons can reuse already loaded fund history and only fetch missing funds.

## Persistence

FinBox stores watchlists and preferences through VS Code extension `globalState`.

Persisted data includes:

- Fund groups
- Fund-to-group mapping
- A-share stock symbols and their order
- Extension preferences

Quote values are refreshed from remote services and are not treated as the canonical persisted watchlist.

## Limitations

- Fund and stock input currently accepts six-digit codes.
- Historical trend comparison is limited to up to 10 fund codes.
- Quote refresh depends on network access.
- `SETTINGS` is reserved for future extension settings.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history.
