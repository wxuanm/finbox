import { state } from '../../config/state.js';
import { escapeHtml, formatCurrency, formatPercent, signedClass } from '../../utils/formatter.js';

export function renderAccountList(metrics) {
    const wrap = document.getElementById('accountList');
    if (!wrap) return;

    if (state.accounts.length === 0) {
        wrap.innerHTML = '<div class="empty-state">还没有投资账户。创建一个账户，并录入两条以上资产快照后，即可生成账户收益曲线。</div>';
        return;
    }

    wrap.innerHTML = state.accounts.map(account => {
        const metric = metrics.find(item => item.account.id === account.id);
        const active = account.id === state.selectedAccountId;
        const snapshotCount = state.snapshots.filter(snapshot => snapshot.accountId === account.id).length;
        const valueText = metric?.valid ? formatCurrency(metric.latestValue) : `${snapshotCount} 条快照`;
        const statusText = metric?.valid ? '可计算收益' : (snapshotCount === 0 ? '待录入' : '需至少两条');
        const statusClass = metric?.valid ? 'ready' : 'warning';
        const returnText = metric?.valid ? formatPercent(metric.periodReturn) : '暂无收益';
        return `
            <div class="account-item${active ? ' active' : ''}">
                <button class="account-main" type="button" data-action="select-account" data-account-id="${account.id}">
                    <strong>${escapeHtml(account.name)}</strong>
                    <span>${valueText}</span>
                    <div class="account-meta-row">
                        <span class="status-pill ${statusClass}">${statusText}</span>
                        <span class="status-pill ${signedClass(metric?.periodReturn)}">区间 ${returnText}</span>
                    </div>
                </button>
                <div class="account-actions">
                    <button class="mini-btn" type="button" data-action="rename-account" data-account-id="${account.id}">编辑</button>
                    <button class="mini-btn" type="button" data-action="delete-account" data-account-id="${account.id}">删除</button>
                </div>
            </div>
        `;
    }).join('');
}

export function bindAccountList({ onSelect, onRename, onDelete }) {
    const wrap = document.getElementById('accountList');
    if (!wrap) return;

    wrap.addEventListener('click', event => {
        const target = event.target.closest('[data-action]');
        if (!target) return;

        const accountId = target.dataset.accountId;
        if (target.dataset.action === 'select-account') onSelect(accountId);
        if (target.dataset.action === 'rename-account') onRename(accountId);
        if (target.dataset.action === 'delete-account') onDelete(accountId);
    });
}
