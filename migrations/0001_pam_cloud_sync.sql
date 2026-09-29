PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS pam_user_state (
    owner_id TEXT PRIMARY KEY,
    email TEXT NOT NULL DEFAULT '',
    revision INTEGER NOT NULL DEFAULT 0,
    write_token TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pam_accounts (
    owner_id TEXT NOT NULL,
    id TEXT NOT NULL,
    name TEXT NOT NULL,
    currency TEXT NOT NULL DEFAULT 'CNY',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (owner_id, id),
    FOREIGN KEY (owner_id) REFERENCES pam_user_state(owner_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS pam_snapshots (
    owner_id TEXT NOT NULL,
    id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    snapshot_date TEXT NOT NULL,
    total_value REAL NOT NULL,
    net_flow REAL NOT NULL DEFAULT 0,
    note TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT 'manual',
    PRIMARY KEY (owner_id, id),
    UNIQUE (owner_id, account_id, snapshot_date),
    FOREIGN KEY (owner_id) REFERENCES pam_user_state(owner_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_pam_snapshots_owner_account_date
    ON pam_snapshots(owner_id, account_id, snapshot_date);

CREATE TABLE IF NOT EXISTS pam_holdings (
    owner_id TEXT NOT NULL,
    id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    symbol TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL,
    asset_class TEXT NOT NULL,
    market TEXT NOT NULL,
    quantity REAL NOT NULL DEFAULT 0,
    cost_price REAL NOT NULL DEFAULT 0,
    current_price REAL NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'CNY',
    price_source TEXT NOT NULL DEFAULT 'manual',
    price_updated_at TEXT NOT NULL DEFAULT '',
    as_of_date TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (owner_id, id),
    FOREIGN KEY (owner_id) REFERENCES pam_user_state(owner_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_pam_holdings_owner_account
    ON pam_holdings(owner_id, account_id);

CREATE TABLE IF NOT EXISTS pam_preferences (
    owner_id TEXT PRIMARY KEY,
    data TEXT NOT NULL DEFAULT '{}',
    updated_at TEXT NOT NULL,
    FOREIGN KEY (owner_id) REFERENCES pam_user_state(owner_id) ON DELETE CASCADE
);
