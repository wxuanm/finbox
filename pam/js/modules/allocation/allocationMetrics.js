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

export const DEFAULT_BAND = Object.freeze({ absolute: 5, relative: 25 });
export const BAND_LIMITS = Object.freeze({ absolute: [0.5, 20], relative: [5, 100] });
// Targets are whole tenths; this tolerance absorbs float noise when summing them.
const TARGET_SUM_TOLERANCE = 0.01;

// Unknown ids are dropped so a deleted account never lingers in the exclusion list.
export function normalizeAllocation(value, accountIds = null) {
    const data = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const ids = Array.isArray(data.excludedAccountIds)
        ? [...new Set(data.excludedAccountIds.map(id => String(id || '').trim()).filter(Boolean))]
        : [];
    return {
        excludedAccountIds: accountIds ? ids.filter(id => accountIds.has(id)) : ids,
        updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : '',
        targets: normalizeTargets(data.targets),
        band: normalizeBand(data.band)
    };
}

// A broken target set becomes null rather than being repaired, so it never yields rebalancing amounts.
export function normalizeTargets(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const targets = {};
    for (const assetClass of ALLOCATION_CLASSES) {
        const num = value[assetClass];
        if (typeof num !== 'number' || !Number.isFinite(num) || num < 0 || num > 100) return null;
        if (Math.abs(Math.round(num * 10) - num * 10) > 1e-6) return null;
        targets[assetClass] = Math.round(num * 10) / 10;
    }
    return isTargetSumValid(targets) ? targets : null;
}

export function isTargetSumValid(targets) {
    const sum = ALLOCATION_CLASSES.reduce((total, assetClass) => total + (Number(targets[assetClass]) || 0), 0);
    return Math.abs(sum - 100) <= TARGET_SUM_TOLERANCE;
}

export function normalizeBand(value) {
    const data = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const pick = (key) => {
        const num = data[key];
        const [min, max] = BAND_LIMITS[key];
        return typeof num === 'number' && Number.isFinite(num) && num >= min && num <= max ? num : DEFAULT_BAND[key];
    };
    return { absolute: pick('absolute'), relative: pick('relative') };
}

// Whole-number starting targets from current weights, adjusted so they sum to exactly 100
// (largest-remainder rounding).
export function suggestTargets(classes) {
    const weights = ALLOCATION_CLASSES.map(assetClass => classes.find(item => item.assetClass === assetClass)?.weight || 0);
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    if (total <= 0) return Object.fromEntries(ALLOCATION_CLASSES.map(assetClass => [assetClass, 0]));
    const scaled = weights.map(weight => weight / total * 100);
    const floors = scaled.map(Math.floor);
    let remainder = 100 - floors.reduce((sum, value) => sum + value, 0);
    scaled
        .map((value, index) => ({ index, fraction: value - floors[index] }))
        .sort((a, b) => b.fraction - a.fraction || a.index - b.index)
        .forEach(({ index }) => {
            if (remainder > 0) {
                floors[index] += 1;
                remainder -= 1;
            }
        });
    return Object.fromEntries(ALLOCATION_CLASSES.map((assetClass, index) => [assetClass, floors[index]]));
}

// Drift and the 5/25 band: the tighter of an absolute and a relative threshold, so a small target
// is not stuck inside a band it can never leave. Status uses the rounded figures the page shows.
export function buildDrift(classes, targets, band) {
    if (!targets) return null;
    return ALLOCATION_CLASSES.map(assetClass => {
        const item = classes.find(entry => entry.assetClass === assetClass);
        const weight = round2(item?.weight || 0);
        const target = targets[assetClass];
        const drift = round2(weight - target);
        const tolerance = Math.min(band.absolute, target * band.relative / 100);
        const hasValue = (item?.value || 0) > 0;
        let status = 'ok';
        if (target === 0) status = hasValue ? 'over' : 'ok';
        else if (drift > tolerance) status = 'over';
        else if (drift < -tolerance) status = 'under';
        return { assetClass, weight, target, drift, tolerance, status, value: item?.value || 0 };
    });
}

// `full`: buy and sell back to the exact target; trades sum to 0.
export function buildFullRebalance(classes, targets) {
    const total = sumClassValues(classes);
    if (!targets || total <= 0) return null;
    const rows = ALLOCATION_CLASSES.map(assetClass => {
        const value = classValue(classes, assetClass);
        const targetValue = targets[assetClass] / 100 * total;
        return { assetClass, value, targetValue, trade: targetValue - value, weightAfter: targets[assetClass] };
    });
    return { mode: 'full', total, rows };
}

