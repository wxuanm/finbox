# Portfolio Backtest Spec-Driven Development

## Document Scope

- Namespace: `backtest`
- Spec path: `docs/specs/backtest/`
- Tool path: `backtest/`
- API path: `/api/history`
- API source files: `functions/api/history.js`, `functions/api/_lib/eastmoneyScript.js`, `functions/api/_lib/quoteSources.js` (`getAshareExchangePrefix`)
- Status: implemented (v1)

## 1. Requirements Spec

### Product Identity

- Chinese name: 组合回测
- English name: Portfolio Backtest
- A standalone static tool, separate from Fund Monitor and PAM. It shares no code, state, or storage keys with them.

### Product Goal

Show how a target-weight portfolio of A-shares and funds would have performed historically, compare up to three portfolios side by side, and measure them against a market index.

### Confirmed Decisions

- Assets: A-shares (`CN`) and mutual funds/ETFs on the fund NAV feed (`Fund`).
- Prices include dividends:
  - A-shares use back-adjusted (后复权) daily closes.
  - Funds use a total-return series chained from Eastmoney's daily growth rate (`equityReturn`), which already accounts for dividends and unit splits. Unit NAV ratios are only a fallback for days without a growth rate.
- Benchmarks are price indices from a fixed allowlist and do not include dividends.
- Rebalancing modes: none, monthly, quarterly, yearly.
- Up to 3 portfolios per run, each with up to 20 assets.
- Portfolios and parameters persist in browser `localStorage`. Price data is not persisted.

### In Scope

- Backtest parameters: start date, end date, period presets (1Y/3Y/5Y/10Y/Max), initial amount, annual risk-free rate, and benchmark.
- Portfolio editor: name, rebalance mode, asset rows (type, 6-digit code, weight %), equal-weight button, running weight total, add/duplicate/remove portfolio.
- Results:
  - Metrics: final value, total return, CAGR, max drawdown, annualized volatility, Sharpe, Calmar, best year, worst year.
  - Charts: cumulative return (with zoom), drawdown, annual returns.
  - Tables: returns by year, and per-asset start weight, end weight, and period return.
- Notices for late-listed assets and for aligned start dates. Errors for failed assets.
- Chinese/English UI, light/dark theme, desktop and phone layouts.

### Out Of Scope

- Regular contributions (DCA), transaction costs, taxes, slippage, and cash drag.
- Intraday or non-close execution.
- Markets other than A-shares and on-feed funds (HK, US, bonds as individual securities).
- Total-return benchmark indices.
- Importing holdings from PAM.
- Shareable URLs and cloud sync.

### Core User Stories

- As an investor, I enter a few A-shares and funds with target weights and see how the mix would have performed.
- I compare quarterly rebalancing against buy-and-hold for the same assets.
- I see whether a portfolio beat 沪深300 over the same period.
- I see which calendar years were good or bad, and how far the portfolio fell at its worst.

## 2. Product Spec

### Page Structure

- Header: title, description, theme toggle, language toggle.
- Config panel (left on desktop, top on phone): parameters, benchmark, portfolio cards, run button with an inline validation error.
- Results panel (right on desktop, below on phone):
  1. Run messages (errors, then notices).
  2. Metrics table on desktop; one metric card per portfolio and benchmark on phone (≤640px).
  3. Cumulative return chart, drawdown chart, annual returns chart.
  4. Returns-by-year table (partial years marked `*`).
  5. Collapsible per-portfolio asset details.

### Portfolio Data Model

```js
{
  id: 'p…',                 // stable id
  name: '',                 // optional; empty shows "组合 N" / "Portfolio N"
  rebalance: 'none' | 'monthly' | 'quarterly' | 'yearly',
  assets: [{ market: 'CN' | 'Fund', code: '600519', weight: 50 }],
  index: 1                  // 1-based position; drives default name and series colour
}
```

### Params Data Model

```js
{ start: 'YYYY-MM-DD', end: 'YYYY-MM-DD', initialAmount: 100000, riskFree: 0 /* % */, benchmark: '000300' | '' }
```

### Benchmarks

