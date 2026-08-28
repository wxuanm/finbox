# Fund Monitor Spec-Driven Development

## Document Scope

- Spec namespace: `fundmonitor`
- Spec path: `docs/specs/fundmonitor/sdd.md`
- Related tool path: `/fundmonitor/`
- Related API paths: `/api/fundgz`, `/api/fundnav`
- Related API source files: `functions/api/fundgz.js`, `functions/api/fundnav.js`
- Status: Current implementation baseline

This document belongs only to Fund Monitor. Other FinBox tools should use their own folders under `docs/specs/<tool-name>/` to avoid naming, storage, and acceptance-criteria conflicts.

## 1. Requirements Spec

### Product Identity

- Tool name: Fund Monitor
- Chinese name: 基金实时监控面板
- Path: `/fundmonitor/`
- Primary module: mutual fund real-time monitoring and group comparison

### Product Goal

Fund Monitor helps users track selected mutual funds in a browser dashboard, review real-time NAV-related fields, organize funds into custom groups, and compare group-level fund returns and historical NAV trends.

The current implementation focuses on a local-first watchlist. User-selected fund codes, groups, theme, language, and daily NAV trend cache are stored in browser `localStorage`. Market and NAV data are fetched through Cloudflare Pages Functions that proxy Eastmoney endpoints.

### Confirmed Decisions

- Fund Monitor is an independent static tool under `/fundmonitor/`.
- The UI supports Chinese and English.
- The default language is Chinese when no saved preference exists.
- The default theme is light when no saved preference exists.
- User watchlist data is local-only and stored in browser `localStorage`.
- Fund market data is not persisted as canonical user data; it is refreshed from Eastmoney through `/api/fundgz`.
- Historical NAV comparison data may be cached locally for the current date using `fund-nav-3y:*` keys.
- Custom group deletion does not remove funds from monitoring. Funds in the deleted group move back to the default group.
- The default group is immutable.
- The default group is hidden when it is empty and at least one custom group exists.
- PAM is independent from Fund Monitor and must not reuse Fund Monitor runtime state, storage keys, or business modules.

### In Scope

- Open the Fund Monitor page at `/fundmonitor/`.
- Add one or more fund codes to a watchlist.
- Batch-add fund codes using comma-separated input.
- Organize funds into groups.
- Create, rename, reorder, and delete custom groups.
- Move an existing fund into another group by adding it from that target group.
- Remove a fund from monitoring.
- Show a dashboard summary with monitored count, rising count, falling count, and latest refresh time.
- Show fund rows with name, code, estimated NAV, estimated change, latest NAV, NAV change, previous NAV, and fund manager.
- Sort desktop table columns.
- Show desktop group-title tooltip with all funds' estimated changes only when a group is collapsed, without changing group expand/collapse clicks.
- Show loading, error, global empty, and empty custom group states.
- Support group collapse and expansion during the current runtime session.
- Support mobile compact rows with tap-to-open full details.
- Support mobile pull-to-refresh.
- Support light and dark themes.
- Support Chinese and English UI.
- Support group return comparison through a modal.
- Support historical NAV trend comparison through a modal.
- Use ECharts for historical trend charts.
- Proxy Eastmoney real-time and period-return data through `/api/fundgz`.
- Proxy Eastmoney three-year NAV trend data through `/api/fundnav`.

### Out Of Scope

- Login or user accounts.
- Cloud sync.
- Backend database persistence.
- Manual fund transaction tracking.
- Portfolio position or asset allocation management.
- Cash-flow-adjusted account performance calculation.
- CSV or Excel import/export.
- User-defined alert rules.
- Server-side scheduled data collection.
- Investment advice or buy/sell recommendations.
- Reusing PAM account, snapshot, or unit-NAV modules.

### Core User Stories

- As a user, I want to add fund codes so that I can monitor selected mutual funds in one place.
- As a user, I want to group funds so that I can separate different strategies, accounts, or watch themes.
- As a user, I want real-time estimated changes and latest NAV fields so that I can quickly understand current fund movement.
- As a user, I want sortable rows so that I can rank funds by change, NAV, name, or manager.
- As a user, I want to compare period returns inside a group so that I can evaluate short-term and long-term relative performance.
- As a user, I want to view historical NAV trends so that I can inspect return curves, drawdowns, volatility, and quality metrics.
- As a mobile user, I want compact rows and pull-to-refresh so that the page remains usable on touch devices.
- As a user, I want theme and language preferences to persist so that the tool opens in my preferred mode.

