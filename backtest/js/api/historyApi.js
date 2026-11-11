// Client for /api/history. Caches series in memory for the session, one entry per item.
// The API returns every point from `start` onwards, and values do not depend on `start`
// (A-shares are back-adjusted absolutes, fund series are chained from inception), so a
// cached series fetched from an earlier start can serve any later start by slicing.
const MAX_ITEMS_PER_REQUEST = 25;
const cache = new Map(); // item key -> { start, name, adjust, points }

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
    // Refetch only items never loaded, or loaded from a later start than requested.
    const missing = unique.filter(key => !covers(cache.get(key), start));
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
            cache.set(itemKey(item.market, item.symbol), {
                start,
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
        const hit = cache.get(key);
        if (!covers(hit, start)) return;
        // Slice to exactly what a fresh request from `start` would return.
        series[key] = {
            name: hit.name,
            adjust: hit.adjust,
            points: hit.start === start ? hit.points : hit.points.filter(([date]) => date >= start)
        };
    });
    return { series, failed };
}

// YYYY-MM-DD strings compare lexically.
function covers(entry, start) {
    return Boolean(entry) && entry.start <= start;
}
