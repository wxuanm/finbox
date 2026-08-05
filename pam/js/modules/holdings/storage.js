const SCHEMA_VERSION = 1;
const HOLDINGS_KEY = 'pam:v1:holdings';

export function loadHoldings() {
    try {
        const raw = localStorage.getItem(HOLDINGS_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!parsed || parsed.schemaVersion !== SCHEMA_VERSION || !Array.isArray(parsed.data)) return [];
        return parsed.data.filter(holding => holding && holding.id && holding.accountId && holding.name);
    } catch (error) {
        return [];
    }
}

export function saveHoldings(holdings) {
    localStorage.setItem(HOLDINGS_KEY, JSON.stringify({
        schemaVersion: SCHEMA_VERSION,
        data: Array.isArray(holdings) ? holdings : []
    }));
}