## 2. Product Spec

### Information Architecture

```text
Fund Monitor
├─ Header
│  ├─ Product identity
│  ├─ Theme switch
│  ├─ Language switch
│  ├─ New group action
│  └─ Refresh action
├─ Dashboard summary
├─ Grouped fund table
│  ├─ Default group
│  ├─ Custom groups
│  ├─ Inline add fund row
│  ├─ Inline new group row
│  ├─ Inline rename group row
│  └─ Inline delete group confirmation row
└─ Analysis modal
   ├─ Period return comparison
   └─ Historical NAV trend comparison
```

### Page Structure

```text
/fundmonitor/
├─ Pull refresh indicator
├─ Header: title, description, actions
├─ Summary cards: total, rising, falling, latest refresh
├─ Fund table: grouped sections and fund rows
└─ Modals: add/edit/confirm actions plus group return or historical trend analysis
```

UI direction:

- Keep the main screen optimized for fast monitoring and triage.
- Keep group actions compact in the table header while opening add/edit/confirm tasks in PAM-style dialogs.
- Use clear positive, negative, neutral, loading, and error visual states.
- Preserve desktop table density while using mobile cards/details for touch readability.

### Runtime State Model

```js
{
  currentTheme: "light",
  currentLang: "zh",
  fundCodes: new Set(),
  groups: ["default"],
  fundGroups: {},
  groupExpanded: {},
  activeGroup: "default",
  currentSortColumn: 2,
  sortOrder: -1
}
```

### Fund Row Data Model

Fund rows are rendered from Eastmoney `fundinfo` string fields returned by `/api/fundgz`.

```js
{
  fundCode: "003026",
  fundName: "基金名称",
  estimatedNav: "1.2345",
  estimatedChange: "1.23",
  unitNav: "1.2200",
  unitNavDate: "2026-08-05",
  accumulatedNav: "1.5000",
  navChange: "0.75",
  previousNav: "1.2110",
  previousNavDate: "2026-08-04",
  fundManager: "基金经理"
}
```

### Group Data Model

```js
{
  groups: ["default", "稳健组合", "进攻组合"],
  fundGroups: {
    "003026": "稳健组合",
    "001123": "default"
  }
}
```

### Historical NAV Data Model

`/api/fundnav` returns normalized JSON for up to 10 fund codes.

```js
{
  range: "3y",
  source: "eastmoney",
  updatedAt: "2026-08-05T10:00:00.000Z",
  funds: [
    {
      code: "003026",
      name: "基金名称",
      manager: "基金经理",
      scale: {
        date: "2026-06-30",
        value: 12.34
      },
      items: [
        {
          date: "2026-08-05",
          unitNav: 1.2345,
          accNav: 1.5678,
          dailyReturn: 0.5
        }
      ]
    }
  ],
  failedCodes: []
}
```

### Field Definitions

| Field | Meaning | Rule |
| --- | --- | --- |
| Fund code | Mutual fund code | Stored as trimmed string; `/api/fundnav` accepts only six-digit codes |
| Group ID | Group display name and identifier | `default` is reserved; custom names must be non-empty and unique |
| Estimated NAV | Intraday estimated NAV | Display from Eastmoney when available |
| Estimated change | Intraday estimated percentage change | Drives rising and falling dashboard counts |
| Unit NAV | Latest disclosed unit NAV | Display with NAV date |
| Accumulated NAV | Accumulated NAV | Preferred for historical normalized return calculations when available |
| NAV change | Latest disclosed NAV percentage change | Display as positive, negative, or neutral |
| Previous NAV | Previous disclosed unit NAV | Display with previous NAV date |
| Fund manager | Manager names | Display as compact pill or `-` |
| Fund scale | Fund scale in 100M CNY | Extracted for NAV trend cards when available |

### Default Copy

Main title:

```text
基金实时监控面板
```

Subtitle:

```text
聚焦净值、估算涨幅与基金经理信息，用更清晰的视觉层级和更高效的表格浏览体验，帮助你快速发现重点基金动态。
```

Global empty state:

```text
暂无监控基金
点击顶部“+”新建分组，或点击分组行右侧的“+”添加基金代码，开始查看实时净值和涨跌幅。
```

