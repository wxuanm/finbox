# Fund Monitor Implementation Tasks

## Phase 1: Current Baseline Documentation

- [x] Analyze Fund Monitor code structure.
- [x] Document Fund Monitor SDD requirements under `docs/specs/fundmonitor/`.
- [x] Document Fund Monitor technical design.
- [x] Document implementation task status.

## Phase 2: Existing Static Tool Baseline

- [x] Static page exists at `fundmonitor/index.html`.
- [x] Theme variables and main CSS exist under `fundmonitor/css/`.
- [x] ES module bootstrap exists at `fundmonitor/js/app.js`.
- [x] Runtime state exists at `fundmonitor/js/config/state.js`.
- [x] Chinese and English strings exist at `fundmonitor/js/config/i18n.js`.
- [x] Theme handling exists at `fundmonitor/js/core/theme.js`.

## Phase 3: Existing Data And Persistence

- [x] Fund code, group, and fund-to-group storage exists with `fund-monitor-*` keys.
- [x] Theme and language persistence exists.
- [x] Real-time fund data proxy exists at `functions/api/fundgz.js`.
- [x] Three-year NAV data proxy exists at `functions/api/fundnav.js`.
- [x] Same-day NAV response cache exists with `fund-nav-3y:*` keys.
- [x] NAV metric calculation exists at `fundmonitor/js/utils/navMetrics.js`.

## Phase 4: Existing UI Modules

- [x] Dashboard summary cards exist.
- [x] Grouped fund table exists.
- [x] Inline add fund action exists.
- [x] Inline new group action exists.
- [x] Inline rename group action exists.
- [x] Inline delete group confirmation exists.
- [x] Group move up/down actions exist.
- [x] Fund remove action exists.
- [x] Global empty state exists.
- [x] Empty custom group state exists.
- [x] Loading and error row states exist.
- [x] Desktop sorting exists.
- [x] Mobile row detail exists.
- [x] Mobile pull-to-refresh exists.

## Phase 5: Existing Analysis Modal

- [x] Modal shell exists in `fundmonitor/index.html`.
- [x] Group period return comparison exists.
- [x] Desktop comparison sorting exists.
- [x] Mobile comparison card sorting exists.
- [x] Historical NAV trend comparison exists.
- [x] Historical NAV summary cards exist.
- [x] Historical NAV metric cards exist.
- [x] ECharts trend rendering exists.
- [x] Stale modal request protection exists.

## Phase 6: Current Baseline Synchronization

- [x] Sync Fund Monitor SDD, technical design, and task status with completed implementation.
- [x] Confirm Fund Monitor remains independent from PAM runtime state, storage keys, and modules.
- [x] Confirm watchlist management remains usable when ECharts is unavailable.

## Recommended Future Hardening

- [ ] Add fund-code format validation before saving or fetching.
- [ ] Persist group collapsed state if that behavior is desired after refresh.
- [ ] Add a user-visible partial failure summary for real-time batch requests.
- [ ] Add a dedicated ECharts-unavailable message inside the historical trend modal.
- [ ] Add explicit storage versioning or migrations before changing persisted data shapes.
- [ ] Add lightweight automated checks for API response normalization and NAV metric calculations.
