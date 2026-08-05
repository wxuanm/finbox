# AGENTS.md

## Project Shape

- FinBox is a static ES-module app with Cloudflare Pages Functions; there is no root `package.json`, lockfile, CI workflow, or configured lint/test script in the repo.
- Run locally with `npx wrangler pages dev .`, then open `/fundmonitor/` or `/pam/` from the URL Wrangler prints so `/api/*` Pages Functions are available.
- `wrangler.toml` only sets `compatibility_date = "2026-07-29"`.

## App Boundaries

- `fundmonitor/` and `pam/` are separate standalone browser tools. Do not import code between them unless explicitly requested.
- Fund Monitor entrypoints: `fundmonitor/index.html`, `fundmonitor/css/main.css`, `fundmonitor/css/variables.css`, `fundmonitor/js/app.js`.
- PAM entrypoints: `pam/index.html`, `pam/css/main.css`, `pam/css/variables.css`, `pam/js/app.js`.
- Cloudflare Pages Functions live under `functions/api/`: `fundgz.js`, `fundnav.js`, and `quotes.js`.

## SDD Workflow

- This project uses SDD docs under `docs/specs/` as the product/design record for implemented modules.
- Fund Monitor specs are in `docs/specs/fundmonitor/`; PAM specs are in `docs/specs/pam/`.
- For feature work that changes product behavior, update the relevant SDD, technical design, or task file when the code change makes the current spec stale.
- Prefer executable source over prose if specs and implementation conflict, then reconcile the stale spec if the task scope includes behavior changes.

## Fund Monitor Notes

- Fund Monitor uses inline HTML handlers plus ES modules; `fundmonitor/js/app.js` deliberately exposes some functions on `window` for those handlers.
- Main module split: `js/ui/fundTable.js` renders grouped table rows/actions; `js/ui/modal.js` owns analysis/trend modal state; `js/api/fundApi.js` script-loads `/api/fundgz`; `js/api/fundNavApi.js` fetches `/api/fundnav`.
- Real-time fund data comes from `/api/fundgz` as JavaScript defining `window.fundinfo`, not JSON.
- Historical NAV comparison uses `/api/fundnav` JSON and is limited to 10 six-digit fund codes.
- Persisted keys include `fund-monitor-saved-codes`, `fund-monitor-groups`, `fund-monitor-fund-groups`, `fund-monitor-theme`, `fund-monitor-lang`, and `fund-nav-3y:<sorted-codes>`.
- The `default` fund group is reserved; deleting a custom group moves funds back to `default`.

## PAM Notes

- PAM `app.js` is the orchestration layer: it loads storage, binds global events, calls module render/bind functions, and switches views with `data-workspace-view`.
- Account performance code is under `pam/js/modules/accountPerformance/`; holdings code is under `pam/js/modules/holdings/`.
- PAM storage wraps data as `{ schemaVersion: 1, data }` under `pam:v1:accounts`, `pam:v1:snapshots`, `pam:v1:holdings`, and `pam:v1:preferences`; preserve migration safety when changing shapes.
- Account return calculations are cash-flow adjusted: net flows change shares at the previous unit NAV, and chart lines connect manual snapshots without smoothing.
- Holdings quote refresh only supports `CN` and `Fund` markets through `/api/quotes`; cash and unsupported markets remain manually priced.
- PAM imports ECharts from CDN in `pam/index.html`; handle ECharts absence without blocking account/holding management.

## API Notes

- `/api/fundgz` proxies Eastmoney fund comparison scripts. For `t=0` and more than 10 codes, it chunks requests by 10 and merges `fundinfo`; `t=1` stays a single request path.
- `/api/fundnav` accepts up to 10 valid six-digit codes and returns `{ range, source, updatedAt, funds, failedCodes }` with cache headers.
- `/api/quotes` accepts up to 40 `market:symbol` items and currently supports A-share `CN` and funds `Fund`.

## Verification

- There are no automated test/lint/typecheck scripts to run from this repo.
- For changes touching `/api/*`, use `npx wrangler pages dev .` and verify through the local `/api/...` paths rather than opening HTML files directly.
- For UI changes, manually check both desktop and mobile layouts for the touched tool; both apps rely on responsive CSS rather than a build step.

## Git Hygiene

- `.wrangler/` and `/bak` are ignored; do not rely on files there as source.
- Keep generated/local backup data out of commits unless the user explicitly asks.