Empty custom group state:

```text
此分组暂无基金
点击本分组右侧的“+”添加基金代码。
```

Historical NAV notice:

```text
历史净值可能延迟，以基金公司披露为准。
```

## 3. Data And Calculation Spec

### Real-Time Fund Data

- The browser requests `/api/fundgz?code=<codes>&rt=<timestamp>` by injecting a script tag.
- The API returns JavaScript with `var fundinfo = [...]` for normal monitoring data.
- The browser reads `window.fundinfo`, splits each fund string by comma, and updates matching rows.
- If the request or parsing fails, affected rows enter an error state.
- Batch refresh sends all monitored fund codes in one request when possible.

### Period Return Comparison

- The browser requests `/api/fundgz?code=<codes>&t=1&rt=<timestamp>` by injecting a script tag.
- The API returns Eastmoney period-return data as JavaScript.
- The modal reads `window.fundinfo_yjpj.jdsy` and maps rows to YTD, 1W, 1M, 3M, 6M, 1Y, 2Y, 3Y, 5Y, and inception returns.
- Desktop comparison rows are sortable by fund name or return period.
- Mobile comparison cards support chip-based sorting.
- Group period-return comparison is limited to 10 funds in the UI.

### Historical NAV Trend Comparison

- The browser requests `/api/fundnav?code=<codes>` through `fetch`.
- `/api/fundnav` accepts up to 10 unique six-digit codes.
- The API fetches Eastmoney `pingzhongdata/<code>.js` scripts.
- The API extracts fund name, current manager, fund scale, unit NAV trend, and accumulated NAV trend.
- Data is normalized to the latest three-year window based on the newest available timestamp.
- Unit NAV and accumulated NAV points are merged by date.
- Accumulated NAV is preferred over unit NAV for normalized return calculations when available.
- Historical trend charts use straight line segments rather than smoothed curves to avoid implying unavailable prices between disclosed NAV points.
- Historical trend charts label latest and highest return values only when one fund is shown, when a fund is selected, or while a fund legend item is hovered in a multi-fund chart; when the highest point is also the latest point, only one value is shown.
- Historical trend charts always show an annualized 10% benchmark curve, calculated from the chart range start as compound growth over elapsed calendar days.
- Partial failures return successful funds plus `failedCodes`.

### NAV Metric Rules

- Sort NAV points by date ascending before calculation.
- Ignore points without a valid date or positive NAV value.
- Build normalized return series from `value / firstValue - 1`.
- Use accumulated NAV when present, otherwise unit NAV.
- Calculate max drawdown from the selected point sequence.
- Calculate period returns for `YTD`, `1W`, `1M`, `3M`, `6M`, `1Y`, and `3Y` using the first point inside the lookback window, or the latest point before the window as fallback when no inside point exists. `YTD` starts from January 1 of the latest NAV data year.
- Keep historical trend Y-axis bounds based on the current visible returns plus modest padding and integer, evenly spaced ticks, avoiding excessive blank space on short periods such as `1M`.
- Calculate annualized volatility from point-to-point returns and annualize with `sqrt(252)`.
- Calculate up-day ratio as positive point-to-point returns divided by all point-to-point returns.
- Calculate Calmar ratio as period return divided by absolute max drawdown when max drawdown is negative.

### Dashboard Metric Rules

- Monitored count equals `state.fundCodes.size`.
- Rising count equals rows where estimated change cell contains a positive value state.
- Falling count equals rows where estimated change cell contains a negative value state.
- The rising card tooltip shows up to three funds with the largest positive estimated changes when they exist.
- The falling card tooltip shows up to three funds with the smallest negative estimated changes when they exist.
- Latest refresh time updates when `refreshData()` runs after restoring or refreshing the watchlist.

### Sorting Rules

- Desktop table defaults to estimated change descending.
- Clicking the same sortable column toggles sort direction.
- Numeric sorting extracts the first signed numeric value from cell text.
- Non-numeric sorting uses locale-aware string comparison with numeric ordering.
- Sorting is applied independently within each group section.

### Invalid And Error Cases

