# PAM Cloudflare D1 Deployment

## Runtime Architecture

```text
Browser /pam/ → username + password → Pages Function → D1 binding: PAM_DB
               access key recovery ↗        │
                         HttpOnly session ───┘

Browser localStorage cache ← authenticated sync with revision checks
```

The Pages Function is the authorization boundary. It validates the opaque `pam_session` cookie, derives `owner_id` from the associated D1 user, and applies that owner to every business query. A client-supplied user ID is never used for authorization.

D1 contains password hashes, access-key hashes, and session-token hashes, not raw passwords, access keys, or session tokens. The shared hashing secret `PAM_KEY_PEPPER` is an encrypted Cloudflare Pages secret and must never be committed, printed in logs, or reused for another purpose.

## D1 Configuration And Migrations

The production database is `finbox-pam`, bound to the Pages project as `PAM_DB`. A local Wrangler configuration uses:

```toml
[[d1_databases]]
binding = "PAM_DB"
database_name = "finbox-pam"
database_id = "<D1_DATABASE_ID>"
migrations_dir = "migrations"
```

Apply all pending production migrations from the repository root:

```powershell
npx wrangler d1 migrations apply PAM_DB --remote
```

Migration `0001_pam_cloud_sync.sql` creates owner-scoped business tables. Migration `0002_pam_key_auth.sql` creates users, recovery credentials, and sessions. Migration `0003_pam_password_auth.sql` adds per-user password hash metadata.

## Production Pepper

Generate one random secret of at least 32 bytes and add it to the Pages project as the encrypted production secret named exactly `PAM_KEY_PEPPER`. Do not place it in `wrangler.toml`, GitHub, deployment output, or this repository.

The same value is needed temporarily on an operator's machine only while provisioning or reissuing users. Losing or changing it invalidates both existing access keys and password login because both derivations use the pepper. Existing sessions do not use the pepper and remain valid until expiry or explicit revocation.

## Provision A User

After the production migration and secret are configured, set the matching pepper only for the current terminal and run:

```powershell
$env:PAM_KEY_PEPPER='<same secret configured in Pages>'
node scripts/create-pam-user.mjs <username> "<display name>"
Remove-Item Env:PAM_KEY_PEPPER
```

Add `--admin` when the user needs the administrative role. The current application does not expose an administrative UI; the role is reserved for operator policy and future management features.

The script inserts the HMAC hash remotely and prints the raw personal access key once. Transfer it through a private channel. The key cannot be recovered from D1. Do not create a replacement user when an existing user loses a key because that would produce a different owner ID and would not expose the original user's data.

On first use, select **Use Access key** on the PAM login page. After the key is accepted, set a 12–128 character password. Subsequent daily logins use the username and password. Using the Access key again enters the password replacement flow, so it remains a recovery credential and should be stored separately from the daily password.

## Credential Recovery And User Disable

Run credential recovery against an existing username so its user ID and owner-scoped business data remain unchanged. All commands require an explicit `--remote` or `--local` target.

Reissue a lost or compromised credential:

```powershell
$env:PAM_KEY_PEPPER='<same secret configured in Pages>'
node scripts/manage-pam-user.mjs reissue <username> --remote
Remove-Item Env:PAM_KEY_PEPPER
```

This revokes all of the user's prior credentials and sessions, increments `auth_version`, and prints the replacement access key once. Transfer the key through a private channel.

Revoke access without issuing a replacement:

```powershell
node scripts/manage-pam-user.mjs revoke <username> --remote
```

Disable a user:

```powershell
node scripts/manage-pam-user.mjs disable <username> --remote
```

Revocation invalidates all active credentials and sessions but leaves the user active so a credential can be reissued later. Disable additionally sets the user status to `disabled`; reissue intentionally refuses to issue a key while that status remains. Neither operation deletes the user or owner-scoped business data.

## Pepper Loss And Rotation

