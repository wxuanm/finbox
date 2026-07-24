const STORAGE_KEY = 'fund-monitor-saved-codes';

export function saveFundCodes(fundCodesSet) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(fundCodesSet)));
}

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