| Code | 中文 | English |
|---|---|---|
| 000300 | 沪深300 | CSI 300 |
| 000905 | 中证500 | CSI 500 |
| 000852 | 中证1000 | CSI 1000 |
| 000016 | 上证50 | SSE 50 |
| 000001 | 上证指数 | SSE Composite |
| 399006 | 创业板指 | ChiNext |

## 3. Data And Calculation Spec

### Price Series

- Every series is ascending `[date, value]` pairs; dates are `YYYY-MM-DD` in Asia/Shanghai.
- A fund series starts at the first unit NAV, then compounds `1 + equityReturn / 100` each day.

### Simulation

1. **Calendar**: the union of all trading dates of the portfolio's assets within the range. Each asset's price is forward-filled over days it has no point (holiday differences, QDII funds, suspensions).
2. **Effective start**: the latest first-available date across the portfolio's assets. An asset whose data starts more than 7 days after the requested start is reported as late-listed.
3. **Carry-in**: when the start is moved later (for example, to align portfolios), an asset with no point on that exact day uses its last earlier value.
4. **Effective end**: the earliest last-available date across assets.
5. **Day 0**: units = `initialAmount × weight / price`. Weights are normalized to sum to 1.
6. **Rebalancing**: on the first calendar trading day of a new month, quarter, or year, units are reset to target weights at that day's close.
7. **Value**: `Σ units × price` each day; NAV = value / initialAmount.

### Multi-Portfolio Alignment

- Each portfolio is first simulated on the requested range to find its effective start and end.
- When more than one portfolio runs, all portfolios and the benchmark are re-simulated from the latest effective start to the earliest effective end, so every metric covers the same period. A notice states the shared start date when alignment moved any portfolio.
- The benchmark is a single-asset portfolio with no rebalancing.

### Metrics

- Total return: `NAV_end / NAV_start − 1`.
- CAGR: `(NAV_end / NAV_start)^(1 / years) − 1`, with `years = calendar days / 365.25`.
- Max drawdown: the minimum of `NAV / running peak − 1`, with its peak and trough dates.
- Annualized volatility: sample standard deviation of daily returns × √252.
- Sharpe: `(CAGR − risk-free) / volatility`.
- Calmar: `CAGR / |max drawdown|`.
- Calendar-year return: last NAV of the year ÷ last NAV of the previous year (or the first NAV) − 1.
  - The first year is partial when it starts after Jan 10. The last year is partial when it ends before Dec 20.
  - Best and worst year exclude partial years, unless only one year exists.

### Invalid And Error Cases

- Start date not before end date → blocked with an inline error.
- Initial amount ≤ 0 → blocked.
- Weight total not 100% (±0.01), a zero weight, a non-6-digit code, or a duplicate asset in one portfolio → blocked, naming the portfolio.
- An asset that fails to load → listed in an error; any portfolio containing it is skipped; other portfolios still run.
- Assets that share no trading days → an error for that portfolio.
- Benchmark failure → error message; portfolios still render.
- Chart library unavailable → one notice; all tables still render.

### Data Versioning

- Storage values are wrapped as `{ schemaVersion: 1, data }`. A mismatched version falls back to defaults.

## 4. Technical Design Draft

See `technical-design.md`.

### Storage Keys

- `backtest:v1:config`: `{ params, portfolios }`
- `backtest:v1:preferences`: `{ lang, theme }`

### Dependencies

- ECharts 5.6.0, loaded at runtime from cdnjs with unpkg as fallback.
- Eastmoney kline and fund NAV endpoints, through `/api/history`.

## 5. Acceptance Criteria

### Functional Acceptance

- A single 100% A-share portfolio without rebalancing returns exactly `last / first` of its back-adjusted series.
- Duplicate, add, and remove portfolio work; add is hidden at 3 portfolios, and remove is disabled with 1.
- A late-listed asset produces a notice, and every result starts on the same date.
- Selecting "None" as benchmark removes the benchmark row, line, and bars.
- Config, theme, and language survive a reload.

### Data Acceptance

- On dividend and split days, fund series follow `equityReturn`, not the unit NAV jump.
- Partial years are marked and excluded from best/worst year.

### UI Acceptance

- No horizontal page overflow at 400px; wide tables scroll inside their own container.
- Phone shows metric cards instead of the wide metrics table.
- Charts re-render with theme colours after a theme switch.
- Run messages re-translate after a language switch.
