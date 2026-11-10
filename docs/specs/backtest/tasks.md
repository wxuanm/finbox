# Portfolio Backtest Implementation Tasks

## Phase 1: Data API

- [x] Move Eastmoney script parsing helpers to `functions/api/_lib/eastmoneyScript.js`; `fundnav.js` imports them with unchanged output.
- [x] Export `getAshareExchangePrefix` from `functions/api/_lib/quoteSources.js`.
- [x] Add `functions/api/history.js`: back-adjusted A-share closes, allowlisted index closes, chained fund total-return series.
- [x] Validate items, the 25-item limit, and `start`; report partial failures in `failedItems`; time out upstream requests after 10 s.
- [x] Verify fund chaining against dividend and split days (510300 split on 2012-05-10).

## Phase 2: Engine And Single Portfolio

- [x] Pure `runBacktest`: union calendar, forward fill, late-listing start, none/monthly/quarterly/yearly rebalancing.
- [x] Pure `computeMetrics`: total return, CAGR, drawdown, volatility, Sharpe, Calmar, yearly returns.
- [x] Page skeleton, theme tokens, zh/en strings, versioned storage.
- [x] Portfolio editor with weight validation and equal weight.
- [x] Metrics table, asset table, cumulative return chart with the PAM-style ECharts loader.

## Phase 3: Benchmark And Comparison

- [x] Benchmark select (allowlisted indices) drawn dashed, plus a benchmark row.
- [x] Up to 3 portfolios with add, duplicate, and remove; a series colour per portfolio.
- [x] Align all portfolios and the benchmark to a shared period; carry-in pricing for a shifted start.
- [x] Drawdown chart, annual returns chart, returns-by-year table with partial-year markers.
- [x] Skip portfolios that contain failed assets while still running the others.

## Phase 4: Polish And Docs

- [x] Phone layout: metric cards instead of the wide table, sticky first column on the yearly table.
- [x] Re-translate run messages on a language switch without applying unsaved portfolio edits.
- [x] Show a single notice when ECharts is unavailable.
- [x] SDD, technical design, and task docs under `docs/specs/backtest/`.
- [x] README and AGENTS.md entries.

## Recommended Future Hardening

- [ ] Regular contributions (DCA) and transaction-cost assumptions.
- [ ] Total-return benchmark indices (e.g. 沪深300全收益).
- [ ] Shareable URL encoding of portfolios.
- [ ] Optional import of current PAM holdings via a user-exported JSON file (no shared code or storage).
- [ ] Edge caching of `/api/history` with the Cache API.
