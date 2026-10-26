// Pure valuation rules shared by the browser snapshot dialog and the server auto-snapshot job.
// Keep this module free of DOM, `state`, i18n, and local-timezone helpers so Pages Functions can import it.

export const SNAPSHOT_DATE_REFERENCE_FUNDS = Object.freeze([
    { market: 'Fund', symbol: '110001', name: '易方达平稳增长混合' },
    { market: 'Fund', symbol: '000001', name: '华夏成长混合' },
    { market: 'Fund', symbol: '270002', name: '广发稳健增长混合A' }
]);

export const QUOTE_MARKETS = Object.freeze(['CN', 'Fund']);

export function quoteKey(item) {
    return `${item.market}:${item.symbol}`;
}

export function isQuotableHolding(holding) {
    return QUOTE_MARKETS.includes(holding?.market) && Boolean(holding?.symbol);
}

// Ordinary funds only publish NAV on trading days, so the latest reference NAV date is the previous trading day.
export function resolveReferenceNavDate(quoteByKey) {
    const navDates = SNAPSHOT_DATE_REFERENCE_FUNDS
        .map(fund => quoteByKey.get(quoteKey(fund))?.navDate)
        .filter(Boolean)
        .sort();
    return navDates[navDates.length - 1] || '';
}

// `dateOption` '1' is the previous-trading-day snapshot; any other value is the current-day snapshot.
// `isStale` marks a fund NAV that is not from the snapshot date (QDII, late disclosure).
export function resolveSnapshotPrice(holding, quote, dateOption, snapshotDate) {
    if (holding.market === 'CN') {
        const quotePrice = resolveAshareSnapshotPrice(quote, dateOption, snapshotDate);
        if (Number.isFinite(quotePrice) && quotePrice > 0) return { price: quotePrice, isFallback: false, isStale: false };
        return { price: manualHoldingPrice(holding), isFallback: true, isStale: false };
    }

    if (holding.market === 'Fund') {
        const unitNav = Number(quote?.snapshotUnitNav);
        if (Number.isFinite(unitNav) && unitNav > 0) {
            const isStale = dateOption === '1' && Boolean(snapshotDate) && quote?.navDate !== snapshotDate;
            return { price: unitNav, isFallback: false, isStale };
        }
        return { price: manualHoldingPrice(holding), isFallback: true, isStale: false };
    }

    return { price: manualHoldingPrice(holding), isFallback: true, isStale: false };
}

// Previous-trading-day snapshots value A-shares at the close of the snapshot date. When the latest
// quote's trade date is the snapshot date (weekends, holidays), latestPrice is that close. Otherwise
// previousClose is the close of the snapshot date.
export function resolveAshareSnapshotPrice(quote, dateOption, snapshotDate) {
    if (dateOption !== '1') return Number(quote?.latestPrice ?? quote?.previousClose);
    if (quote?.tradeDate && quote.tradeDate === snapshotDate) return Number(quote?.latestPrice);
    return Number(quote?.previousClose);
}

export function manualHoldingPrice(holding) {
    const price = Number(holding.currentPrice);
    return Number.isFinite(price) ? price : null;
}

export function getAccountHoldingMarketValue(holdings, accountId, priceByHoldingId = new Map()) {
    return holdings
        .filter(holding => holding.accountId === accountId)
        .reduce((sum, holding) => {
            const quantity = Number(holding.quantity);
            const currentPrice = Number(priceByHoldingId.get(holding.id) ?? holding.currentPrice);
            if (!Number.isFinite(quantity) || !Number.isFinite(currentPrice)) return sum;
            return sum + quantity * currentPrice;
        }, 0);
}
