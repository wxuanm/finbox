// Client for /api/history. Caches series in memory for the session, keyed by item + start.
const MAX_ITEMS_PER_REQUEST = 25;
const cache = new Map();

export function itemKey(market, symbol) {
    return `${market}:${symbol}`;
}

/**
 * @param {string[]} keys  e.g. ['CN:600519', 'Fund:110011']
 * @param {string} start   YYYY-MM-DD
 * @returns {Promise<{ series: Record<string, {name, adjust, points}>, failed: {key, error}[] }>}
 */
export async function fetchHistory(keys, start) {
    const unique = [...new Set(keys)];
    const missing = unique.filter(key => !cache.has(cacheKey(key, start)));
    const failed = [];

    for (let i = 0; i < missing.length; i += MAX_ITEMS_PER_REQUEST) {
        const chunk = missing.slice(i, i + MAX_ITEMS_PER_REQUEST);
        const params = new URLSearchParams({ items: chunk.join(','), start });
        const response = await fetch(`/api/history?${params}`);
        let payload = null;
        try {
            payload = await response.json();
        } catch (error) {
            payload = null;
        }
        if (!payload || (!response.ok && !Array.isArray(payload.failedItems))) {
            throw new Error(payload?.error || `HTTP ${response.status}`);
        }
        (payload.series || []).forEach(item => {
            cache.set(cacheKey(itemKey(item.market, item.symbol), start), {
                name: item.name,
                adjust: item.adjust,
                points: item.points
            });
        });
        (payload.failedItems || []).forEach(item => {
            failed.push({ key: itemKey(item.market, item.symbol), error: item.error });
        });
    }

    const series = {};
    unique.forEach(key => {
        const hit = cache.get(cacheKey(key, start));
        if (hit) series[key] = hit;
    });
    return { series, failed };
}

function cacheKey(key, start) {
    return `${key}@${start}`;
}