// `cashIn`: buy only. Without an amount it reports the minimum new money that reaches the exact
// target; with an amount it spreads that money over the underweight classes.
export function buildCashInRebalance(classes, targets, amount = null) {
    const total = sumClassValues(classes);
    if (!targets || total <= 0) return null;

    // A class that holds value against a 0% target can only shrink by selling.
    const blocked = ALLOCATION_CLASSES.filter(assetClass => targets[assetClass] === 0 && classValue(classes, assetClass) > 0);
    const reachable = ALLOCATION_CLASSES.filter(assetClass => targets[assetClass] > 0);
    const reachableTarget = reachable.reduce((sum, assetClass) => sum + targets[assetClass], 0);
    const blockedValue = blocked.reduce((sum, assetClass) => sum + classValue(classes, assetClass), 0);

    // Smallest new total at which no reachable class is over its target share. Blocked classes keep
    // their value, so the reachable classes are scaled against what is left for them.
    const share = assetClass => targets[assetClass] / reachableTarget;
    const reachableTotalNeeded = reachable.length > 0
        ? Math.max(...reachable.map(assetClass => classValue(classes, assetClass) / share(assetClass)))
        : 0;
    const targetTotal = Math.max(total, reachableTotalNeeded + blockedValue);
    const required = targetTotal - total;
    const reachableAtTarget = targetTotal - blockedValue;

    const idealBuy = assetClass => (targets[assetClass] > 0
        ? Math.max(0, share(assetClass) * reachableAtTarget - classValue(classes, assetClass))
        : 0);

    const contribution = Number(amount);
    const hasAmount = amount !== null && amount !== '' && Number.isFinite(contribution) && contribution > 0;
    let buys;
    if (!hasAmount) {
        buys = Object.fromEntries(ALLOCATION_CLASSES.map(assetClass => [assetClass, idealBuy(assetClass)]));
    } else if (contribution >= required) {
        // Reach the target first, then split the surplus by target weight among reachable classes.
        const surplus = contribution - required;
        buys = Object.fromEntries(ALLOCATION_CLASSES.map(assetClass => [
            assetClass,
            idealBuy(assetClass) + (targets[assetClass] > 0 ? surplus * share(assetClass) : 0)
        ]));
    } else {
        // Below the minimum: fill gaps at the new total in proportion, never past any class's target.
        const newTotal = total + contribution;
        const gaps = Object.fromEntries(ALLOCATION_CLASSES.map(assetClass => [
            assetClass,
            Math.max(0, targets[assetClass] / 100 * newTotal - classValue(classes, assetClass))
        ]));
        const gapSum = ALLOCATION_CLASSES.reduce((sum, assetClass) => sum + gaps[assetClass], 0);
        buys = Object.fromEntries(ALLOCATION_CLASSES.map(assetClass => [
            assetClass,
            gapSum > 0 ? gaps[assetClass] * contribution / gapSum : 0
        ]));
    }

    const spent = hasAmount ? contribution : required;
    const totalAfter = total + spent;
    // With a blocked class the full target is out of reach, so reachable classes aim at their share
    // of what the blocked class leaves; the column then matches what the plan buys toward.
    const aim = assetClass => (blocked.length > 0
        ? (targets[assetClass] > 0 ? share(assetClass) * (totalAfter - blockedValue) : 0)
        : targets[assetClass] / 100 * totalAfter);
    const rows = ALLOCATION_CLASSES.map(assetClass => {
        const value = classValue(classes, assetClass);
        const buy = buys[assetClass];
        return {
            assetClass,
            value,
            targetValue: aim(assetClass),
            trade: buy,
            weightAfter: totalAfter > 0 ? (value + buy) / totalAfter * 100 : 0
        };
    });
    return { mode: 'cashIn', total, required, amount: hasAmount ? contribution : null, blocked, rows };
}

function classValue(classes, assetClass) {
    return classes.find(item => item.assetClass === assetClass)?.value || 0;
}

function sumClassValues(classes) {
    return ALLOCATION_CLASSES.reduce((sum, assetClass) => sum + classValue(classes, assetClass), 0);
}

function round2(value) {
    return Math.round(value * 100) / 100;
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
