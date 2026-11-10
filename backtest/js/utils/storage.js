// localStorage wrapper: values are stored as { schemaVersion: 1, data }.
const SCHEMA_VERSION = 1;
export const CONFIG_KEY = 'backtest:v1:config';
export const PREFERENCES_KEY = 'backtest:v1:preferences';

export function readPayload(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return fallback;
        const parsed = JSON.parse(raw);
        if (!parsed || parsed.schemaVersion !== SCHEMA_VERSION || parsed.data === undefined) return fallback;
        return parsed.data;
    } catch (error) {
        return fallback;
    }
}

export function writePayload(key, data) {
    try {
        localStorage.setItem(key, JSON.stringify({ schemaVersion: SCHEMA_VERSION, data }));
    } catch (error) {
        // Storage full or blocked: the app keeps working without persistence.
    }
}
