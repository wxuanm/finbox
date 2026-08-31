# FinBox VSIX Technical Design

## Scope

- Tool: FinBox VSIX
- Planned source path: `vsix/`
- Spec source: `docs/specs/vsix/sdd.md`
- Browser baseline: `fundmonitor/`
- API baseline: `functions/api/fundgz.js`, `functions/api/fundnav.js`
- Design target: initial MVP architecture

## Architecture

The VSIX is a VSCode extension subproject that runs fund data access in the extension host, renders the monitor list with a native TreeView, and renders historical analysis through editor webviews.

```text
vsix/
├─ package.json
├─ tsconfig.json
├─ src/
│  ├─ extension.ts
│  ├─ services/
│  │  ├─ fundQuoteService.ts
│  │  ├─ fundNavService.ts
│  │  ├─ stockQuoteService.ts
│  │  └─ storageService.ts
│  ├─ state/
│  │  └─ fundMonitorStore.ts
│  ├─ views/
│  │  ├─ fundMonitorTreeProvider.ts
│  │  └─ stockMonitorTreeProvider.ts
│  └─ webviews/
│     └─ trendPanel.ts
└─ media/
   ├─ trend/
   │  ├─ trend.css
   │  └─ trend.js
   └─ vendor/
      └─ echarts.min.js
```

The source layout may be adjusted during implementation, but these boundaries should remain stable:

- Extension host owns commands, storage, network access, parsing, caching, and cross-webview coordination.
- Native TreeView owns compact watchlist rendering, row-click command interactions, and VSCode context menu interactions.
- Trend editor webview owns chart rendering and historical analysis presentation.

## VSCode Contributions

Expected `package.json` contributions:

```json
{
  "activationEvents": [
    "onView:finbox.fund",
    "onCommand:finbox.open",
    "onCommand:finbox.fund.refresh"
  ],
  "contributes": {
    "viewsContainers": {
      "activitybar": [
        {
          "id": "finbox",
          "title": "FinBox",
          "icon": "media/icon.svg"
        }
      ]
    },
    "views": {
      "finbox": [
        {
          "id": "finbox.fund",
          "name": "FUND"
        }
      ]
    },
    "commands": [
      {
        "command": "finbox.open",
        "title": "打开监控"
      },
      {
        "command": "finbox.fund.refresh",
        "title": "刷新基金"
      },
      {
        "command": "finbox.fund.add",
        "title": "添加基金"
      }
    ]
  }
}
```

## Runtime Components

### `extension.ts`

- Registers commands.
- Creates and registers `SidebarViewProvider`.
- Creates shared services and store instances.
- Disposes timers, panels, and subscriptions.

### `fundMonitorStore.ts`

- Owns in-memory watchlist state.
- Loads and saves canonical state through `StorageService`.
- Exposes methods for add, remove, move, group create, group rename, group delete, and group reorder.
- Emits updates to sidebar and open trend panels.

### `storageService.ts`

- Wraps `ExtensionContext.globalState`.
- Stores one versioned object under a stable key.
- Validates loaded data and applies safe defaults.
- Keeps migration logic isolated from UI code.
- Persists fund groups, fund-to-group mapping, and the A-share watchlist.

Suggested key:

```text
finbox.fundMonitor.state
```

### `stockQuoteService.ts`

- Fetches A-share quotes directly from the extension host.
- Follows `functions/api/quotes.js` source priority: batched Sina first, batched Eastmoney fallback.
- Normalizes each quote to symbol, stock name, latest price, previous close, open, high, low, price change, percentage change, volume, amount, quote time, and source.
- Uses canonical `sh`/`sz` prefixed symbols for storage, quote cache keys, requests, and row identity so same numeric codes on different exchanges do not collide.
- Returns partial failures so the stock sidebar can keep successful rows visible.
- Stock refresh supports optional automatic polling through VS Code settings. Manual refresh shows progress and failure warnings; automatic refresh runs silently, performs an immediate refresh when active, skips non-trading windows by default, and reuses the same in-flight refresh lock as manual refresh. The default trading windows are 09:25-11:35 and 12:55-15:05 local time on weekdays.
- Stock auto-refresh startup checks the initial `TreeView.visible` state as well as later visibility changes, so opening or changing settings while the stock view is already visible still starts the refresh timer.

