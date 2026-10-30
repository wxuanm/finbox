// Pure allocation math. Keep this free of DOM, `state`, i18n, and local-date helpers: a Pages
// Function may import it later to record class values with auto snapshots.

// Fixed display order with cash last, matching the holdings table. Rows never re-sort by weight,
// so a class stays in place as values move.
export const ALLOCATION_CLASSES = ['stock', 'fund', 'bond', 'other', 'cash'];

// `rows` are normalized holdings (marketValue already computed) each carrying a boolean `stale`.
export function buildAllocationMetrics({ accounts, snapshots, rows, excludedAccountIds = [] }) {
    const excluded = new Set(excludedAccountIds);
    const includedAccounts = accounts.filter(account => !excluded.has(account.id));
    const includedIds = new Set(includedAccounts.map(account => account.id));
    const valuedRows = rows.filter(row => includedIds.has(row.accountId) && row.marketValue > 0);
    const latestSnapshotByAccount = latestSnapshots(snapshots);

    const totals = sumByClass(valuedRows);
    const totalValue = sumValues(totals);
    const classes = ALLOCATION_CLASSES.map(assetClass => ({
        assetClass,
        value: totals[assetClass],
        weight: totalValue > 0 ? totals[assetClass] / totalValue * 100 : null,
        holdings: valuedRows
            .filter(row => row.assetClass === assetClass)
            .sort((a, b) => b.marketValue - a.marketValue)
            .map(row => ({ ...row, weight: row.marketValue / totalValue * 100 }))
    }));

    const accountMix = [];
    const missingAccounts = [];
    includedAccounts.forEach(account => {
        const accountRows = valuedRows.filter(row => row.accountId === account.id);
        if (accountRows.length > 0) {
            const accountTotals = sumByClass(accountRows);
            const accountValue = sumValues(accountTotals);
            accountMix.push({
                account,
                value: accountValue,
                classes: ALLOCATION_CLASSES.map(assetClass => ({
                    assetClass,
                    value: accountTotals[assetClass],
                    weight: accountTotals[assetClass] / accountValue * 100
                }))
            });
            return;
        }
        // Without holdings a snapshot total has no class breakdown, so it only lowers coverage.
        const snapshot = latestSnapshotByAccount.get(account.id);
        if (snapshot && snapshot.totalValue > 0) {
            missingAccounts.push({ account, value: snapshot.totalValue, date: snapshot.date });
        }
    });

    const missingValue = missingAccounts.reduce((sum, item) => sum + item.value, 0);
    const staleValue = valuedRows.filter(row => row.stale).reduce((sum, row) => sum + row.marketValue, 0);

    return {
        includedCount: includedAccounts.length,
        totalValue,
        classes,
        accountMix,
        missingAccounts,
        missingValue,
        coverage: totalValue + missingValue > 0 ? totalValue / (totalValue + missingValue) * 100 : null,
        staleShare: totalValue > 0 ? staleValue / totalValue * 100 : null,
        staleCount: valuedRows.filter(row => row.stale).length
    };
}

// Unknown ids are dropped so a deleted account never lingers in the exclusion list.
export function normalizeAllocation(value, accountIds = null) {
    const data = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const ids = Array.isArray(data.excludedAccountIds)
        ? [...new Set(data.excludedAccountIds.map(id => String(id || '').trim()).filter(Boolean))]
        : [];
    return {
        excludedAccountIds: accountIds ? ids.filter(id => accountIds.has(id)) : ids,
        updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : ''
    };
}

function sumByClass(rows) {
    const totals = Object.fromEntries(ALLOCATION_CLASSES.map(assetClass => [assetClass, 0]));
    rows.forEach(row => {
        const assetClass = ALLOCATION_CLASSES.includes(row.assetClass) ? row.assetClass : 'other';
        totals[assetClass] += row.marketValue;
    });
    return totals;
}

function sumValues(totals) {
    return ALLOCATION_CLASSES.reduce((sum, assetClass) => sum + totals[assetClass], 0);
}

function latestSnapshots(snapshots) {
    const latest = new Map();
    snapshots.forEach(snapshot => {
        const current = latest.get(snapshot.accountId);
        if (!current || snapshot.date > current.date) latest.set(snapshot.accountId, snapshot);
    });
    return latest;
}
