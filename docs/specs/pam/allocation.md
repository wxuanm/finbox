# PAM Asset Allocation Spec

## Scope

- Module: 资产配置 top-level workspace view
- Parent tool: PAM
- Status: P1 and P2 implemented
- First release focus: cross-account allocation by the existing holding asset classes, target weights, drift, and rebalancing amounts

## Product Goal

The allocation module answers three questions across all of a user's accounts:

1. How is my money split across asset classes right now?
2. How far is that split from my target?
3. To get back to target, how much should each class gain or lose?

It complements, and does not replace, the holdings `仓位分布` view. That view answers how concentrated one account is across individual holdings. This module aggregates across accounts and works at the asset-class level.

## Confirmed Decisions

- Allocation classes are the existing holding `assetClass` values: `stock`, `fund`, `bond`, `cash`, `other`. No new classification field, look-through, or split ratios in this release.
- The default scope is all accounts; users can exclude accounts (such as an emergency-fund account). There is no single-account mode, because the holdings `仓位分布` view already covers one account.
- Weights come from current holdings market value. Accounts without holdings are reported through a coverage figure; they are never silently dropped and never guessed into a class.
- Rebalancing stops at class-level amounts. It never suggests specific instruments, and it ignores fees, taxes, and minimum trade sizes.
- Targets and account exclusions are user data, not view preferences: they sync as their own domain and losing them in a sync conflict is reported to the user.
- The module renders with HTML/CSS bars and does not need ECharts, so it stays fully usable when the CDN fails.

## Known Limitation

`assetClass` describes the instrument type, not the underlying exposure. A bond fund or a balanced fund held as `fund` counts entirely as `fund`, so the stock/bond split shown here can differ from real exposure. Users can record such a holding as `bond` instead, but a `bond` holding is restricted to the `Other` market and loses quote refresh. The page shows a one-line hint stating that classes follow the holding type. A dedicated allocation class or look-through is deferred to a later phase.

## In Scope

P1: Current allocation

- Enable the `资产配置` module tab (`data-workspace-view="allocation"`), currently a disabled placeholder.
- Aggregate holdings from included accounts by asset class: market value and weight.
- Show holdings coverage and the stale-price share, so users know how far to trust the weights.
- Show each included account's class mix.
- Expand a class row to list the holdings that make it up.
- Account inclusion control.

P2: Targets and rebalancing

- Edit target weights per class.
- Tolerance bands with absolute and relative thresholds.
- Per-class drift and status (`低配` / `正常` / `超配`).
- Rebalancing amounts in two modes: `新增资金` (buy only) and `买卖调整` (buy and sell).

## Out Of Scope

- New allocation classes, region/market dimension, split ratios, and fund look-through.
- Allocation history and drift over time (needs class values recorded with snapshots; planned P3).
- Instrument-level suggestions, trade lists, fees, taxes, and minimum trade sizes.
- Risk metrics such as volatility or correlation (belongs to `风险分析`).
- Multi-currency conversion; all values remain CNY-equivalent.
- Per-class tolerance overrides and glide paths (age- or date-based target changes).

## Data Model

New storage key `pam:v1:allocation`, wrapped like other domains as `{ schemaVersion: 1, data }`. P1 stored only the exclusion list; P2 added `targets` and `band`, and P1-shaped data still loads:

```js
{
  excludedAccountIds: ["account-003"],                            // P1
  updatedAt: "2026-10-30T10:00:00.000Z",                          // P1
  targets: { stock: 30, fund: 30, bond: 25, cash: 10, other: 5 }, // P2; null when unset
  band: { absolute: 5, relative: 25 }                             // P2
}
```

| Field | Meaning | Rule |
| --- | --- | --- |
| `excludedAccountIds` | Accounts left out of allocation | Unique non-empty ids; unknown ids are dropped on normalization |
| `updatedAt` | Last change time | ISO string, or `''` before the first change |
| `targets` (P2) | Target weight per class, in percent | `null`, or an object with all five classes; each value finite, 0–100, at most 1 decimal; sum equals 100 (±0.01) |
| `band.absolute` (P2) | Absolute tolerance, percentage points | Finite, 0.5–20, default 5 |
| `band.relative` (P2) | Relative tolerance, percent of the target | Finite, 5–100, default 25 |

Normalization tolerates missing or malformed data and falls back to `{ excludedAccountIds: [], updatedAt: '', targets: null, band: { absolute: 5, relative: 25 } }`. A `targets` object that is malformed or does not sum to 100 normalizes to `null` instead of being repaired, so a broken target never produces rebalancing amounts; an out-of-range band value falls back to its default.

