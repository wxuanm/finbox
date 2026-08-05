import { state } from '../../config/state.js';
import { escapeHtml, formatCurrency, formatNumber, formatPercent, signedClass } from '../../utils/formatter.js';

export function renderOverviewCards(metrics) {
    const wrap = document.getElementById('overviewCards');
    if (!wrap) return;
    const valid = metrics.filter(metric => metric.valid);
    const latestValue = valid.reduce((sum, metric) => sum + metric.latestValue, 0);
    const profitLoss = valid.reduce((sum, metric) => sum + metric.profitLoss, 0);
    const best = valid.reduce((current, metric) => !current || metric.periodReturn > current.periodReturn ? metric : current, null);
    const latestDate = valid.reduce((latest, metric) => metric.latestDate > latest ? metric.latestDate : latest, '');
    const syncedCount = latestDate ? valid.filter(metric => metric.latestDate === latestDate).length : 0;
    const laggedCount = Math.max(valid.length - syncedCount, 0);

    wrap.innerHTML = [
        card('最新总资产', formatCurrency(latestValue), '有效账户合计'),
        card('累计盈亏', formatCurrency(profitLoss), '基于净投入估算', signedClass(profitLoss)),
        card('区间最佳', best ? formatPercent(best.periodReturn) : '-', best ? best.account.name : '等待有效快照', signedClass(best?.periodReturn)),
        card('数据状态', `${valid.length}/${state.accounts.length}`, latestDate ? `${syncedCount}/${valid.length} 已更新到 ${latestDate}${laggedCount > 0 ? `，${laggedCount} 个滞后` : ''}` : '可计算 / 全部账户')
    ].join('');
}

export function renderMetricCards(metrics) {
    const wrap = document.getElementById('metricCards');
    if (!wrap) return;

    if (state.accounts.length === 0) {
        wrap.innerHTML = '';
        return;
    }

    wrap.innerHTML = metrics.map(metric => {
        const active = state.selectedHighlightAccountId === metric.account.id;
        if (!metric.valid) {
            return `
                <button class="metric-card${active ? ' active' : ''}" type="button" data-highlight-account="${metric.account.id}">
                    <div class="metric-head">
                        <div><strong>${escapeHtml(metric.account.name)}</strong><span class="metric-label">数据不足</span></div>
                    </div>
                    <div class="empty-state">${escapeHtml(metric.error || '至少需要两条有效快照')}</div>
                </button>
            `;
        }

        return `
            <button class="metric-card${active ? ' active' : ''}" type="button" data-highlight-account="${metric.account.id}">
                <div class="metric-head">
                    <div>
                        <strong>${escapeHtml(metric.account.name)}</strong>
                        <span class="metric-label">最新日期 ${metric.latestDate}</span>
                    </div>
                    <div>
                        <div class="metric-return ${signedClass(metric.periodReturn)}">${formatPercent(metric.periodReturn)}</div>
                        <span class="metric-period-label">当前区间收益</span>
                    </div>
                </div>
                <div class="metric-body">
                    ${metricCell('最新资产', formatCurrency(metric.latestValue), '', true)}
                    ${metricCell('净投入', formatCurrency(metric.netContribution))}
                    ${metricCell('累计盈亏', formatCurrency(metric.profitLoss), signedClass(metric.profitLoss))}
                    ${metricCell('累计收益', formatPercent(metric.cumulativeReturn), signedClass(metric.cumulativeReturn))}
                    ${metricCell('最大回撤', formatPercent(metric.maxDrawdown), signedClass(metric.maxDrawdown))}
                    ${metricCell('年化波动', formatPercent(metric.annualizedVolatility))}
                </div>
            </button>
        `;
    }).join('');
}

export function bindMetricCards(onHighlight) {
    const wrap = document.getElementById('metricCards');
    if (!wrap) return;
    wrap.addEventListener('click', event => {
        const cardEl = event.target.closest('[data-highlight-account]');
        if (!cardEl) return;
        onHighlight(cardEl.dataset.highlightAccount);
    });
}

function card(label, value, note, className = '') {
    return `<div class="overview-card"><span>${label}</span><strong class="${className}">${value}</strong><small>${escapeHtml(note)}</small></div>`;
}

function metricCell(label, value, className = '', primary = false) {
    return `<div class="metric-cell${primary ? ' primary-metric' : ''}"><span class="metric-label">${label}</span><strong class="${className}">${value}</strong></div>`;
}
