import { normalizeAllocation } from './allocationMetrics.js';

const SCHEMA_VERSION = 1;
const ALLOCATION_KEY = 'pam:v1:allocation';

export function loadAllocation() {
    try {
        const raw = localStorage.getItem(ALLOCATION_KEY);
        if (!raw) return normalizeAllocation(null);
        const parsed = JSON.parse(raw);
        if (!parsed || parsed.schemaVersion !== SCHEMA_VERSION) return normalizeAllocation(null);
        return normalizeAllocation(parsed.data);
    } catch (error) {
        return normalizeAllocation(null);
    }
}

export function saveAllocation(allocation) {
    localStorage.setItem(ALLOCATION_KEY, JSON.stringify({
        schemaVersion: SCHEMA_VERSION,
        data: normalizeAllocation(allocation)
    }));
    window.dispatchEvent(new CustomEvent('pam:local-data-change', { detail: { domain: 'allocation' } }));
}
