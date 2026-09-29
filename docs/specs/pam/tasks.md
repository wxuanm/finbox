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
- [x] Integrate holdings into `账户管理` navigation.
- [x] Implement holdings storage with `pam:v1:holdings`.
- [x] Implement holdings metrics.
- [x] Implement holding form, filters, and sortable table.
- [x] Include holdings in demo data and JSON import/export.
- [x] Add `/api/quotes` for A-share and fund quotes.
- [x] Implement quote refresh for supported holdings.
- [x] Update README and run verification.

## Phase 7: Current Baseline Synchronization

- [x] Implement Chinese/English language persistence.
- [x] Implement JSON backup import/export.
- [x] Implement in-app confirmation dialog for destructive and overwrite actions.
- [x] Implement holdings-generated snapshot preview and confirmation.
- [x] Implement amount privacy without hiding latest prices.
- [x] Render money amounts without a visible `CN`/currency prefix.
- [x] Sync SDD, technical design, holdings spec, and task status with completed implementation.

## Phase 8: Authenticated Cloud Persistence

- [x] Add the normalized D1 schema and migration.
- [x] Add per-user access-key login, D1-backed sessions, and HttpOnly session cookies.
- [x] Scope every `/api/pam/data` query by the server-derived PAM user identity.
- [x] Add operator-side user provisioning without storing raw access keys.
- [x] Retain `localStorage` as a cache and add confirmed first-run migration.
- [x] Add domain-level debounced synchronization and revision conflict protection.
- [x] Add cloud status UI and deployment documentation.

## Phase 9: Production Rollout And Credential Recovery

Current checkpoint (2026-09-29):

- [x] Configure the production Pages D1 binding as `PAM_DB` for database `finbox-pam` (`ae3d617e-42e4-4c32-8d07-f192e40244fc`).
- [x] Configure `PAM_KEY_PEPPER` as an encrypted Pages production secret. Its value must not be written to this repository or repeated in task documentation.
- [x] Apply and verify both migrations locally.
- [x] Verify the local authentication flow: unauthenticated rejection, invalid-key rejection, valid login, session access, owner-scoped data access, logout, and post-logout rejection.
- [x] Remove the temporary local `.dev.vars` and stop the local Wrangler verification server.
- [x] Add operator commands to reissue and revoke credentials for an existing user without changing that user's ID or losing owner-scoped business data.
- [x] Add an operator command or documented SQL procedure to disable a user and invalidate all of that user's sessions.
- [x] Document `PAM_KEY_PEPPER` loss/rotation recovery, including that existing sessions can remain valid until expiry unless explicitly revoked.
- [x] Apply migration `0002_pam_key_auth.sql` to production with `npx wrangler d1 migrations apply PAM_DB --remote`.
- [x] Verify the production `pam_users`, `pam_credentials`, and `pam_sessions` tables exist.
- [x] Provision the first production administrator after obtaining the desired username and display name. The operator must set the already-configured pepper temporarily in the local `PAM_KEY_PEPPER` environment variable; never paste it into source files or task documents.
- [x] Redeploy Cloudflare Pages after the migration, secret, and first user are ready.
- [ ] Run the production verification checklist in `docs/specs/pam/cloud-deployment.md`, including two-user row isolation and cache isolation.

## Phase 10: Username And Password Login

- [x] Add per-user password salt, hash, iteration count, and update timestamp migration.
- [x] Make username/password the default daily login while retaining Access key recovery.
- [x] Add first-time password setup and Access-key password replacement flow.
- [x] Verify locally: invalid password rejection, Access-key bootstrap, password setup, password login, session access, logout, and post-logout rejection.
- [x] Apply and verify migration `0003_pam_password_auth.sql` in production.
- [ ] Deploy and verify Access-key bootstrap plus username/password login for the production administrator.

## Recommended Future Hardening

- [ ] Add lightweight automated checks for account metrics, import normalization, quote parsing, and holdings-generated snapshots.
- [ ] Add optional CSV import/export for account snapshots if batch entry becomes important.
- [ ] Add historical holdings or transaction ledger only after defining storage migration rules.
- [ ] Add more quote markets only with explicit currency conversion and market-data behavior.
