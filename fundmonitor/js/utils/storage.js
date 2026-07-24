const STORAGE_KEY = 'fund-monitor-saved-codes';
const GROUPS_KEY = 'fund-monitor-groups';
const FUND_GROUPS_KEY = 'fund-monitor-fund-groups';

export function saveFundCodes() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(state.fundCodes)));
    localStorage.setItem(GROUPS_KEY, JSON.stringify(state.groups));
    localStorage.setItem(FUND_GROUPS_KEY, JSON.stringify(state.fundGroups));
}

import { state } from '../config/state.js';

export function loadSavedFundCodes() {
    try {
        const rawValue = localStorage.getItem(STORAGE_KEY);
        if (!rawValue) {
            return [];
        }

        const parsed = JSON.parse(rawValue);
        if (!Array.isArray(parsed)) {
            return [];
        }

        return parsed
            .map(code => String(code).trim())
            .filter(code => code !== '');
    } catch (error) {
        return [];
    }
}

export function loadSavedGroups() {
    try {
        const raw = localStorage.getItem(GROUPS_KEY);
        if (!raw) return ['default'];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed) || !parsed.includes('default')) {
            return ['default'];
        }
        return parsed;
    } catch (error) {
        return ['default'];
    }
}

export function loadSavedFundGroups() {
    try {
        const raw = localStorage.getItem(FUND_GROUPS_KEY);
        if (!raw) return {};
        return JSON.parse(raw);
    } catch (error) {
        return {};
    }
}
