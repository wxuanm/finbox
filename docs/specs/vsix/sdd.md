# FinBox VSIX Spec-Driven Development

## Document Scope

- Spec namespace: `vsix`
- Spec path: `docs/specs/vsix/sdd.md`
- Related source path: `vsix/` planned
- Related baseline tool path: `/fundmonitor/`
- Related baseline API paths: `/api/fundgz`, `/api/fundnav`
- Status: Planned implementation

This document defines the VSIX adaptation of Fund Monitor. It does not replace the existing browser Fund Monitor spec under `docs/specs/fundmonitor/`. The browser tool remains the implementation baseline for fund data fields, grouping rules, and historical NAV calculations until the extension code establishes its own verified baseline.

## 1. Requirements Spec

### Product Identity

- Tool name: FinBox VSIX
- Chinese name: FinBox VSCode 插件
- Primary surface: VSCode sidebar plus editor webview
- Primary module: mutual fund real-time estimate monitoring and historical trend analysis inside VSCode

### Product Goal

The VSIX helps users keep a lightweight fund watchlist visible while working in VSCode. Real-time fund estimates are shown in the sidebar for quick triage. Historical trends and multi-fund comparisons open in the editor area for deeper analysis.

The extension should feel like a VSCode-native tool rather than a full browser dashboard embedded unchanged. The browser Fund Monitor is simplified into two plugin surfaces:

- Sidebar: compact monitoring, group navigation, add/remove/refresh actions.
- Editor area: historical NAV trend charts, fund details, and group trend comparison.

### Confirmed Decisions

- Development starts inside the existing repo on branch `feature/vsix`.
- The VSIX source lives in an isolated `vsix/` subproject rather than changing the repo root into an extension project.
- Existing browser Fund Monitor remains under `fundmonitor/` and must continue to work independently.
- The extension does not rely on Cloudflare Pages Functions at runtime.
- Extension host services fetch Eastmoney data directly and normalize responses.
- Webviews do not execute remote Eastmoney scripts through dynamic script injection.
- Core watchlist data is persisted through VSCode extension storage, not browser `localStorage`.
- Sidebar real-time estimates are the primary daily-use surface.
- Historical trend analysis opens in editor webviews.
- ECharts should be bundled locally for editor trend charts instead of loaded from CDN.
- Chinese UI is the initial default. English support can be deferred unless explicitly prioritized.

### In Scope

- Create a VSIX subproject under `vsix/`.
- Register a FinBox sidebar contribution.
- Show grouped fund estimates in the sidebar.
- Add one or more fund codes from the sidebar.
- Remove funds from monitoring.
- Create, rename, delete, and reorder custom groups when supported by the selected sidebar UI approach.
- Move funds between groups.
- Refresh all monitored funds manually.
- Persist fund codes, groups, fund-to-group mapping, and extension preferences with VSCode storage APIs.
- Fetch real-time fund data directly from Eastmoney in the extension host.
- Parse Eastmoney `fundinfo` JavaScript responses into structured data before sending to webviews.
- Open a single-fund historical trend view in the editor area.
- Open a group historical trend comparison view in the editor area.
- Fetch and normalize three-year historical NAV data in the extension host.
- Cache same-day historical NAV responses in extension-managed storage or memory.
- Use message passing between extension host and webviews.
- Show loading, empty, error, positive, negative, and neutral states.
- Preserve the browser tool's existing fund grouping semantics where applicable.

### Out Of Scope For MVP

- Rewriting the browser Fund Monitor.
- Migrating PAM into the extension.
- Cloud sync, login, or backend database persistence.
- Portfolio holdings, transactions, or cash-flow-adjusted account performance.
- Investment advice or buy/sell recommendations.
- Mobile responsive behavior inside VSCode.
- Full browser dashboard parity.
- Language switching if it slows the first usable extension release.
- Marketplace publishing automation.
- Alert rules and background notification scheduling.
- CSV or Excel import/export.

### Core User Stories

