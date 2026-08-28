# Changelog

All notable user-visible changes to the FinBox VSIX are documented here.

## 0.0.9

- Refined fund trend hover tooltips with a more compact layout and clearer single-fund metrics.
- Removed the annualized 10% benchmark entry from trend hover tooltips while keeping the benchmark line visible on the chart.
- Tightened fund trend Y-axis bounds with compact integer ticks and fractional ticks for sub-1% moves.

## 0.0.8

- Rebuilt fund trend charts with bundled ECharts for smoother multi-fund comparison, scrollable legends, tooltips, and time-window zooming.
- Moved trend chart value axes to the right and kept the annualized 10% benchmark visible without adding it to the legend.
- Let group and single-fund trend charts keep the full three-year history available through the bottom zoom slider while rebasing visible-window returns to the selected range start.
- Enlarged and repositioned the chart zoom slider and moved legends above the curve area for clearer chart controls.

## 0.0.7

- Added a spinning refresh indicator on the `A Stock` group row while stock quotes are refreshing, including silent automatic refreshes.
- Added a spinning refresh indicator on fund group rows while fund quotes are refreshing.
- Changed fund trend panels to default to the three-month period and use fund-code-only editor tab titles for single-fund trends.
- Added single-fund trend details including max-drawdown curve marking, richer hover details, and a paginated historical NAV list.
- Improved trend chart x-axis labels, tooltip layout, chart/list switching, and NAV list pagination controls.
- Refined fund trend visual styling and single-fund metric cards, including all period metrics in one card.
- Fixed stock automatic refresh startup when the stock view is already visible after settings changes or activation.
- Simplified add/rename input prompts by removing redundant dialog titles.

## 0.0.6

- Batched stock quote refresh through Sina first and Eastmoney batch fallback to reduce per-symbol requests.
- Added optional automatic stock quote refresh with configurable interval, trading-hours filtering, and an immediate silent refresh when active.
- Replaced the placeholder settings view with a shortcut that opens native FinBox stock settings.
- Adapted fund trend webviews to VS Code editor theming and compact panel layout.
- Kept fund trend webviews alive when switching editor tabs so loaded charts remain visible.
- Added period switching and risk/return metrics to fund trend views for portfolio-style comparison.
- Reduced trend page side padding and added hover crosshair tooltips for historical curves.
- Refined fund trend charts with a 0% baseline, annualized 10% benchmark curve, right-side axis labels, horizontal date ticks, and precise hover alignment.
- Added fund-card curve filtering and inline metric highlighting for leading return, drawdown, volatility, Calmar ratio, and up-day ratio.
- Removed row-click trend loading from fund rows and avoided reloading already-open trend panels.
- Limited stock automatic refresh startup to visible stock views instead of extension activation.

## 0.0.5

- Renamed the extension display name and marketplace description to reflect both fund and stock monitoring.
- Renamed command IDs from `finboxFundMonitor.*` to the broader `finbox.*`, `finbox.fund.*`, and `finbox.stock.*` namespaces.
- Shortened command titles for opening, fund refresh, stock refresh, and stock add actions.
- Added inline group trend actions to fund group rows.
- Removed the redundant stock-group add action and moved stock removal below ordering actions.
- Require `sh`/`sz` prefixes for stock symbols so duplicate numeric codes on different exchanges remain distinct.
- Keep stock codes out of normal quoted stock rows while retaining prefixed symbols in tooltips, waiting, and failure states.
- Improved stock waiting and failure labels by showing `symbol[status]` in the name column.
- Updated the Activity Bar icon and rotated the marketplace icon.

## 0.0.4

- Added a `STOCK` view implementation with an `A Stock` group.
- Added A-share stock watchlist persistence through VSCode `globalState`.
- Added stock add, refresh, and remove commands.
- Display stock percentage change, latest price, and stock name in the sidebar.
- Display stock tooltip metrics for percentage change, price change, high, low, open, previous close, volume, and amount.
- Preserve stock add order by default and add move up/down context menu actions.
- Fetch stock quotes using the same source priority as `functions/api/quotes.js`: Sina first, Eastmoney fallback.

## 0.0.3

- Added a VSIX extension icon for the VSCode extension details view.

## 0.0.2

- Bumped the package version for VSIX update installation.
- Documented the source packaging and installation workflow.

## 0.0.1

- Added the initial FinBox Fund Monitor VSIX MVP.
- Added native VSCode TreeView monitoring for grouped funds.
- Added fund quote refresh, fund grouping, persistence, and historical trend panels.
