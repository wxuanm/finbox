# FinBox VSIX Implementation Tasks

## Phase 1: SDD Foundation

- [x] Create VSIX spec namespace under `docs/specs/vsix/`.
- [x] Document product requirements for sidebar estimates and editor trend views.
- [x] Document technical design for extension host services, sidebar webview, and trend webview.
- [x] Document implementation task plan.

## Phase 2: Extension Subproject Bootstrap

- [x] Add isolated `vsix/` subproject.
- [x] Add `package.json` with VSCode extension metadata, commands, and view contributions.
- [x] Add TypeScript configuration.
- [x] Add extension entrypoint at `vsix/src/extension.ts`.
- [x] Add VSCode debug launch configuration if needed.
- [x] Add minimal icon assets for Activity Bar contribution.
- [ ] Confirm extension activates in Extension Development Host.

## Phase 3: Core State And Storage

- [x] Implement versioned storage service using `ExtensionContext.globalState`.
- [x] Implement default persisted state with immutable `default` group.
- [x] Implement fund add and remove operations.
- [ ] Implement group create, rename, delete, and reorder operations.
- [x] Implement fund move between groups.
- [x] Validate malformed persisted data and recover to safe defaults.
- [x] Preserve migration safety for future schema changes.

## Phase 4: Real-Time Quote Service

- [x] Port Eastmoney real-time request URL construction from `functions/api/fundgz.js`.
- [x] Implement code normalization and de-duplication.
- [x] Implement chunking by 10 codes for `t=0` requests.
- [x] Parse `var fundinfo = [...]` without evaluating remote JavaScript.
- [x] Normalize quote fields into `FundQuote` objects.
- [x] Return partial successes and failed code lists.
- [x] Add timeout and user-visible error handling.

## Phase 5: Sidebar Fund Monitor

- [x] Implement native TreeView provider for `finbox.fund`.
- [x] Replace sidebar Webview with VSCode TreeView items and menus.
- [x] Render grouped fund estimate rows.
- [x] Render empty, loading, stale, and error states.
- [x] Add sidebar actions for refresh and add fund.
- [x] Add remove fund action.
- [x] Add group management actions if still in MVP scope after first render.
- [x] Wire sidebar messages to extension host commands and store mutations.
- [x] Ensure positive, negative, and neutral values are visually distinct.

## Phase 6: Historical NAV Service

- [x] Port historical NAV extraction logic from `functions/api/fundnav.js`.
- [x] Implement one-to-ten code limit for comparison requests.
- [x] Extract fund name, manager, scale, unit NAV, accumulated NAV, and daily return.
- [x] Normalize response to `FundNavResponse`.
- [x] Implement same-day cache for historical NAV responses.
- [x] Return partial success and failed codes.

## Phase 7: Editor Trend Panels

- [x] Implement trend panel creation and reveal behavior.
- [x] Add trend panel HTML, CSS, and JavaScript under `vsix/media/trend/`.
- [ ] Bundle or vendor ECharts locally.
- [x] Render single-fund historical trend.
- [x] Render group historical trend comparison.
- [x] Reuse or port NAV metric calculations.
- [x] Add single-fund historical NAV list with pagination.
- [x] Add single-fund max-drawdown curve marker.
- [x] Add single-fund all-period metric table.
- [x] Add retry action for failed historical data requests.
- [ ] Handle ECharts absence with readable fallback.

## Phase 8: Command Integration

- [x] Register `finbox.open`.
- [x] Register `finbox.fund.refresh`.
- [x] Register `finbox.fund.add`.
- [x] Register `finbox.fund.openTrend`.
- [x] Register `finbox.fund.openGroupTrend`.
- [x] Add command palette titles and categories.
- [x] Add context menu entries if using native tree or supported sidebar actions.

## Phase 8.5: A-Share Stock Monitor

- [x] Add an `A Stock` group under the `STOCK` view.
- [x] Add A-share symbol persistence through VSCode `globalState`.
- [x] Fetch latest A-share quotes using Sina first and Eastmoney fallback.
- [x] Show stock percentage change, latest price, and stock name.
- [x] Show stock tooltip metrics for percentage change, price change, high, low, open, previous close, volume, and amount.
- [x] Add stock add, refresh, and remove commands.
- [x] Preserve stock add order and add move up/down actions.
- [x] Start automatic stock refresh when the stock view is already visible.

## Phase 9: Security And Packaging

- [x] Apply strict webview Content Security Policy.
- [x] Use nonces for local scripts.
- [x] Convert extension resource paths with `webview.asWebviewUri`.
- [x] Avoid remote scripts and CDN dependencies.
- [x] Ensure Eastmoney responses are parsed in extension host only.
- [ ] Sanitize user-provided group names before rendering.
- [ ] Exclude unrelated repo files from packaged extension where appropriate.

## Phase 10: Manual Verification

- [ ] Launch Extension Development Host.
- [ ] Open FinBox sidebar from Activity Bar.
- [ ] Add a valid six-digit fund code.
- [ ] Refresh real-time quotes.
- [ ] Add valid A-share symbols, including duplicate numeric codes with `sh`/`sz` prefixes, and refresh stock quotes.
- [ ] Remove a fund and confirm persistence.
- [ ] Create and delete a custom group, confirming deleted group funds move to `default`.
- [ ] Reload VSCode window and confirm watchlist restores.
- [ ] Open single-fund trend in editor.
- [ ] Open group trend comparison in editor.
- [ ] Confirm invalid codes and network failures show recoverable errors.
- [ ] Confirm existing browser `/fundmonitor/` still works through `npx wrangler pages dev .` if browser files were touched.

## Deferred Enhancements

- [ ] Add status bar summary.
- [ ] Add configurable auto-refresh interval.
- [ ] Add price movement notifications or threshold alerts.
- [ ] Add import/export of watchlist and groups.
- [ ] Add English UI strings.
- [ ] Add automated unit checks for parser and NAV normalization logic.
- [x] Evaluate replacing sidebar webview with native `TreeView` after MVP stabilizes.
