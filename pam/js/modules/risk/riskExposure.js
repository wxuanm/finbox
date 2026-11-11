// Pure risk-exposure math. Keep this free of DOM, `state`, i18n, and local-date helpers so it can be
// tested in Node and imported by a Pages Function later.
//
// Long positions only. Every figure assumes the position exits exactly at its stop price with no fees;
// gaps, limit-down days, thin liquidity, and fund NAV settlement can make the real loss larger.

export const DEFAULT_RISK_SETTINGS = Object.freeze({
    // A holding without its own stop is estimated as if its stop sat this far below the current price.
    defaultStopPct: 5,
    // Survival line: summed planned principal loss as a share of net contribution.
    principalLimit: 5,
    // Quality line: projected drawdown from the unit-NAV peak once every position exits at its stop.
    drawdownLimit: 10,
    // 1R for the new-position calculator, as a share of current net value.
    riskPerTradePct: 1
});

export const RISK_SETTING_LIMITS = Object.freeze({
    defaultStopPct: [0.5, 50],
    principalLimit: [0.5, 50],
    drawdownLimit: [1, 80],
    riskPerTradePct: [0.1, 10]
});

// A line counts as `near` from this share of its limit, so the warning shows before the limit is hit.
const NEAR_LIMIT_SHARE = 0.8;

export function normalizeRiskSettings(value) {
    const data = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    return Object.fromEntries(Object.keys(DEFAULT_RISK_SETTINGS).map(key => {
        const num = data[key];
        const [min, max] = RISK_SETTING_LIMITS[key];
        const valid = typeof num === 'number' && Number.isFinite(num) && num >= min && num <= max;
        return [key, valid ? num : DEFAULT_RISK_SETTINGS[key]];
    }));
}

// Stops are positive prices. Anything else (empty, 0, negative, text) means "not set".
export function normalizeStopPrice(value) {
    if (value === null || value === undefined || value === '') return null;
    const num = Number(value);
    return Number.isFinite(num) && num > 0 ? num : null;
}

export function isCashHolding(row) {
    return row.assetClass === 'cash' || row.market === 'Cash';
}

// `row` is a normalized holding (quantity, costPrice, currentPrice, marketValue as numbers).
export function buildPositionRisk(row, settings = DEFAULT_RISK_SETTINGS) {
    if (isCashHolding(row)) return null;
    const quantity = Number(row.quantity);
    const currentPrice = Number(row.currentPrice);
    const costPrice = Number(row.costPrice);
    if (!(quantity > 0) || !(currentPrice > 0) || !Number.isFinite(costPrice)) return null;

    const manualStop = normalizeStopPrice(row.stopPrice);
    const stopSource = manualStop === null ? 'default' : 'manual';
    const stopPrice = manualStop ?? currentPrice * (1 - settings.defaultStopPct / 100);
    // At or below a manual stop the stop has fired but not filled: the realistic exit is now, at the
    // current price, so nothing is left to give back from here.
    const triggered = stopSource === 'manual' && currentPrice <= stopPrice;
    const exitPrice = triggered ? currentPrice : stopPrice;
    const exposure = (currentPrice - exitPrice) * quantity;
    const principalLoss = Math.max(0, costPrice - exitPrice) * quantity;

    return {
        ...row,
        quantity,
        currentPrice,
        costPrice,
        marketValue: quantity * currentPrice,
        stopSource,
        stopPrice,
        triggered,
        exitPrice,
        exitValue: exitPrice * quantity,
        exposure,
        principalLoss,
        // P/L kept (positive) or lost (negative) against cost if the position exits at its stop.
        exitPnl: (exitPrice - costPrice) * quantity,
        stopDistancePct: (currentPrice - stopPrice) / currentPrice * 100,
        breakEvenProtected: exitPrice >= costPrice
    };
}

// `rows`: normalized holdings of one scope, each with a boolean `stale`.
// `series`: the share-based NAV series of the same scope ({ points: [{ unitNav, shares, totalValue,
// netContribution, date }] }), or null when the scope has no calculable snapshot history.
export function buildRiskMetrics({ rows, series = null, settings = DEFAULT_RISK_SETTINGS }) {
    const valued = rows.filter(row => Number(row.marketValue) > 0);
    const positions = valued
        .map(row => buildPositionRisk(row, settings))
        .filter(Boolean)
        .sort((a, b) => b.exposure - a.exposure || b.marketValue - a.marketValue);

    const cashValue = valued.filter(isCashHolding).reduce((sum, row) => sum + Number(row.marketValue), 0);
    const investedValue = sum(positions, 'marketValue');
    const equity = investedValue + cashValue;
    const exposure = sum(positions, 'exposure');
    const principalLoss = sum(positions, 'principalLoss');
    const exitEquity = equity - exposure;

    const defaults = positions.filter(position => position.stopSource === 'default');
    const stale = positions.filter(position => position.stale);
    const nav = buildNavContext(series, equity);
    const principal = nav?.principal > 0 ? nav.principal : null;
    const principalPct = principal ? principalLoss / principal * 100 : null;
    const projectedDrawdownPct = nav ? drawdownPct(nav.peakUnitNav, exitEquity / nav.shares) : null;

    return {
        positions,
        equity,
        cashValue,
        investedValue,
        exposure,
        exposurePct: equity > 0 ? exposure / equity * 100 : null,
        exitEquity,
        principalLoss,
        principal,
        principalPct,
        principalStatus: lineStatus(principalPct, settings.principalLimit),
        nav,
        currentDrawdownPct: nav ? drawdownPct(nav.peakUnitNav, nav.currentUnitNav) : null,
        projectedDrawdownPct,
        drawdownStatus: lineStatus(projectedDrawdownPct, settings.drawdownLimit),
        defaultCount: defaults.length,
        defaultShare: investedValue > 0 ? sum(defaults, 'marketValue') / investedValue * 100 : null,
        triggeredCount: positions.filter(position => position.triggered).length,
        staleCount: stale.length,
        staleShare: investedValue > 0 ? sum(stale, 'marketValue') / investedValue * 100 : null,
        settings
    };
}

