export const ASSET_CLASSES = [
    ['stock', '股票'],
    ['fund', '基金'],
    ['bond', '债券'],
    ['cash', '现金'],
    ['other', '其他']
];

export const MARKETS = [
    ['CN', 'A股/境内'],
    ['Fund', '基金'],
    ['Cash', '现金'],
    ['Other', '其他']
];

export function buildHoldingsMetrics(holdings, accounts, filters) {
    const accountById = new Map(accounts.map(account => [account.id, account]));
    const rows = holdings
        .filter(holding => accountById.has(holding.accountId))
        .map(holding => normalizeHolding(holding, accountById.get(holding.accountId)))
        .filter(Boolean);
    const filteredRows = rows.filter(row => {
        if (filters.accountId !== 'all' && row.accountId !== filters.accountId) return false;
        if (filters.assetClass !== 'all' && row.assetClass !== filters.assetClass) return false;
        if (filters.market !== 'all' && row.market !== filters.market) return false;
        return true;
    });
    const totalMarketValue = filteredRows.reduce((sum, row) => sum + row.marketValue, 0);
    const totalCost = filteredRows.reduce((sum, row) => sum + row.costAmount, 0);
    const totalPnl = totalMarketValue - totalCost;
    const totalPnlPct = totalCost > 0 ? totalPnl / totalCost * 100 : null;

    return {
        rows: filteredRows.map(row => ({
            ...row,
            weight: totalMarketValue > 0 ? row.marketValue / totalMarketValue * 100 : null
        })),
        allRows: rows,
        summary: {
            totalMarketValue,
            totalCost,
            totalPnl,
            totalPnlPct,
            count: filteredRows.length
        },
        assetAllocation: groupAllocation(filteredRows, 'assetClass', totalMarketValue),
        accountAllocation: groupAllocation(filteredRows, 'accountName', totalMarketValue)
    };
}

export function getAssetClassLabel(value) {
    return ASSET_CLASSES.find(([key]) => key === value)?.[1] || '其他';
}

export function getMarketLabel(value) {
    return MARKETS.find(([key]) => key === value)?.[1] || '其他';
}

function normalizeHolding(holding, account) {
    const quantity = Number(holding.quantity);
    const costPrice = Number(holding.costPrice);
    const currentPrice = Number(holding.currentPrice);
    if (!Number.isFinite(quantity) || !Number.isFinite(costPrice) || !Number.isFinite(currentPrice)) return null;

    const costAmount = quantity * costPrice;
    const marketValue = quantity * currentPrice;
    const unrealizedPnl = marketValue - costAmount;
    const unrealizedPnlPct = costAmount > 0 ? unrealizedPnl / costAmount * 100 : null;

    return {
        ...holding,
        accountName: account.name,
        quantity,
        costPrice,
        currentPrice,
        costAmount,
        marketValue,
        unrealizedPnl,
        unrealizedPnlPct
    };
}

function groupAllocation(rows, key, total) {
    const map = new Map();
    rows.forEach(row => {
        const label = key === 'assetClass' ? getAssetClassLabel(row.assetClass) : row[key];
        map.set(label, (map.get(label) || 0) + row.marketValue);
    });
    return [...map.entries()]
        .map(([label, value]) => ({ label, value, weight: total > 0 ? value / total * 100 : null }))
        .sort((a, b) => b.value - a.value);
}