### `settingsTreeProvider.ts`

- Renders FinBox operational settings as TreeView status rows and command shortcuts.
- Shows only the `Open FinBox Settings` shortcut.
- Opens the native VS Code Settings `finbox.stock` scope for configuration edits instead of implementing custom TreeView form controls.

Initial shape:

```ts
interface PersistedFundMonitorState {
  schemaVersion: 1;
  groups: Array<{ id: string; name: string }>;
  fundGroups: Record<string, string>;
  preferences: {
    refreshIntervalMinutes?: number;
    themeMode?: 'vscode' | 'light' | 'dark';
  };
}
```

### `fundQuoteService.ts`

- Accepts a list of fund codes.
- Splits real-time estimate requests into chunks of 10 when using `t=0`.
- Requests Eastmoney `FundCompare_Interface.aspx` directly from the extension host.
- Parses `var fundinfo = [...]` without evaluating remote script code.
- Returns normalized `FundQuote[]` and failed codes.
- Applies request timeout and parse guards.

Input validation:

- Trim all codes.
- Ignore empty entries.
- Prefer six-digit code validation for user input.
- De-duplicate before request.

### `fundNavService.ts`

- Accepts one to ten six-digit fund codes.
- Requests Eastmoney `pingzhongdata/<code>.js` directly.
- Reuses the parsing approach from `functions/api/fundnav.js`.
- Extracts fund name, manager, scale, unit NAV trend, and accumulated NAV trend.
- Returns the same normalized shape documented in the SDD.
- Uses `Promise.allSettled` so partial results can render.

### `sidebarViewProvider.ts`

- Implements `vscode.WebviewViewProvider`.
- Provides HTML for the sidebar webview.
- Sends initial state to the sidebar when resolved.
- Handles sidebar messages:
  - `ready`
  - `refresh`
  - `addFund`
  - `removeFund`
  - `createGroup`
  - `renameGroup`
  - `deleteGroup`
  - `moveFund`
  - `openFundTrend`
  - `openGroupTrend`
- Applies strict Content Security Policy.

### `trendPanel.ts`

- Creates and reveals editor webview panels.
- Supports one panel per fund or group where practical.
- Loads bundled ECharts asset through `webview.asWebviewUri`.
- Requests historical NAV data through `fundNavService` via extension host.
- Sends trend payloads to the webview.
- Handles retry and refresh messages.
- Uses VS Code theme CSS variables for editor background, foreground, widget surfaces, borders, button states, and chart colors.
- Uses the available editor width with minimal side padding, compact spacing and typography, and adapts the header and metric cards for narrow editor columns.
- Uses `retainContextWhenHidden` so loaded trend charts remain visible after switching editor tabs.
- Provides client-side period switching across YTD, one month, three months, six months, one year, and three years using cached trend payloads.
- Defaults trend rendering to the three-month period and keeps x-axis labels readable with explicit first/last label anchoring.
- Renders trend curves through a bundled local ECharts asset, with top scrollable legends, right-side value axes, tooltip values, and a bottom time-window zoom slider.
- Keeps the full three-year history available to the ECharts zoom slider while rebasing visible-window returns to the current zoom range start, so one month, three month, year-to-date, and dragged custom windows start from 0% semantics without discarding older data.
- Calculates Y-axis bounds from current visible fund returns, benchmark values, and `0%`, then snaps to compact, evenly spaced ticks. Sub-1% moves may use `0.2%` or `0.5%` steps, while larger moves use integer steps so short periods such as one month do not inherit full-history extremes.
- Keeps the annualized 10% benchmark line visible in the chart but excluded from the legend; single-fund tooltips also show unit NAV and daily return details.
- Single-fund trend charts use ECharts mark points to label the current visible window's lowest, highest, and latest cumulative return values; if the highest or lowest value matches the latest value, only the latest label is shown.
- Calculates the current visible-window max-drawdown segment and overlays it only when one fund is displayed, including single-fund views and a selected fund inside group trend views.
- Provides a single-fund-only chart/list radio switcher. The list view uses the same cached historical NAV payload, paginates records in a compact two-column table, supports direct page jumps, and renders date, unit NAV, accumulated NAV, and daily return.
- Renders group fund-comparison cards with return, maximum drawdown, annualized volatility, return-to-drawdown ratio, up-day ratio, scale, and latest NAV date. Single-fund views render one detail card containing all period rows and highlight the active period.

