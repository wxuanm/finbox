# Changelog

All notable user-visible changes to the FinBox VSIX are documented here.

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