- As a user, I want to see selected funds in the VSCode sidebar so that I can monitor estimated changes without leaving the editor.
- As a user, I want funds grouped by strategy or account so that the sidebar remains readable.
- As a user, I want to refresh real-time estimates on demand so that displayed values are current.
- As a user, I want rising and falling funds to be visually distinct so that I can scan movement quickly.
- As a user, I want to add and remove fund codes from VSCode so that I do not need to edit configuration files manually.
- As a user, I want to click a fund and open its historical trend in the editor area so that I can inspect longer-term movement.
- As a user, I want to click a group and compare multiple funds' historical trends so that I can evaluate relative performance.
- As a user, I want my watchlist and groups to persist across VSCode restarts.
- As a user, I want network errors to be visible and recoverable so that stale data is not mistaken for fresh data.

## 2. Product Spec

### Information Architecture

```text
FinBox VSIX
├─ Activity Bar contribution
├─ Sidebar TreeView: FINBOX
│  ├─ FUND
│  │  ├─ Hidden/inline actions: refresh, add fund, add group
│  │  ├─ Group sections
│  │  │  ├─ Group summary
│  │  │  └─ Fund estimate rows
│  │  └─ Empty and error states
│  ├─ STOCK
│  │  ├─ A Stock group
│  │  ├─ Latest stock quote rows
│  │  └─ Empty and error states
│  └─ SETTINGS
│     └─ Placeholder for future extension settings
├─ Editor Webview: Fund Trend
│  ├─ Fund identity and latest metadata
│  ├─ Historical NAV chart
│  └─ Metrics summary
└─ Editor Webview: Group Trend
   ├─ Group identity
   ├─ Multi-fund historical chart
   └─ Comparison metrics
```

### Sidebar UX

The sidebar is optimized for compact monitoring and future expansion. The view title is `FINBOX`; product modules are grouped under root tree nodes `FUND`, `STOCK`, and `SETTINGS`.

MVP fund actions are exposed from the `FUND` node context or inline menu instead of the view title bar, keeping the plugin title clean and leaving room for future product areas.

Each fund row should show:

- Fund name
- Fund code
- Estimated percentage change
- Estimated NAV
- Last update state when available

Each group should show:

- Group name
- Fund count
- Optional group-level positive and negative counts
- Action to open group trend comparison

The `STOCK` view initially supports an `A Stock` group. Each stock row should show:

- Estimated percentage change
- Latest price
- Stock name
- Exchange-prefixed stock symbol, so duplicate numeric codes such as `sh000001` and `sz000001` remain distinguishable

Stock input requires `sh`/`sz` prefixed symbols. Stock rows keep the user's add order by default. Users can adjust the order through stock item context menu actions for moving a symbol up or down.

Each stock tooltip should show stock identity on the first line, then two-column metric rows for percentage change, price change, high, low, open, previous close, volume, and amount. Source and update time stay hidden from the tooltip.

A-share quote data is fetched in the extension host using the same source priority as `functions/api/quotes.js`: Sina quote data first, then Eastmoney single-stock quote data as fallback.

The sidebar should avoid heavyweight dashboard cards, large hero copy, mobile controls, and full-width tables from the browser page.

### Editor UX

Historical analysis opens as an editor webview panel.

Single-fund trend view should show:

- Fund name and code
- Manager names when available
- Fund scale when available
- Three-year NAV chart
- Period return and risk metrics derived from existing NAV metric logic
- Source update time and failed state if data cannot be loaded

Group trend view should show:

- Group name
- Included fund codes
- Multi-fund normalized return chart
- Comparison table or compact cards for key metrics
- Clear message when the group has no valid fund data

### Extension Data Model

```ts
interface FundMonitorState {
  schemaVersion: 1;
  groups: FundGroup[];
  fundGroups: Record<string, string>;
  preferences: FundMonitorPreferences;
}

interface FundGroup {
  id: string;
  name: string;
}

interface FundMonitorPreferences {
  refreshIntervalMinutes?: number;
  themeMode?: 'vscode' | 'light' | 'dark';
}
```

`default` remains a reserved group ID. Custom groups use stable IDs where practical, while display names can be renamed.

### Real-Time Fund Data Model

Extension host services should normalize Eastmoney real-time fields before sending them to webviews.

