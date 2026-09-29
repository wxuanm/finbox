ALTER TABLE pam_users ADD COLUMN password_salt TEXT NOT NULL DEFAULT '';
ALTER TABLE pam_users ADD COLUMN password_hash TEXT NOT NULL DEFAULT '';
ALTER TABLE pam_users ADD COLUMN password_iterations INTEGER NOT NULL DEFAULT 0;
ALTER TABLE pam_users ADD COLUMN password_updated_at TEXT NOT NULL DEFAULT '';
