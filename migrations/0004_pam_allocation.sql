CREATE TABLE IF NOT EXISTS pam_allocation (
    owner_id TEXT PRIMARY KEY,
    data TEXT NOT NULL DEFAULT '{}',
    updated_at TEXT NOT NULL,
    FOREIGN KEY (owner_id) REFERENCES pam_user_state(owner_id) ON DELETE CASCADE
);
