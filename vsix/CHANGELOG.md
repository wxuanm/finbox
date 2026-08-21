# Changelog

All notable user-visible changes to the FinBox VSIX are documented here.

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
