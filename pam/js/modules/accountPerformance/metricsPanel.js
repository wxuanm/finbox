import { state } from '../../config/state.js';
import { escapeHtml, formatCurrency, formatPercent, signedClass } from '../../utils/formatter.js';

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

export function renderAccountComparison(metrics) {
    const wrap = document.getElementById('accountComparison');
    if (!wrap) return;

    if (state.accounts.length === 0) {
        wrap.innerHTML = '<div class="empty-state">暂无账户。进入“资产数据”新增账户并录入快照。</div>';
        return;
    }

    const sortedMetrics = [...metrics].sort(compareMetrics);
    const columns = [
        ['name', '账户'],
        ['periodReturn', '区间收益'],
        ['cumulativeReturn', '累计收益'],
        ['latestValue', '最新资产'],
        ['profitLoss', '累计盈亏'],
        ['maxDrawdown', '区间回撤'],
        ['annualizedVolatility', '区间波动'],
        ['latestDate', '最新快照']
    ];

    wrap.innerHTML = `
        <table class="comparison-table">
            <thead>
                <tr>
                    ${columns.map(([key, label]) => `
                        <th class="${key === 'name' ? '' : 'number-cell'}" data-comparison-sort="${key}">
                            <button type="button">${label}${sortIcon(key)}</button>
                        </th>
                    `).join('')}
                </tr>
            </thead>
            <tbody>
                ${sortedMetrics.map(metric => renderComparisonRow(metric)).join('')}
            </tbody>
        </table>
    `;
}

export function bindAccountComparison({ onHighlight, onSort }) {
    const wrap = document.getElementById('accountComparison');
    if (!wrap) return;
    wrap.addEventListener('click', event => {
        const sortHeader = event.target.closest('[data-comparison-sort]');
        if (sortHeader) {
            onSort(sortHeader.dataset.comparisonSort);
            return;
        }

        const row = event.target.closest('[data-highlight-account]');
        if (row) onHighlight(row.dataset.highlightAccount);
    });
}

function card(label, value, note, className = '') {
    return `<div class="overview-card"><span>${label}</span><strong class="${className}">${value}</strong><small>${escapeHtml(note)}</small></div>`;
}

function renderComparisonRow(metric) {
    const active = state.selectedHighlightAccountId === metric.account.id;
    if (!metric.valid) {
        return `
            <tr class="comparison-row invalid${active ? ' active' : ''}" data-highlight-account="${metric.account.id}">
                <td><strong>${escapeHtml(metric.account.name)}</strong><small>${escapeHtml(metric.error || '数据不足')}</small></td>
                <td colspan="7">至少需要两条有效快照</td>
            </tr>
        `;
    }

    return `
        <tr class="comparison-row${active ? ' active' : ''}" data-highlight-account="${metric.account.id}">
            <td><strong>${escapeHtml(metric.account.name)}</strong><small>点击高亮走势</small></td>
            <td class="number-cell ${signedClass(metric.periodReturn)}">${formatPercent(metric.periodReturn)}</td>
            <td class="number-cell ${signedClass(metric.cumulativeReturn)}">${formatPercent(metric.cumulativeReturn)}</td>
            <td class="number-cell">${formatCurrency(metric.latestValue)}</td>
            <td class="number-cell ${signedClass(metric.profitLoss)}">${formatCurrency(metric.profitLoss)}</td>
            <td class="number-cell ${signedClass(metric.maxDrawdown)}">${formatPercent(metric.maxDrawdown)}</td>
            <td class="number-cell">${formatPercent(metric.annualizedVolatility)}</td>
            <td class="number-cell">${metric.latestDate || '-'}</td>
        </tr>
    `;
}

function compareMetrics(a, b) {
    const direction = state.comparisonSortOrder || -1;
    const key = state.comparisonSortKey || 'periodReturn';
    if (key === 'name') return a.account.name.localeCompare(b.account.name, 'zh-CN', { numeric: true }) * direction;
    if (key === 'latestDate') return String(a.latestDate || '').localeCompare(String(b.latestDate || '')) * direction;

    const aValue = a.valid ? Number(a[key]) : Number.NEGATIVE_INFINITY;
    const bValue = b.valid ? Number(b[key]) : Number.NEGATIVE_INFINITY;
    if (!Number.isFinite(aValue) && !Number.isFinite(bValue)) return 0;
    if (!Number.isFinite(aValue)) return 1;
    if (!Number.isFinite(bValue)) return -1;
    return (aValue - bValue) * direction;
}

function sortIcon(key) {
    if (state.comparisonSortKey !== key) return '';
    return state.comparisonSortOrder === 1 ? ' ▲' : ' ▼';
}