- Empty fund-code input does nothing.
- Failed real-time data requests mark affected rows as error rows.
- Missing `window.fundinfo` after script load marks the request as failed.
- Empty group comparison shows a user alert.
- More than 10 funds in a comparison or trend request shows a user alert.
- `/api/fundnav` rejects missing or more than 10 valid codes.
- `/api/fundnav` returns partial success when at least one fund succeeds.
- Malformed or unavailable localStorage values fall back to safe defaults.

### Data Versioning

Current Fund Monitor storage keys are unversioned. Future storage changes should either introduce versioned keys or provide migration logic before changing persisted shapes.

## 4. Technical Design Draft

### Directory Structure

```text
fundmonitor/
├─ index.html
├─ css/
│  ├─ variables.css
│  └─ main.css
└─ js/
   ├─ app.js
   ├─ api/
   │  ├─ fundApi.js
   │  └─ fundNavApi.js
   ├─ config/
   │  ├─ i18n.js
   │  └─ state.js
   ├─ core/
   │  └─ theme.js
   ├─ ui/
   │  ├─ dashboard.js
   │  ├─ fundTable.js
   │  └─ modal.js
   └─ utils/
      ├─ formatter.js
      ├─ navMetrics.js
      └─ storage.js

functions/
└─ api/
   ├─ fundgz.js
   └─ fundnav.js
```

### Storage Keys

```text
fund-monitor-saved-codes
fund-monitor-groups
fund-monitor-fund-groups
fund-monitor-theme
fund-monitor-lang
fund-nav-3y:<sorted-codes>
```

Legacy `fund-nav-1y:*` keys may be removed during NAV cache cleanup.

### Dependencies

- Native ES modules.
- ECharts CDN for NAV trend charts.
- Browser `localStorage`.
- Cloudflare Pages static hosting.
- Cloudflare Pages Functions for API proxying.
- Eastmoney public fund data pages and endpoints.

## 5. Acceptance Criteria

### Functional Acceptance

- `/fundmonitor/` opens the Fund Monitor page.
- Users can create a custom group.
- Users can add one or more fund codes to the default group or a custom group.
- Adding an existing fund from another group moves it to the target group.
- Users can rename, move up, move down, and delete custom groups.
- Deleting a custom group moves its funds to the default group.
- Users can remove a fund from monitoring after confirmation.
- Refresh reloads all monitored fund rows.
- Dashboard count reflects monitored funds.
- Rising and falling counts update from estimated change states.
- Desktop table sorting works within groups.
- Group collapse and expansion work during the runtime session.
- Theme switch persists after refresh.
- Language switch persists after refresh.
- Mobile pull-to-refresh calls the same refresh flow as the refresh button.
- Mobile row tap opens inline fund details.
- Group return comparison opens a modal for groups with 1 to 10 funds.
- Historical trend comparison opens a modal for groups with 1 to 10 funds.
- Closing the modal cancels stale modal updates from older async requests.

### Data Acceptance

- Saved fund codes load from `fund-monitor-saved-codes` and ignore malformed storage.
- Saved groups load from `fund-monitor-groups` only when they include `default`.
- Saved fund-to-group mapping loads from `fund-monitor-fund-groups` and falls back to `{}` on parse errors.
- `/api/fundgz` returns JavaScript for valid code requests.
- `/api/fundgz` splits more than 10 monitoring codes into Eastmoney-compatible chunks when `t=0`.
- `/api/fundnav` accepts up to 10 six-digit codes.
- `/api/fundnav` returns JSON with `funds` and `failedCodes`.
- NAV metrics ignore invalid or non-positive NAV points.
- NAV trend cache is scoped by sorted unique fund code list and current date, and stale response timestamps are ignored.

### UI Acceptance

- Global empty state appears when there are no funds and only the default group exists.
- Empty custom groups show inline empty guidance.
- The default group hides when it is empty and custom groups exist.
- Loading fund rows show a loader until data or error arrives.
- Failed rows show a localized error message.
- Positive and negative percentages use distinct visual states.
- Desktop layout keeps the grouped table readable.
- Mobile layout remains usable for adding funds, refreshing, reading rows, and opening analysis.
- ECharts loading failure does not prevent watchlist management.

## 6. Implementation Tasks Draft

- Document current Fund Monitor requirements and product behavior.
- Document current Fund Monitor technical design.
- Document implementation task status.
- Keep `fundmonitor` docs independent from `pam` docs.
- Review storage keys and API paths against implementation.
- Review UI modules and data flow against implementation.
- Run local static verification after future behavior changes.
