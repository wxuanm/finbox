# PAM Implementation Tasks

## Phase 1: SDD Baseline

- [x] Create PAM SDD requirements document.
- [x] Review and namespace PAM spec under `docs/specs/pam/`.
- [x] Create technical design document.
- [x] Create implementation task document.

## Phase 2: Static Tool Skeleton

- [x] Create `pam/index.html`.
- [x] Create `pam/css/variables.css`.
- [x] Create `pam/css/main.css`.
- [x] Create `pam/js/app.js`.
- [x] Create module directories.

## Phase 3: Data And Calculation

- [x] Implement runtime state.
- [x] Implement storage with `pam:v1:*` keys.
- [x] Implement account unit NAV calculation.
- [x] Implement period filtering and metrics.
- [x] Implement format helpers.

## Phase 4: UI Modules

- [x] Implement account list and account actions.
- [x] Implement snapshot form and edit mode.
- [x] Implement snapshot table with account switch.
- [x] Implement overview and metric cards.
- [x] Implement performance chart and period switch.
- [x] Implement demo data action.

## Phase 5: Polish And Docs

- [x] Implement dark mode persistence.
- [x] Implement empty, insufficient-data, and invalid-data states.
- [x] Implement responsive mobile layout.
- [x] Update `README.md` with PAM details.
- [x] Run local verification.

## Phase 6: Holdings Management

- [x] Add holdings SDD and technical design.
- [x] Enable `持仓管理` navigation.
- [x] Implement holdings storage with `pam:v1:holdings`.
- [x] Implement holdings metrics and allocation summaries.
- [x] Implement holding form, filters, and sortable table.
- [x] Include holdings in demo data and JSON import/export.
- [x] Add `/api/quotes` for A-share and fund quotes.
- [x] Implement quote refresh for supported holdings.
- [x] Update README and run verification.
