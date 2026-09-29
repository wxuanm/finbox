PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS pam_users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    display_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
    auth_version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pam_credentials (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    key_id TEXT NOT NULL UNIQUE,
    secret_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    last_used_at TEXT NOT NULL DEFAULT '',
    expires_at TEXT NOT NULL DEFAULT '',
    revoked_at TEXT NOT NULL DEFAULT '',
    FOREIGN KEY (user_id) REFERENCES pam_users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_pam_credentials_user
    ON pam_credentials(user_id);

CREATE TABLE IF NOT EXISTS pam_sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    auth_version INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    revoked_at TEXT NOT NULL DEFAULT '',
    FOREIGN KEY (user_id) REFERENCES pam_users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_pam_sessions_user_expires
    ON pam_sessions(user_id, expires_at);