## Message Protocol

The native TreeView does not use webview message passing. User actions are routed through VSCode commands registered by `extension.ts`, fund row clicks invoke `finbox.fund.openTrend`, and tree refreshes are driven by the store's `onDidChange` event.

Trend panel messages:

```ts
type TrendToHostMessage =
  | { type: 'ready' }
  | { type: 'refreshTrend' };

type HostToTrendMessage =
  | { type: 'trendLoading' }
  | { type: 'trendData'; payload: FundNavResponse }
  | { type: 'trendError'; message: string; failedCodes?: string[] };
```

## Webview Security

- Use `enableScripts: true` only for local webview scripts.
- Use a nonce for script tags.
- Restrict `script-src` to the nonce and local webview resources.
- Restrict `style-src` to local styles and VSCode CSS variables; avoid inline styles unless nonce/hash is used.
- Do not load ECharts from CDN.
- Do not inject raw Eastmoney script responses into webviews.
- Sanitize user-provided group names before rendering.

## Data Fetching Design

### Real-Time Quotes

Request URL pattern:

```text
https://fund.eastmoney.com/Data/FundCompare_Interface.aspx?t=0&bzdm=<codes>&rt=<timestamp>
```

Rules:

- For more than 10 codes, split into chunks of 10.
- Parse `fundinfo` array from JavaScript text using a regular expression and JSON parsing.
- Do not use `eval` or `Function`.
- Return partial results when some chunks fail.
- Mark failed codes in the sidebar.

### Historical NAV

Request URL pattern:

```text
https://fund.eastmoney.com/pingzhongdata/<code>.js?v=<timestamp>
```

Rules:

- Limit group comparison to 10 fund codes in MVP.
- Use the latest three-year window available from source data.
- Preserve accumulated NAV preference for normalized return calculations.
- Return partial success with `failedCodes`.

## State Synchronization

The store is the source of truth for user watchlist data.

```text
User action in sidebar TreeView
  -> VSCode command
  -> Extension host validates action
  -> Store mutates and persists canonical state
  -> Store emits change event
  -> TreeView refreshes
  -> Open trend panels refresh if affected
```

Real-time quote data is runtime state:

```text
Refresh command
  -> fundQuoteService.fetchQuotes(codes)
  -> Store updates quote cache
  -> TreeView refreshes from quote cache
```

Stock automatic refresh is extension-host scheduled:

```text
VS Code setting enabled
  -> extension immediately checks trading window and refreshes if active
  -> extension timer checks interval and trading window
  -> stockQuoteService.fetchQuotes(symbols)
  -> Store updates stock quote cache
  -> Stock TreeView refreshes from quote cache
```

Settings view shortcut:

```text
SETTINGS TreeView
  -> Open FinBox Settings
  -> Native VS Code Settings opens at finbox.stock
```

Historical NAV data is panel-scoped with optional same-day cache:

```text
Open trend panel
  -> fundNavService.fetchThreeYearFundNav(codes)
  -> Trend panel receives trendData
```

## UI Implementation Direction

### Sidebar TreeView

The sidebar is a native VSCode TreeView. It should not import the existing browser `app.js` directly because that module assumes full-page DOM, `localStorage`, inline handlers, and `/api/*` paths.

