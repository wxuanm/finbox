# Portfolio Backtest Technical Design

## Scope

- Static ES-module tool at `backtest/`, with no build step.
- One Pages Function, `functions/api/history.js`, supplies all price history.
- The simulation and metrics modules are pure (no DOM, `state`, i18n, or local-timezone helpers), so they can be tested in Node and reused server-side if needed.

## Architecture

```text
backtest/
├─ index.html                # Page shell; inline script applies saved dark theme before first paint
├─ css/
│  ├─ variables.css          # Light tokens + [data-theme="dark"]; red = up, green = down
│  └─ main.css               # Layout, components, ≤960px stacking, ≤640px phone layout
└─ js/
   ├─ app.js                 # Boot, events, run orchestration, ECharts loader
   ├─ api/historyApi.js      # /api/history client, 25-item chunks, in-memory cache
   ├─ config/
   │  ├─ i18n.js             # zh/en strings + t(lang, key, values)
   │  └─ state.js            # Runtime state, defaults, sanitizers, benchmarks list
   ├─ engine/
   │  ├─ backtestEngine.js   # runBacktest(): calendar, forward fill, rebalancing
   │  └─ metrics.js          # computeMetrics(): returns, drawdown, volatility, yearly
   ├─ ui/
   │  ├─ portfolioEditor.js  # Portfolio cards, validation, delegated editor events
   │  └─ results.js          # Messages, metric table/cards, charts, yearly and asset tables
   └─ utils/
      ├─ formatter.js        # Percent/money/ratio formatting, escapeHtml, trend class
      └─ storage.js          # { schemaVersion: 1, data } localStorage wrapper
```

## Runtime State

```js
state = {
  lang: 'zh' | 'en',
  theme: 'light' | 'dark',
  params: { start, end, initialAmount, riskFree, benchmark },
  portfolios: [/* see SDD */],
  names: { 'CN:600519': '贵州茅台' },          // resolved from API responses
  lastRun: { results, notices, errors, inputs, configSnapshot } | null,
  running: false
}
```

- `lastRun.inputs` holds the fetched series and run parameters. On a language switch, `buildRun` re-runs from these inputs so messages and labels re-translate without a refetch.
- That only happens when `configSnapshot` still matches the current portfolios. Otherwise only names and labels are refreshed, so edits made after a run are never silently applied.

## Persistence

| Key | Value |
|---|---|
| `backtest:v1:config` | `{ schemaVersion: 1, data: { params, portfolios } }` |
| `backtest:v1:preferences` | `{ schemaVersion: 1, data: { lang, theme } }` |

- Loaded values are sanitized: at most 3 portfolios and 20 assets each, only known markets and rebalance modes, and a benchmark from the allowlist (or empty).
- Price series are kept only in the session's memory cache, one entry per `market:symbol` together with the start it was fetched from. A later start is served by slicing the cached points (values do not depend on `start`); only an earlier start, or an item not yet loaded, triggers a fetch.

## Boot Flow

1. The inline head script reads `backtest:v1:preferences` and sets `data-theme="dark"` before CSS paints.
2. `app.js` applies theme and language, renders params and portfolio cards, then the empty results state.
3. ECharts loads in the background (cdnjs, then unpkg, 10 s per source). Load failure never blocks the page.

## Run Flow

1. Validate params and every portfolio; stop at the first error.
2. Collect unique asset keys plus the benchmark (`Index:<code>`), then fetch them through `historyApi.fetchHistory`.
3. `buildRun`, pass 1: simulate each portfolio on the requested range to get its effective start and end and its late-listed assets.
4. `buildRun`, pass 2: re-simulate every portfolio, and the benchmark, on `[latest start, earliest end]`. A portfolio already on that range reuses its pass-1 result.
5. Compute metrics, then render.

## Module Responsibilities

### `backtestEngine.js`

- `runBacktest({ assets, prices, start, end, initialAmount, rebalance })` returns:
  - `dates`, `values`, `nav`, `rebalanceDates`
  - `effectiveStart`, `effectiveEnd`, `lateAssets`
  - `startWeights`, `endWeights`, `assetReturns`