```ts
interface FundQuote {
  code: string;
  name: string;
  estimatedNav: string;
  estimatedChange: number | null;
  unitNav: string;
  unitNavDate: string;
  accumulatedNav: string;
  navChange: number | null;
  previousNav: string;
  previousNavDate: string;
  manager: string;
  source: 'eastmoney';
  updatedAt: string;
}
```

### Historical NAV Data Model

The extension should preserve the browser Fund Monitor normalized NAV response shape where possible.

```ts
interface FundNavResponse {
  range: '3y';
  source: 'eastmoney';
  updatedAt: string;
  funds: FundNav[];
  failedCodes: string[];
}

interface FundNav {
  code: string;
  name: string;
  manager: string;
  scale: null | {
    date: string;
    value: number;
  };
  items: Array<{
    date: string;
    unitNav: number | null;
    accNav: number | null;
    dailyReturn: number | null;
  }>;
}
```

### Commands

Initial command set:

| Command | Purpose |
| --- | --- |
| `finbox.open` | Open or reveal the FinBox sidebar/view |
| `finbox.fund.refresh` | Refresh all monitored funds |
| `finbox.fund.add` | Add fund code input flow |
| `finbox.fund.openTrend` | Open selected fund trend in editor area |
| `finbox.fund.openGroupTrend` | Open selected group trend comparison in editor area |
| `finbox.stock.refresh` | Refresh all monitored A-share stocks |
| `finbox.stock.add` | Add stock symbol input flow |
| `finbox.stock.remove` | Remove selected stock |
| `finbox.stock.moveUp` | Move selected stock up |
| `finbox.stock.moveDown` | Move selected stock down |

### Storage Rules

- Extension storage must tolerate missing or malformed data and fall back to a valid default group.
- The `default` group must always exist.
- Deleting a custom group moves contained funds back to `default`.
- Removing a fund deletes its group mapping.
- Real-time quote data is cacheable as transient runtime state but is not canonical user data.
- Historical NAV cache must be invalidated when the local date changes.

### Error States

- Missing watchlist: show an empty sidebar state with an add action.
- Real-time request failure: show per-fund error state where possible and a sidebar-level error summary when all requests fail.
- Historical NAV request failure: show editor-level retry action and failed code list.
- ECharts unavailable: show a readable fallback instead of blocking watchlist management.

### Acceptance Criteria

- The extension can be launched from VSCode with the FinBox sidebar visible.
- Adding a six-digit fund code persists it across VSCode reloads.
- Refreshing the sidebar fetches and displays real-time estimate data.
- Positive and negative changes are visually distinct.
- Clicking a fund opens an editor webview with historical trend data.
- Clicking a group opens an editor webview with historical comparison when the group has one or more funds.
- The extension does not require Cloudflare Pages Functions at runtime.
- The existing browser Fund Monitor still works after adding the extension subproject.
- User data survives malformed quote responses and temporary network failures.

## 3. Migration Notes

### Reuse From Browser Fund Monitor

- Eastmoney real-time request URL and chunking rules from `functions/api/fundgz.js`.
- Eastmoney historical NAV extraction from `functions/api/fundnav.js`.
- Historical metric helpers from `fundmonitor/js/utils/navMetrics.js` where practical.
- Formatting helpers and positive/negative display conventions.
- Group semantics from `docs/specs/fundmonitor/sdd.md`.

### Replace From Browser Fund Monitor

- Replace `/api/fundgz` script injection with extension-host `fetch` and parsing.
- Replace `/api/fundnav` browser fetch with extension-host service calls.
- Replace `localStorage` canonical persistence with VSCode `globalState`.
- Replace page-level dashboard with a compact sidebar monitor.
- Replace modal-based historical analysis with editor webview panels.
- Replace CDN ECharts with a bundled local asset.

### Preserve Separations

- Do not import runtime modules directly between `fundmonitor/` and `vsix/` unless the module is intentionally extracted into a shared, environment-neutral location.
- Do not make the browser Fund Monitor depend on VSCode APIs.
- Do not make the VSIX depend on Cloudflare Pages Functions.