Reuse is allowed at the design and utility level:

- Positive, negative, neutral, and failed state semantics from the browser monitor.
- Formatter behavior.
- Group hierarchy and default-group behavior.
- Loading and empty state copy.

### Trend Webview

The trend view can reuse more browser Fund Monitor analysis concepts, but should be adapted to editor panel layout.

It should avoid browser modal assumptions and render directly into the panel body.

## Verification

During MVP implementation, verify TypeScript compilation first:

```powershell
cd vsix
npm install
npm run compile
```

Then verify manually with Extension Development Host:

1. Run the extension from VSCode debug launch.
2. Open the FinBox native tree view.
3. Add a valid six-digit fund code.
4. Refresh quotes and confirm values render.
5. Reload VSCode window and confirm persisted watchlist restores.
6. Open single-fund trend in editor.
7. Open group trend in editor with multiple funds.
8. Disconnect network or use an invalid code and confirm recoverable errors.
9. Confirm the existing `/fundmonitor/` browser page is not broken by extension files.

If automated scripts are introduced in `vsix/package.json`, document and run them before marking implementation tasks complete.

## Development And Packaging

### Development Commands

Run extension project commands from the isolated VSIX subproject:

```powershell
cd vsix
npm install
npm run compile
```

The root project intentionally does not become an npm workspace for the extension.

### Debug Launch

Open the repository root in VSCode and select the `Run FinBox VSIX` debug configuration. The configuration points VSCode at the isolated extension subproject:

```json
"--extensionDevelopmentPath=${workspaceFolder}/vsix"
```

The Extension Development Host should show a `FinBox` Activity Bar entry and a native `FINBOX` TreeView.

### Package From Source

Build and package the extension from the VSIX subproject:

```powershell
cd vsix
npm install
npm run compile
npx @vscode/vsce package
```

The generated VSIX file is written under `vsix/` and named from `package.json` as `<name>-<version>.vsix`, for example `finbox-0.0.5.vsix`.

Install a generated VSIX with:

```powershell
code --install-extension .\finbox-0.0.5.vsix
```

Alternatively, use `Extensions -> ... -> Install from VSIX...` in VS Code.

### Version And Changelog Policy

- Do not bump the VSIX version for every source change.
- Bump `vsix/package.json` and `vsix/package-lock.json` only when preparing an installable or deliverable VSIX.
- Update `vsix/CHANGELOG.md` in the same change as the version bump.
- Keep `vsix/README.md` user-facing because VS Code displays it as the extension details page.
- Keep generated VSIX packages, `vsix/dist/`, and `vsix/node_modules/` out of source control.

Recommended release flow:

```powershell
cd vsix
npm version patch --no-git-tag-version
npm run compile
npx @vscode/vsce package
```

### Functional Checks

- Empty startup: the TreeView shows `FUND`, `STOCK`, and `SETTINGS` root nodes; `FUND` shows an empty state when no funds are saved.
- Add funds: entering `003026,110022,161725` adds valid codes and triggers quote refresh.
- Refresh: real-time estimate data updates without executing remote scripts in the extension UI.
- Add A-share stocks: entering `sh000001,sz000001` adds valid stock symbols under `STOCK -> A Stock` and shows percentage change, latest price, and stock name after refresh; prefixed symbols remain visible in tooltips and non-quote states.
- Stock ordering: stock rows preserve add order by default; context menu actions can move a stock up or down.
- Persistence: `Developer: Reload Window` preserves funds and groups through `globalState`.
- Single trend: clicking a fund tree item opens an editor webview with historical NAV trend data.
- Group trend: clicking a group tree item opens a group comparison editor webview.
- Removal: deleting a fund removes it from persisted state.
- Error handling: invalid input and network failures show recoverable UI states.

### Diagnostics

- Use `Developer: Toggle Developer Tools` in Extension Development Host for trend webview console errors.
- Use `View -> Output -> Log (Extension Host)` for extension host activation, command, fetch, and parsing errors.