The raw pepper cannot be recovered from D1. If it is lost or suspected compromised, generate a new independent secret of at least 32 bytes and replace the encrypted Pages secret. Existing access keys and password hashes were derived with the old pepper and will no longer authenticate after the deployment uses the new value.

Before or immediately after rotating, use the new pepper with `reissue` for every active user and deliver each replacement key privately. Each user then signs in with the replacement key and sets a new password. Reissue also revokes that user's existing sessions. Merely replacing `PAM_KEY_PEPPER` does not invalidate sessions that were already created: those sessions remain valid until their seven-day expiry or explicit revocation. To terminate them during an emergency rotation, run `revoke` for each user before reissuing, or use `reissue`, which performs session revocation itself.

Never reuse the old pepper, store either pepper in repository files, or pass it as a command-line argument. Keep it only in the encrypted Pages secret and, while reissuing, the current operator terminal environment; remove the environment variable afterward.

## Deploy

Redeploy the Pages project after these items exist:

- D1 binding `PAM_DB` points to `finbox-pam`.
- All migrations have been applied.
- Encrypted secret `PAM_KEY_PEPPER` is configured.
- At least one PAM user has been provisioned.

No Cloudflare Access Team Domain or Audience Tag is required for this design.

## Local Development

Use an ignored `.dev.vars` file with a development-only pepper:

```text
PAM_KEY_PEPPER=<development secret of at least 32 characters>
```

Never reuse the production pepper locally. Apply migrations and create a local-only user:

```powershell
npx wrangler d1 migrations apply PAM_DB --local
$env:PAM_KEY_PEPPER='<same development secret as .dev.vars>'
node scripts/create-pam-user.mjs local-user "Local User" --admin --local
Remove-Item Env:PAM_KEY_PEPPER
npx wrangler pages dev .
```

Open `/pam/` from the URL printed by Wrangler. `.dev.vars*` and `.pam-secrets*` are ignored by Git.

## First Migration And Recovery

- If cloud data is empty and the authenticated browser has local PAM business data, PAM asks before uploading all local domains.
- If both cloud and previously unlinked local data exist, PAM asks before loading and replacing the local copy.
- Changing authenticated users in one browser clears the previous PAM cache before loading the next user's data.
- Explicit logout clears the PAM cache.
- JSON export remains the portable backup path.
- A revision mismatch stops synchronization with HTTP `409`; it never silently overwrites the other device.
- Selecting “load latest cloud data” discards unsynchronized local changes, so export JSON first when those changes matter.

## Security Boundary

Public repository contents, the D1 database name, and the D1 database ID are not database credentials. Direct D1 administration still requires control of the Cloudflare account or an authorized API token. Application-level data access requires valid username/password credentials, a recovery access key, or an unexpired session cookie.

This protects against unauthenticated database reads and cross-user reads through the application. It does not protect against a compromised Cloudflare/GitHub deployment account, a stolen access key or browser session, malicious code deployed by a repository maintainer, or data exposed by the user's own browser or exported backups.

## Deployment Verification

1. An unauthenticated visit to `/pam/` shows the PAM login gate and does not load local financial data or ECharts.
2. Unauthenticated requests to `/api/pam/auth/session` and `/api/pam/data` return `401`.
3. Invalid username/password and invalid Access key attempts return `401`; a valid Access key starts password setup, and a valid username/password login sets an HttpOnly, SameSite=Strict, Secure production cookie.
4. Two provisioned users receive separate empty datasets and cannot read each other's rows.
5. Existing local data triggers the migration confirmation and uploads only after confirmation.
6. Refreshing another authenticated browser loads that user's accounts, snapshots, holdings, and preferences.
7. Concurrent edits produce a visible revision conflict instead of last-write-wins replacement.
8. Logout revokes the server session, clears the cookie and local PAM cache, and returns to the login gate.
9. Quote refresh and generated snapshots still work through `/api/quotes`.
