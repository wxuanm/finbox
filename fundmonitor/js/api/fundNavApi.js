const CACHE_PREFIX = 'fund-nav-1y:';

export async function fetchOneYearFundNav(codes) {
    const codeList = normalizeCodes(codes);
    const cacheKey = `${CACHE_PREFIX}${codeList.join(',')}`;
    const cached = readCache(cacheKey);

    if (cached) {
        return { ...cached, fromCache: true };
    }

    const data = await requestFundNav(codeList);
    writeCache(cacheKey, data);
    return { ...data, fromCache: false };
}

function normalizeCodes(codes) {
    return (Array.isArray(codes) ? codes : [codes])
        .map(code => String(code).trim())
        .filter(Boolean);
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
        if (!cached || cached.cachedDate !== getTodayKey()) {
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
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}
