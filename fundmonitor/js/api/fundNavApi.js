const CACHE_PREFIX = 'fund-nav-3y:';

export async function fetchThreeYearFundNav(codes) {
    const codeList = normalizeCodes(codes);
    const cacheKey = `${CACHE_PREFIX}${buildCacheKeyCodes(codeList).join(',')}`;
    const cached = readCache(cacheKey);

    if (cached) {
        return { ...cached, fromCache: true };
    }

    const data = await requestFundNav(codeList);
    writeCache(cacheKey, data);
    return { ...data, fromCache: false };
}

export function clearFundNavCache() {
    try {
        Object.keys(localStorage)
            .filter(key => key.startsWith(CACHE_PREFIX) || key.startsWith('fund-nav-1y:'))
            .forEach(key => localStorage.removeItem(key));
    } catch (error) {
        // localStorage can be unavailable; stale cache cleanup is best-effort.
    }
}

function normalizeCodes(codes) {
    return (Array.isArray(codes) ? codes : [codes])
        .map(code => String(code).trim())
        .filter(Boolean);
}

function buildCacheKeyCodes(codeList) {
    return [...new Set(codeList)].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
}

async function requestFundNav(codeList) {
    const response = await fetch(`/api/fundnav?code=${encodeURIComponent(codeList.join(','))}`);
    const data = await response.json();

    if (!response.ok || !Array.isArray(data.funds) || data.funds.length === 0) {
        throw new Error(data.error || 'Fund nav fetch failed');
    }

    return data;
}

function readCache(cacheKey) {
    try {
        const raw = localStorage.getItem(cacheKey);
        if (!raw) return null;

        const cached = JSON.parse(raw);
        if (!cached || cached.cachedDate !== getTodayKey() || !isSameLocalDate(cached.data?.updatedAt)) {
            localStorage.removeItem(cacheKey);
            return null;
        }

        return cached.data;
    } catch (error) {
        return null;
    }
}

function writeCache(cacheKey, data) {
    try {
        localStorage.setItem(cacheKey, JSON.stringify({ cachedDate: getTodayKey(), data }));
    } catch (error) {
        // localStorage can be full or disabled; the network response is still usable.
    }
}

function getTodayKey() {
    const date = new Date();
    return getLocalDateKey(date);
}

function isSameLocalDate(value) {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) && getLocalDateKey(date) === getTodayKey();
}

function getLocalDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}