// Unit NAV removes deposits and withdrawals, so a top-up never creates a fake high-water mark. The
// current unit NAV is the holdings value over the latest snapshot's shares, which assumes no cash flow
// since that snapshot.
function buildNavContext(series, equity) {
    const points = Array.isArray(series?.points) ? series.points : [];
    const latest = points[points.length - 1];
    if (!latest || !(latest.shares > 0) || !(equity > 0)) return null;
    const currentUnitNav = equity / latest.shares;
    const historicalPeak = points.reduce((peak, point) => Math.max(peak, Number(point.unitNav) || 0), 0);
    return {
        shares: latest.shares,
        principal: Number(latest.netContribution),
        latestDate: latest.date,
        latestTotalValue: latest.totalValue,
        // How far holdings value has moved from the latest snapshot total; a large gap means the snapshot
        // is old or holdings do not cover the whole account.
        snapshotGapPct: latest.totalValue > 0 ? (equity / latest.totalValue - 1) * 100 : null,
        currentUnitNav,
        historicalPeak,
        peakUnitNav: Math.max(historicalPeak, currentUnitNav)
    };
}

function drawdownPct(peak, unitNav) {
    if (!(peak > 0) || !Number.isFinite(unitNav)) return null;
    return Math.max(0, (1 - unitNav / peak) * 100);
}

export function lineStatus(value, limit) {
    if (!Number.isFinite(value) || !(limit > 0)) return 'unknown';
    if (value >= limit) return 'over';
    if (value >= limit * NEAR_LIMIT_SHARE) return 'near';
    return 'ok';
}

// New-position calculator. Sizes a long entry so that a stop-out costs at most 1R, and no more than what
// is left under the survival line once existing positions are counted. Assumes the entry is near the
// current price and paid from cash, so net value is unchanged on entry.
export function buildTrialPosition({ entry, stop, riskAmount, lotSize = 1, metrics }) {
    const entryPrice = Number(entry);
    const stopPrice = Number(stop);
    const budget = Number(riskAmount);
    const lot = Number(lotSize) >= 1 ? Math.floor(Number(lotSize)) : 1;
    if (!(entryPrice > 0) || !(stopPrice > 0)) return { error: 'missingPrices' };
    if (stopPrice >= entryPrice) return { error: 'stopAboveEntry' };
    if (!(budget > 0)) return { error: 'missingBudget' };

    const perUnitRisk = entryPrice - stopPrice;
    const roundDown = units => Math.max(0, Math.floor(units / lot) * lot);
    const rUnits = roundDown(budget / perUnitRisk);

    const { settings } = metrics;
    const principalRoom = metrics.principal
        ? metrics.principal * settings.principalLimit / 100 - metrics.principalLoss
        : null;
    const limitUnits = principalRoom === null ? null : roundDown(Math.max(0, principalRoom) / perUnitRisk);
    const units = limitUnits === null ? rUnits : Math.min(rUnits, limitUnits);
    const addedRisk = units * perUnitRisk;
    const value = units * entryPrice;

    const principalPctAfter = metrics.principal ? (metrics.principalLoss + addedRisk) / metrics.principal * 100 : null;
    const projectedDrawdownAfter = metrics.nav
        ? drawdownPct(metrics.nav.peakUnitNav, (metrics.exitEquity - addedRisk) / metrics.nav.shares)
        : null;

    return {
        entryPrice,
        stopPrice,
        lot,
        budget,
        perUnitRisk,
        stopDistancePct: perUnitRisk / entryPrice * 100,
        rUnits,
        limitUnits,
        principalRoom,
        limitedBy: limitUnits !== null && limitUnits < rUnits ? 'principal' : 'r',
        units,
        value,
        addedRisk,
        weightPct: metrics.equity > 0 ? value / metrics.equity * 100 : null,
        exceedsCash: value > metrics.cashValue + 1e-9,
        principalPctAfter,
        principalStatusAfter: lineStatus(principalPctAfter, settings.principalLimit),
        projectedDrawdownAfter,
        drawdownStatusAfter: lineStatus(projectedDrawdownAfter, settings.drawdownLimit)
    };
}

function sum(items, key) {
    return items.reduce((total, item) => total + Number(item[key] || 0), 0);
}
