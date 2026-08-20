# FinBox VSIX Technical Design

## Scope

- Tool: FinBox Fund Monitor VSIX
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
│  │  └─ storageService.ts
│  ├─ state/
│  │  └─ fundMonitorStore.ts
│  ├─ views/
│  │  └─ fundMonitorTreeProvider.ts
│  └─ webviews/
│     └─ trendPanel.ts
└─ media/
   └─ trend/
      ├─ trend.css
      ├─ trend.js
      └─ echarts.min.js
```

The source layout may be adjusted during implementation, but these boundaries should remain stable:

- Extension host owns commands, storage, network access, parsing, caching, and cross-webview coordination.
- Native TreeView owns compact watchlist rendering and VSCode context menu interactions.
- Trend editor webview owns chart rendering and historical analysis presentation.

## VSCode Contributions

Expected `package.json` contributions:

```json
{
  "activationEvents": [
    "onView:finboxFundMonitor.sidebar",
    "onCommand:finboxFundMonitor.open",
    "onCommand:finboxFundMonitor.refresh"
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
          "id": "finboxFundMonitor.sidebar",
          "name": "Fund Monitor"
        }
      ]
    },
    "commands": [
      {
        "command": "finboxFundMonitor.open",
        "title": "FinBox: Open Fund Monitor"
      },
      {
        "command": "finboxFundMonitor.refresh",
        "title": "FinBox: Refresh Fund Monitor"
      },
      {
        "command": "finboxFundMonitor.addFund",
        "title": "FinBox: Add Fund"
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

Suggested key:

```text
finbox.fundMonitor.state
```

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

## Message Protocol

The native TreeView does not use webview message passing. User actions are routed through VSCode commands registered by `extension.ts`, and tree refreshes are driven by the store's `onDidChange` event.

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

### Debug Launch

Open the repository root in VSCode and select the `Run FinBox VSIX` debug configuration. The configuration points VSCode at the isolated extension subproject:

```json
"--extensionDevelopmentPath=${workspaceFolder}/vsix"
```

The Extension Development Host should show a `FinBox` Activity Bar entry and a native `FINBOX` TreeView.

### Functional Checks

- Empty startup: the TreeView shows `FUND`, `STOCK`, and `SETTINGS` root nodes; `FUND` shows an empty state when no funds are saved.
- Add funds: entering `003026,110022,161725` adds valid codes and triggers quote refresh.
- Refresh: real-time estimate data updates without executing remote scripts in the extension UI.
- Persistence: `Developer: Reload Window` preserves funds and groups through `globalState`.
- Single trend: clicking a fund tree item opens an editor webview with historical NAV trend data.
- Group trend: clicking a group tree item opens a group comparison editor webview.
- Removal: deleting a fund removes it from persisted state.
- Error handling: invalid input and network failures show recoverable UI states.

### Diagnostics

- Use `Developer: Toggle Developer Tools` in Extension Development Host for trend webview console errors.
- Use `View -> Output -> Log (Extension Host)` for extension host activation, command, fetch, and parsing errors.