The server imports `normalizeTargets` and `normalizeBand` from `allocationMetrics.js` (the module is DOM-free for this reason) and accepts a write only when normalizing changes nothing. A broken target set or band is therefore rejected with `400 Invalid allocation`, never silently repaired, and the browser and server rules cannot drift apart. `targets` and `band` may be omitted, so a P1 client can still write.

Preferences gain `allocationRebalanceMode` (`cashIn` or `full`, default `cashIn`; invalid values fall back to `cashIn`). The new-money amount typed into the rebalance panel is kept across re-renders but not persisted.

## Calculations

### Scope

```text
includedAccounts = accounts not in excludedAccountIds
rows             = holdings of includedAccounts with marketValue > 0   // marketValue from holdingsMetrics
heldAccounts     = includedAccounts with at least one row
missingAccounts  = includedAccounts not in heldAccounts that have a snapshot
```

### Current allocation (P1)

```text
classValue[c]  = sum(row.marketValue for rows with assetClass c)
T              = sum(classValue)
weight[c]      = T > 0 ? classValue[c] / T * 100 : null
```

Weights use only holdings. The latest snapshot of a missing account has no class information, so it is reported through coverage instead of being placed in a class.

```text
missingValue   = sum(latest snapshot totalValue of missingAccounts)
coverage       = T + missingValue > 0 ? T / (T + missingValue) * 100 : null
staleShare     = T > 0 ? sum(marketValue of rows where isStalePrice(row)) / T * 100 : null
```

`isStalePrice` is the existing holdings rule (over three days old), so the allocation page and holdings charts flag the same rows. Coverage does not compare a held account's holdings with its own snapshot total, because the two are taken at different prices and times.

Per-account mix uses the same formula restricted to one account; its weights sum to 100% within that account.

### Drift and status (P2)

```text
drift[c]       = weight[c] - targets[c]                         // percentage points
band[c]        = min(band.absolute, targets[c] * band.relative / 100)
status[c]      = drift[c] >  band[c] ? 'over'
               : drift[c] < -band[c] ? 'under'
               : 'ok'
```

This is the 5/25 rule: the band is the tighter of the absolute and relative thresholds, so a 5% gold-like target is not stuck inside a 5pp band it can never leave. A class with target 0 and any holdings is `over`. Status is computed from `weight` and `drift` rounded to 2 decimals, so the label never contradicts the displayed numbers.

### Rebalancing (P2)

All rebalancing works on `T`, the covered holdings value. When coverage is below 100%, the panel states that missing accounts are not included.

`买卖调整` (`full`): buy and sell back to the exact target.

```text
targetValue[c] = targets[c] / 100 * T
trade[c]       = targetValue[c] - classValue[c]                 // + buy, - sell; sum = 0
```

`新增资金` (`cashIn`): buy only, no selling.

Minimum new money to reach the exact target without selling:

```text
T*        = max(classValue[c] / (targets[c] / 100) for c with targets[c] > 0)
required  = T* - T
buy*[c]   = targets[c] / 100 * T* - classValue[c]
```

If any class has `targets[c] = 0` and `classValue[c] > 0`, buying alone can never reach target: that class is `blocked`. The panel says so and names it. The blocked classes keep their value, and the reachable classes (target above 0) aim at their target ratio of what is left:

```text
B         = sum(classValue of blocked classes)
share[c]  = targets[c] / sum(targets of reachable classes)
T*        = max(T, B + max(classValue[c] / share[c] for reachable c))
aim[c]    = share[c] * (T_after - B)        // reachable; 0 for blocked
```

`required`, `buy*`, and the surplus split above `required` use `share` and `aim` in place of `targets / 100`. The table's target-amount column shows `aim`, so it matches what the plan buys toward rather than a target it cannot reach. Without a blocked class this reduces to the formulas above.

With a user-entered amount `C > 0`:

```text
T'        = T + C
gap[c]    = max(0, targets[c] / 100 * T' - classValue[c])
buy[c]    = C >= required ? buy*[c] + (C - required) * targets[c] / 100
          : gap[c] * C / sum(gap)
```

Below `required`, the amount is spread over the underweight classes in proportion to their gaps at the new total. Each buy stays within its gap and buys sum to `C`. Above `required`, the target is reached first and the surplus is split by target weight. The panel also shows each class's weight after the trades.

Amounts display with 2 decimals. Inputs and calculations keep full precision.

## UI

```text
资产配置
├─ Header: title, scope summary (N accounts included), 纳入账户 action, 设置目标 action
├─ Stats row: 纳入资产 (T), 持仓覆盖率, 价格过期占比, [P2] 最大偏离 (class and drift)
├─ Missing-holdings notice (only when coverage is below 100%)
├─ 类别分布: class bars, one row per class
├─ [P2] Rebalance panel
└─ 账户构成: account mix table
```

With no accounts, every account excluded, or no included holding above 0, the content is replaced by an empty state whose button goes to `账户管理` or reopens the inclusion dialog.

