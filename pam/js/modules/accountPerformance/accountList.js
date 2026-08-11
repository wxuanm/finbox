import { state } from '../../config/state.js';
import { escapeHtml, formatCurrency, formatPercent, signedClass } from '../../utils/formatter.js';

export function renderAccountList(metrics) {
    const wrap = document.getElementById('accountList');
    if (!wrap) return;
    const panel = wrap.closest('.account-card-strip-panel');
    panel?.classList.toggle('is-empty', state.accounts.length === 0);

    if (state.accounts.length === 0) {
        wrap.innerHTML = `
            <div class="empty-state account-empty-state">
                <span class="account-empty-mark" aria-hidden="true">+</span>
                <strong>还没有投资账户</strong>
                <p>创建账户后，即可新增快照和持仓，查看真实收益。</p>
                <button class="primary-btn management-add-btn" type="button" data-action="add-account">新增账户</button>
            </div>
        `;
        return;
    }

    wrap.innerHTML = state.accounts.map(account => {
        const metric = metrics.find(item => item.account.id === account.id);
        const active = account.id === state.selectedAccountId;
        const accountSnapshots = state.snapshots
            .filter(snapshot => snapshot.accountId === account.id)
            .sort((a, b) => b.date.localeCompare(a.date));
        const latestSnapshot = accountSnapshots[0];
        const annualizedReturn = calculateAnnualizedReturn(metric);
        return `
            <div class="account-item${active ? ' active' : ''}">
                <button class="account-main" type="button" data-action="select-account" data-account-id="${account.id}">
                    <div class="account-card-heading">
                        <span class="account-card-mark" aria-hidden="true">A</span>
                        <div>
                            <span>资产账户</span>
                            <strong title="${escapeHtml(account.name)}">${escapeHtml(account.name)}</strong>
                            <small>最近更新 ${latestSnapshot?.date || '暂无快照'}</small>
                        </div>
                    </div>
                    <div class="account-card-metrics">
                        <div><span>总资产</span><strong>${latestSnapshot ? formatCurrency(latestSnapshot.totalValue, state.amountsHidden) : '-'}</strong></div>
                        <div><span>累计收益</span><strong class="${signedClass(metric?.profitLoss)}">${metric?.valid ? formatCurrency(metric.profitLoss, state.amountsHidden) : '-'}</strong></div>
                        <div><span>年化收益</span><strong class="${signedClass(annualizedReturn)}">${Number.isFinite(annualizedReturn) ? formatPercent(annualizedReturn) : '-'}</strong></div>
                    </div>
                </button>
                <details class="account-card-menu">
                    <summary aria-label="账户菜单">...</summary>
                    <div>
                        <button type="button" data-action="rename-account" data-account-id="${account.id}">修改名称</button>
                        <button type="button" data-action="delete-account" data-account-id="${account.id}">删除账户</button>
                    </div>
                </details>
            </div>
        `;
    }).join('');
}

function calculateAnnualizedReturn(metric) {
    if (!metric?.valid || metric.points.length < 2) return null;
    const first = metric.points[0];
    const latest = metric.points[metric.points.length - 1];
    const firstTime = new Date(`${first.date}T00:00:00`).getTime();
    const latestTime = new Date(`${latest.date}T00:00:00`).getTime();
    const days = (latestTime - firstTime) / (24 * 60 * 60 * 1000);
    if (!Number.isFinite(days) || days <= 0 || first.unitNav <= 0 || latest.unitNav <= 0) return null;
    return (Math.pow(latest.unitNav / first.unitNav, 365 / days) - 1) * 100;
}

export function bindAccountList({ onSelect, onRename, onDelete, onAdd }) {
    const panel = document.querySelector('.account-card-strip-panel');
    if (!panel) return;

    panel.addEventListener('click', event => {
        const target = event.target.closest('[data-action]');
        if (!target) return;

        if (target.dataset.action === 'add-account') {
            onAdd();
            return;
        }

        const accountId = target.dataset.accountId;
        if (target.dataset.action === 'select-account') onSelect(accountId);
        if (target.dataset.action === 'rename-account') onRename(accountId);
        if (target.dataset.action === 'delete-account') onDelete(accountId);
    });
}