- An asset with `cash: true` has a constant price of 1 and no series; only priced assets build the calendar and bound the period.
- Throws `BacktestError` with code `noAssets` (also for cash-only), `badRebalance`, `noData`, or `noOverlap`.
- `periodKey(date, mode)` decides rebalance boundaries by string slicing, never `Date` in local time.

### `metrics.js`

- `computeMetrics(dates, nav, riskFreeRate)` returns:
  - `totalReturn`, `cagr`, `volatility`, `sharpe`, `calmar`
  - `maxDrawdown` with peak and trough dates, plus the `drawdownSeries`
  - `yearly` (with `partial` flags), `bestYear`, `worstYear`

### `results.js`

- Renders both the desktop metrics table and the phone metric cards; CSS shows one at a time.
- Keeps ECharts instances in a map, disposes them before each render, and resizes all of them on window resize.
- Reads chart colours from CSS variables at render time, which is why theme toggles re-render.
- Benchmark styling: dashed line, outlined dashed bars, dashed dot.

### `portfolioEditor.js`

- `renderPortfolioEditor` builds one card. `bindPortfolioEditor` installs delegated `input`, `change`, and `click` handlers once on the list container.
- Typing in a name, code, or weight updates the DOM in place, so focus is kept. Changing a market or adding or removing rows re-renders the list.
- `cashWeight(portfolio)` = `100 − weightTotal`, floored at 0. It drives the read-only cash row; `app.js` `buildRun` appends it as a `cash: true` asset (key `Cash`) when positive. Cash is never persisted.

## API Design: `/api/history`

- `GET /api/history?items=CN:600519,Fund:110011,Index:000300&start=YYYY-MM-DD`
- Rules:
  - At most 25 unique items; codes must be 6 digits.
  - `Index` codes must be on the `INDEX_SECIDS` allowlist.
  - `start` defaults to 10 years ago.
- Sources:
  - `CN`: Eastmoney `push2his` kline, `klt=101`, `fqt=2` (back-adjusted). The `secid` prefix comes from `getAshareExchangePrefix`.
  - `Index`: same endpoint with `fqt=0` and the allowlisted `secid`.
  - `Fund`: `pingzhongdata/<code>.js`, full `Data_netWorthTrend` with no 3-year cutoff, chained by `chainFundTrend`.
- Response:
  ```js
  { source: 'eastmoney', start, updatedAt,
    series: [{ market, symbol, name, adjust: 'hfq' | 'none' | 'nav-chained', points: [[date, value]] }],
    failedItems: [{ market, symbol, error }] }
  ```
- Status codes:
  - 200 when at least one series succeeds; otherwise 502.
  - 400 for invalid items, an invalid `start`, or more than 25 items.
- Caching: `Cache-Control: public, max-age=3600` only when every item succeeds; otherwise `no-store`.
- Each upstream request has a 10 s `AbortController` timeout. Requests run in parallel with `Promise.allSettled`.

## Responsive Behavior

- ≤960px: the config and results panels stack.
- ≤640px:
  - Metric cards replace the metrics table, and the description text is hidden.
  - Charts get shorter.
  - The yearly table's first column becomes sticky.
- Wide tables always scroll inside `.table-scroll`; the page itself never scrolls horizontally.

## Verification

- Engine: synthetic cases with known answers, run in Node against the pure modules:
  - single asset equals last/first
  - buy-and-hold weight drift
  - monthly rebalance against a manual calculation
  - late listing and the forward-filled calendar
  - carry-in start
  - drawdown and yearly chaining
- API: run `npx wrangler pages dev .` and call `/api/history` for valid, failing, and invalid inputs. Confirm `/api/fundnav` output is unchanged.
- UI: at 1366px and 400px, in light and dark, in zh and en, check:
  - the single-asset result matches the API series
  - 3-portfolio comparison with the benchmark
  - the late-listing notice
  - weight validation and a failed asset
  - ECharts blocked