### Class bars

- Fixed class order `stock`, `fund`, `bond`, `other`, `cash`, with cash last as in the holdings table. The order is fixed, not sorted by weight, so a row stays in place as values move.
- A class row shows when it has value or a target above 0. A row with a target but no holdings is static (nothing to expand).
- Each row shows class name with its holding count, a horizontal bar of the current weight, the weight (2 decimals), and the amount.
- Every bar uses the same lightened primary hue, like the holdings `仓位分布` view. Each row is already named, so color carries no identity, and P/L red/green stays out of this view.
- With targets set, the bar track also shows the tolerance band as a shaded range and the target as a tick, on the same true 0–100% scale as the fill (not rescaled, so the bar still reads as where the money sits). The row adds `目标 x%`, signed drift in pp, and a status label. Status uses `--warning-color` for `低配`/`超配` and stays neutral for `正常`, and is always stated in text. Rise/fall red and green are not used, because drift is not profit or loss. A footnote states the active band. On desktop the bar track is capped at 560px so the figures stay next to it.
- Without targets, a prompt under the class bars offers `设置目标`; the rebalance panel and target lines are hidden.
- Each row is a button (`aria-expanded`) that expands its holdings: name, account, amount, and weight of `T`, sorted by amount descending, with the `⚠` prefix for stale prices. Expanded rows stay open across re-renders until reload. Holdings rows link to nothing; holdings are edited in `账户管理`.
- On narrow cards (container below 560px) name and figures share the first line and the bar takes the second. The expanded list then drops its account column and shows the account name under the holding name, so it fits a 360px phone.
- A footnote states the asset-class limitation in one line.

### Coverage and staleness

- With coverage below 100%, a notice lists the missing accounts with their latest snapshot date and states that they are not included in weights or rebalancing. The notice includes an action that switches to `账户管理` for the first missing account.
- With `staleShare` above 0, the stats row shows the stale share with `⚠`, and the rebalance panel repeats the warning before any amounts.

### Account inclusion

- `纳入账户` opens a dialog with one checkbox per account, showing account name and latest total. Changes apply on confirm.
- Excluding every account shows an empty state with an action to reopen the dialog.
- Deleting an account removes its id from `excludedAccountIds`, and new accounts are included by default.

### Targets dialog (P2)

- `设置目标` (header, and the prompt when no targets exist) opens a dialog with one number input per class, each showing that class's current weight. Inputs are prefilled with current targets; when none are set, they start at the current weights rounded to whole numbers by largest remainder, so they sum to exactly 100.
- A live total shows `合计 x%`. Save is disabled, with a message naming the problem, unless every value is 0–100 with at most 1 decimal, the total is 100, and both bands are in range. An empty input counts as 0. `按当前比例填充` re-fills from the current weights.
- The same dialog edits the absolute and relative bands, with live help: `偏离超过 a 个百分点或目标的 r% 时提示调整，以先达到者为准`.
- `清除目标` appears only when targets exist. It sets `targets` to `null` after in-app confirmation; the band is kept.

### Rebalance panel (P2)

- Shown only when targets are set and `T > 0`.
- Mode switch: `新增资金` / `买卖调整`, persisted in preferences.
- `新增资金`: an amount input, empty by default. When empty, the panel shows `回到目标至少需新增 required` (or that it is already on target) and the `buy*` breakdown. With an amount, it shows the `buy` breakdown and resulting weights, and below `required` explains that the money is split across gaps without passing any target. The amount applies on blur or Enter rather than per keystroke, so typing keeps focus; zero, negative, or invalid input clears it.
- `买卖调整`: shows `trade` per class as `买入` or `卖出` with the resulting weights, which equal the targets.
- Stale prices and missing-holdings accounts each add a one-line warning above the amounts.
- Table columns: class, current amount, target amount, adjustment, weight after. Rows show only classes with value, a target, or a trade.
- One-line disclaimer: amounts are class-level, exclude fees and taxes, and are not instrument recommendations.

### Account mix

- A table with one row per included account with holdings: account name, holdings value, and one weight column per class that has value overall. Each weight cell carries a faint fill proportional to its weight; a class the account does not hold shows `-`. Weights sum to 100% per row.
- It is a table rather than 100% stacked bars because an account can hold any subset of classes, so any two class colors can end up adjacent. The validator found no five-hue set from `--chart-series-1..6` that separates every pair for color-blind readers in both themes, and a table needs no legend.
- Missing accounts appear at the end as rows labeled `未录入持仓` with their latest snapshot total.
- On phones the table scrolls inside its own frame with the account column pinned.

### Responsive

