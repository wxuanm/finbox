// Pure performance metrics over a backtest NAV series. No DOM, state, or i18n.

const TRADING_DAYS = 252;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * @param {string[]} dates ascending YYYY-MM-DD
 * @param {number[]} nav   NAV normalised to start at 1
 * @param {number} riskFreeRate annual, as a fraction (0.02 = 2%)
 */
export function computeMetrics(dates, nav, riskFreeRate = 0) {
    const first = nav[0];
    const last = nav[nav.length - 1];
    const totalReturn = last / first - 1;
    const years = (Date.parse(`${dates[dates.length - 1]}T00:00:00Z`) - Date.parse(`${dates[0]}T00:00:00Z`)) / DAY_MS / 365.25;
    const cagr = years > 0 ? Math.pow(last / first, 1 / years) - 1 : null;

    const drawdown = computeDrawdown(dates, nav);
    const volatility = computeVolatility(nav);
    const yearly = computeYearlyReturns(dates, nav);
    const sortedYears = yearly.filter(item => !item.partial || yearly.length === 1)
        .slice()
        .sort((a, b) => a.return - b.return);

    return {
        startDate: dates[0],
        endDate: dates[dates.length - 1],
        years,
        totalReturn,
        cagr,
        maxDrawdown: drawdown.maxDrawdown,
        maxDrawdownPeak: drawdown.peakDate,
        maxDrawdownTrough: drawdown.troughDate,
        volatility,
        sharpe: cagr !== null && volatility > 0 ? (cagr - riskFreeRate) / volatility : null,
        calmar: cagr !== null && drawdown.maxDrawdown < 0 ? cagr / Math.abs(drawdown.maxDrawdown) : null,
        yearly,
        bestYear: sortedYears.length ? sortedYears[sortedYears.length - 1] : null,
        worstYear: sortedYears.length ? sortedYears[0] : null,
        drawdownSeries: drawdown.series
    };
}

function computeDrawdown(dates, nav) {
    let peak = nav[0];
    let peakDate = dates[0];
    let maxDrawdown = 0;
    let maxPeakDate = dates[0];
    let troughDate = dates[0];
    const series = [];

    nav.forEach((value, index) => {
        if (value > peak) {
            peak = value;
            peakDate = dates[index];
        }
        const drawdown = value / peak - 1;
        series.push(drawdown);
        if (drawdown < maxDrawdown) {
            maxDrawdown = drawdown;
            maxPeakDate = peakDate;
            troughDate = dates[index];
        }
    });

    return { maxDrawdown, peakDate: maxPeakDate, troughDate, series };
}

function computeVolatility(nav) {
    const returns = [];
    for (let i = 1; i < nav.length; i += 1) returns.push(nav[i] / nav[i - 1] - 1);
    if (returns.length < 2) return 0;
    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (returns.length - 1);
    return Math.sqrt(variance) * Math.sqrt(TRADING_DAYS);
}

// Calendar-year returns. The first and last years are marked partial when the
// backtest does not cover the whole year.
export function computeYearlyReturns(dates, nav) {
    const result = [];
    let base = nav[0];
    let currentYear = dates[0].slice(0, 4);
    let yearStartDate = dates[0];

    for (let i = 0; i < dates.length; i += 1) {
        const year = dates[i].slice(0, 4);
        const isLastOfYear = i === dates.length - 1 || dates[i + 1].slice(0, 4) !== year;
        if (year !== currentYear) {
            currentYear = year;
            yearStartDate = dates[i];
        }
        if (isLastOfYear) {
            result.push({
                year,
                return: nav[i] / base - 1,
                partial: (result.length === 0 && yearStartDate.slice(5) > '01-10')
                    || (i === dates.length - 1 && dates[i].slice(5) < '12-20')
            });
            base = nav[i];
        }
    }
    return result;
}
