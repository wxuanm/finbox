# PAM Risk Exposure Spec

## Scope

- Module: `风险敞口` top-level tab, next to `资产配置`
- Parent tool: PAM
- Reference: 钢子交易笔记《干货：如何计算风险敞口？》 — exposure is the net-value loss if every position falls to its planned stop, split into planned principal loss and projected net-value drawdown, each with a warning line.

## Product Goal

Answer "if the market turns, how much do I lose when every position exits at its stop?" instead of "how much did I buy?". The page shows two warning lines (survival and quality), per-position risk, and a calculator that sizes a new position from 1R and the room left under the survival line.

## Confirmed Decisions

- Separate tab, not a holdings view: the page is used before placing an order, and it needs account-level data (snapshot NAV series and net contribution) that the holdings panel does not own.
- Stop price is an optional per-holding field (`stopPrice`), edited in the holding dialog or the page's own stop dialog.
- A holding without a stop is estimated with a stop `defaultStopPct` (default 5%) below its current price and labeled `默认估算`; it is never treated as riskless.
- The historical high is measured in unit NAV, not total value, so deposits never create a fake high.
- The new-position calculator ships in the first release.
- Long positions only. No fees. Cash has no exposure.

## Data Model

Holding gains an optional field:

```js
{ ...holding, stopPrice: 1600 }   // positive number, or null when unset
```

- Browser and JSON export always carry the key (`null` when unset). Cash holdings always store `null`.
- D1 column `pam_holdings.stop_price REAL` (nullable) from migration `0005_pam_holding_stop_price.sql`.
- Server validation accepts a missing key, `null`, or a finite number above 0.
- Old clients never send the key. The holdings write is an upsert, and a missing key keeps the stored `stop_price`, so an old tab cannot wipe stops set elsewhere; a sent `null` clears it. Holdings absent from the write are still deleted (full replace semantics for rows).

Preferences gain `riskScope` (`all` or an account id; unknown ids fall back to `all`) and `riskSettings`:

| Field | Meaning | Range | Default |
|---|---|---|---|
| `defaultStopPct` | Estimated stop distance below current price when no stop is set | 0.5–50 | 5 |
| `principalLimit` | Survival line, % of net contribution | 0.5–50 | 5 |
| `drawdownLimit` | Quality line, projected drawdown from the unit-NAV peak | 1–80 | 10 |
| `riskPerTradePct` | 1R for the calculator, % of current net value | 0.1–10 | 1 |

Out-of-range stored values normalize to defaults; the settings dialog rejects them instead.

## Calculations

Pure module `pam/js/modules/risk/riskExposure.js` (no DOM, `state`, i18n, or local-date helpers).

Per non-cash holding with positive quantity and price:

```text
stop        = stopPrice ?? currentPrice × (1 − defaultStopPct / 100)
triggered   = stopPrice is set and currentPrice ≤ stop          // fired but not sold
exitPrice   = triggered ? currentPrice : stop
exposure    = (currentPrice − exitPrice) × quantity              // 预计净值回撤
principal   = max(0, costPrice − exitPrice) × quantity           // 计划本金损失
exitPnl     = (exitPrice − costPrice) × quantity
```

Scope (all accounts or one):

```text
equity            = Σ holdings market value (cash included)
exposurePct       = Σ exposure / equity
exitEquity        = equity − Σ exposure
principalPct      = Σ principal / netContribution                 // survival line
shares, netContribution = latest point of the scope's share-based NAV series
currentUnitNav    = equity / shares                               // assumes no flow since that snapshot
peakUnitNav       = max(all snapshot unit NAVs, currentUnitNav)
currentDrawdown   = 1 − currentUnitNav / peakUnitNav
projectedDrawdown = 1 − (exitEquity / shares) / peakUnitNav       // quality line
```

The scope series is the single account's series, or `buildPortfolioMetrics(...ALL)` for all accounts. Without a calculable series (fewer than two snapshots) both lines show `无法计算`, while exposure figures still render.

Each principal loss counts on its own; profit locked in by other positions never offsets it.

Line status: `over` at or above the limit, `near` from 80% of it, otherwise `ok`; `unknown` when not computable.

### New-position calculator

```text
perUnitRisk = entry − stop                                    // stop must be below entry
rUnits      = floor(1R / perUnitRisk / lot) × lot             // 1R defaults to equity × riskPerTradePct
roomUnits   = floor(max(0, netContribution × principalLimit − Σ principal) / perUnitRisk / lot) × lot
units       = min(rUnits, roomUnits)
```

It reports quantity, cost and weight, added principal risk, and both lines after the entry. It assumes a fill at the entry price paid from cash (net value unchanged) and warns when cost exceeds the scope's cash or when the principal room cut the size.

## UI

- Header: title, account scope select (shown with two or more accounts), `预警设置`.
- Two line cards with value, limit, status text, and a meter whose track runs to 125% of the limit with a tick at the limit. Warning tone marks `near`/`over`; P/L red/green is not used.
- Figures: possible drawdown from now (% and amount), net value after stop-outs, and the share of invested value estimated by the default stop.
- Notices: triggered stops, stale prices (over three days), and a holdings-vs-latest-snapshot gap of 10% or more, which makes the unit NAV unreliable.
- Position table sorted by exposure: name (stale `⚠`, symbol, account in all-account scope), stop with distance and tag (`默认估算` / `已触发` / `已保本`), exposure % and amount, principal loss, P/L at exit, and a `止损` button opening the stop dialog. Below 560px card width it becomes a tap-to-expand list.
- Calculator beside the table from 1040px card width, below it otherwise.
- Amount privacy masks money but keeps percentages and prices.
- HTML only; the page works when ECharts fails to load.

## Out Of Scope

- Short positions, options, leverage, and fees.
- Staged stops on one holding (split it into several holdings instead).
- Auto-updating trailing stops.
- Correlation or volatility-based risk.

## Acceptance Criteria

- The article's examples reproduce: entry 100 with stop 95 on 1,000 shares gives 5,000 exposure and 5,000 principal loss; price 120 with stop 110 gives 10,000 exposure and 0 principal loss; peak 120k, net value 115k, and exposure 5,000 give 4.35% from now and 8.33% from the peak.
- A holding without a stop counts `defaultStopPct` of its market value as exposure and is labeled.
- A stop at or above the price shows `已触发` with zero exposure.
- Stops survive reload, JSON export/import, and cloud sync. A write from a client that predates stops keeps them.
- Backups without `stopPrice` import with no stops.
- Settings persist as preferences; invalid entries are rejected with a message.