- Desktop: stats row in three columns, or four with targets (`最大偏离` shows the largest drift with its class and status). Class bars and the rebalance panel sit side by side when the content area is at least 1040px wide (a container query), otherwise stacked.
- Phones (below 720px): with three stats `纳入资产` spans the first row and the other two share the next; with four they form a 2×2 grid. Header actions move under the description, right-aligned. The mode switch becomes a full-width two-segment control. The rebalance table drops the current-amount and target-amount columns (current amounts are already in the class rows), keeping class, adjustment, and weight after so it fits 360px without scrolling. Must work at 360px without page scroll or content clipped by the panel.

### Privacy and i18n

- Amount privacy masks every money amount, including `T`, class amounts, `required`, trades, and account totals. Weights, targets, drift, bands, coverage, and stale share stay visible. The new-money input stays visible like other form inputs.
- All copy goes through `t()` with `zh` and `en` entries.

## Persistence, Sync, And Backup

- Local cache `pam:v1:allocation`; cloud domain `allocation` in `/api/pam/data`, stored as one JSON document per owner in D1 table `pam_allocation (owner_id PRIMARY KEY, data, updated_at)` from migration `0004_pam_allocation.sql`, with an owner foreign key that cascades. Writes follow the existing domain replacement guarded by `revision`, so allocation and preferences writes never touch each other. The key is part of the browser cache that is cleared when the signed-in user changes.
- Server validation: an object with a unique `excludedAccountIds` string list no longer than the account limit, an ISO or empty `updatedAt`, and optional `targets` and `band` that pass the shared normalizers unchanged (see Data Model).
- When a revision conflict discards unsynced allocation edits (exclusions, targets, or bands), the existing loss message is shown, as for accounts, snapshots, and holdings. A lost `allocationRebalanceMode` is a preference and stays silent.
- JSON export adds `data.allocation`, and preferences include `allocationRebalanceMode`. Import normalizes allocation, drops excluded ids missing from the imported accounts, and treats backups without it as the default.
- Demo data sets example targets (stock 25, fund 40, bond 10, other 15, cash 10) only when no targets exist, so it never overwrites a real plan.

## Implementation Notes

- Folder `pam/js/modules/allocation/`: `allocationMetrics.js` (pure calculations: metrics, normalization, `suggestTargets`, `buildDrift`, `buildFullRebalance`, `buildCashInRebalance`), `allocationPanel.js` (render and bind, including the rebalance panel), and `storage.js` (load and save). The inclusion and targets dialogs are static markup in `index.html` with handlers in `app.js` beside the other dialogs.
- `allocationMetrics.js` takes rows, accounts, snapshots, and the exclusion list as arguments. It must not import DOM helpers, `state.js`, `i18n.js`, or `formatter.js`, and must not read the local date: `functions/api/pam/[[path]].js` imports its normalizers for validation, and P3 may import it to record class values with auto snapshots. Stale flags are computed by the caller with `isStalePrice` and passed in on each row as `stale`.
- Reuse `buildHoldingsMetrics` normalization for market value. Do not duplicate the holdings formulas.
- Recompute on every render from current state; nothing derived is stored.

## Acceptance Criteria

P1

- `资产配置` is enabled in the module navigation on desktop and mobile, and its view switches via `data-workspace-view`.
- With no accounts, or no included account holding anything, the view shows an empty state with a path to `账户管理`.
- Class weights sum to 100% (within display rounding) and match the sum of holding market values per `assetClass` across included accounts.
- Excluding an account removes its holdings from all figures. The exclusion persists after refresh, syncs, and round-trips through JSON backup.
- An included account with a snapshot but no holdings lowers coverage, appears in the missing-accounts notice, and is not counted in any class.
- Stale share counts exactly the rows the holdings view flags as stale.
- Expanding a class lists its holdings, and their amounts sum to the class amount.
- The page works without ECharts.
- Amount privacy masks all money amounts and leaves percentages visible.

P2

- Targets cannot be saved unless they sum to 100. Clearing targets requires confirmation and hides P2 sections.
- Drift equals displayed weight minus target, and status follows `min(absolute, target × relative)`. A target-0 class with holdings shows `超配`.
- In `买卖调整`, trades sum to 0 and resulting weights equal targets.
- In `新增资金` with no amount, `required` is the smallest buy-only amount that reaches target; each class's resulting weight equals its target.
- In `新增资金` with an amount, buys are non-negative, sum to the amount, and never push a class above its target when the amount is below `required`.
- A target-0 class holding value shows the buy-only limitation instead of an impossible amount; the reachable classes reach their relative target ratio, and the target-amount column matches what is bought toward.
- Targets and bands sync as the `allocation` domain; losing unsynced allocation edits in a conflict shows the loss message. The server rejects broken targets or bands.
- The rebalance mode persists across reload and syncs as a preference.
- Demo data adds example targets only when none exist.
- Desktop and 360px phone layouts have no horizontal scroll, in light and dark themes and in both languages.
