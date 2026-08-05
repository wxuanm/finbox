const SCHEMA_VERSION = 1;
const ACCOUNTS_KEY = 'pam:v1:accounts';
const SNAPSHOTS_KEY = 'pam:v1:snapshots';
const PREFERENCES_KEY = 'pam:v1:preferences';

export function loadAccounts() {
    const payload = readPayload(ACCOUNTS_KEY, []);
    return Array.isArray(payload)
        ? payload.filter(account => account && account.id && account.name)
        : [];
}

export function saveAccounts(accounts) {
    writePayload(ACCOUNTS_KEY, Array.isArray(accounts) ? accounts : []);
}

export function loadSnapshots() {
    const payload = readPayload(SNAPSHOTS_KEY, []);
    return Array.isArray(payload)
        ? payload.filter(snapshot => snapshot && snapshot.id && snapshot.accountId && snapshot.date)
        : [];
}

export function saveSnapshots(snapshots) {
    writePayload(SNAPSHOTS_KEY, Array.isArray(snapshots) ? snapshots : []);
}

export function loadPreferences() {
    const payload = readPayload(PREFERENCES_KEY, {});
    return payload && typeof payload === 'object' ? payload : {};
}

export function savePreferences(preferences) {
    writePayload(PREFERENCES_KEY, preferences && typeof preferences === 'object' ? preferences : {});
}

function readPayload(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return fallback;
        const parsed = JSON.parse(raw);
        if (!parsed || parsed.schemaVersion !== SCHEMA_VERSION) return fallback;
        return parsed.data ?? fallback;
    } catch (error) {
        return fallback;
    }
}

function writePayload(key, data) {
    localStorage.setItem(key, JSON.stringify({ schemaVersion: SCHEMA_VERSION, data }));
}
