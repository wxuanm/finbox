import { state } from '../../config/state.js';
import { escapeHtml, formatCurrency, formatNumber, formatPercent, signedClass, todayKey } from '../../utils/formatter.js';
import { ASSET_CLASSES, MARKETS, getAssetClassLabel, getMarketLabel } from './holdingsMetrics.js';

export function renderHoldingsPanel(metrics) {
    renderHoldingFilters();
    renderHoldingOverview(metrics);
    renderHoldingForm();
    renderAllocation('assetAllocation', metrics.assetAllocation);
    renderAllocation('accountAllocation', metrics.accountAllocation);
    renderHoldingTable(metrics.rows);
}

export function bindHoldingsPanel({ onFilter, onSubmit, onCancelEdit, onEdit, onDelete, onSort, onRefreshQuotes, onGenerateSnapshots }) {
    document.getElementById('holdingFilterAccount')?.addEventListener('change', event => onFilter('accountId', event.target.value));
    document.getElementById('holdingFilterAssetClass')?.addEventListener('change', event => onFilter('assetClass', event.target.value));
    document.getElementById('holdingFilterMarket')?.addEventListener('change', event => onFilter('market', event.target.value));
    document.getElementById('holdingAssetClassSelect')?.addEventListener('change', updateCashMode);
    document.getElementById('holdingCurrentPriceInput')?.addEventListener('input', syncCashAmountFields);
    document.getElementById('holdingForm')?.addEventListener('submit', event => {
        event.preventDefault();
        onSubmit(readHoldingForm());
    });
    document.getElementById('cancelHoldingEditBtn')?.addEventListener('click', onCancelEdit);
    document.getElementById('refreshQuotesBtn')?.addEventListener('click', onRefreshQuotes);
    document.getElementById('generateSnapshotsBtn')?.addEventListener('click', onGenerateSnapshots);
    document.getElementById('holdingTable')?.addEventListener('click', event => {
        const sortHeader = event.target.closest('[data-holding-sort]');
        if (sortHeader) {
            onSort(sortHeader.dataset.holdingSort);
            return;
        }

        const action = event.target.closest('[data-holding-action]');
        if (!action) return;
        if (action.dataset.holdingAction === 'edit') onEdit(action.dataset.holdingId);
        if (action.dataset.holdingAction === 'delete') onDelete(action.dataset.holdingId);
    });
}

export function resetHoldingForm() {
    state.editingHoldingId = '';
    const form = document.getElementById('holdingForm');
    if (form) form.reset();
    const date = document.getElementById('holdingAsOfDateInput');
    if (date) date.value = todayKey();
    updateCashMode();
}

export function showHoldingMessage(message, isError = false) {
    const el = document.getElementById('holdingMessage');
    if (!el) return;
    el.textContent = message || '';
    el.classList.toggle('error', Boolean(isError));
}

function renderHoldingOverview(metrics) {
    const wrap = document.getElementById('holdingsOverview');
    if (!wrap) return;
    const { summary } = metrics;
    wrap.innerHTML = [
        overviewCard('持仓市值', formatCurrency(summary.totalMarketValue), '筛选后合计'),
        overviewCard('持仓成本', formatCurrency(summary.totalCost), '按成本价估算'),
        overviewCard('浮动盈亏', formatCurrency(summary.totalPnl), formatPercent(summary.totalPnlPct), signedClass(summary.totalPnl)),
        overviewCard('持仓数量', String(summary.count), '当前筛选')
    ].join('');
}

function renderHoldingFilters() {
    const accountSelect = document.getElementById('holdingFilterAccount');
    const assetSelect = document.getElementById('holdingFilterAssetClass');
    const marketSelect = document.getElementById('holdingFilterMarket');
    if (accountSelect) {
        accountSelect.innerHTML = '<option value="all">全部账户</option>' + state.accounts.map(account => `<option value="${account.id}">${escapeHtml(account.name)}</option>`).join('');
        accountSelect.value = state.holdingFilters.accountId;
    }
    if (assetSelect) {
        assetSelect.innerHTML = '<option value="all">全部类别</option>' + ASSET_CLASSES.map(([key, label]) => `<option value="${key}">${label}</option>`).join('');
        assetSelect.value = state.holdingFilters.assetClass;
    }
    if (marketSelect) {
        marketSelect.innerHTML = '<option value="all">全部市场</option>' + MARKETS.map(([key, label]) => `<option value="${key}">${label}</option>`).join('');
        marketSelect.value = state.holdingFilters.market;
    }
}

function renderHoldingForm() {
    const accountSelect = document.getElementById('holdingAccountSelect');
    const assetSelect = document.getElementById('holdingAssetClassSelect');
    const marketSelect = document.getElementById('holdingMarketSelect');
    const submitBtn = document.getElementById('holdingSubmitBtn');
    const cancelBtn = document.getElementById('cancelHoldingEditBtn');
    if (!accountSelect || !assetSelect || !marketSelect || !submitBtn || !cancelBtn) return;

    accountSelect.innerHTML = state.accounts.length === 0
        ? '<option value="">请先新增账户</option>'
        : state.accounts.map(account => `<option value="${account.id}">${escapeHtml(account.name)}</option>`).join('');
    accountSelect.disabled = state.accounts.length === 0;
    submitBtn.disabled = state.accounts.length === 0;
    assetSelect.innerHTML = ASSET_CLASSES.map(([key, label]) => `<option value="${key}">${label}</option>`).join('');
    marketSelect.innerHTML = MARKETS.map(([key, label]) => `<option value="${key}">${label}</option>`).join('');

    const editing = state.holdings.find(holding => holding.id === state.editingHoldingId);
    submitBtn.textContent = editing ? '更新持仓' : '保存持仓';
    cancelBtn.classList.toggle('hidden', !editing);
    document.getElementById('holdingAsOfDateInput').value ||= todayKey();

    if (!editing) return;
    accountSelect.value = editing.accountId;
    document.getElementById('holdingNameInput').value = editing.name || '';
    document.getElementById('holdingSymbolInput').value = editing.symbol || '';
    assetSelect.value = editing.assetClass || 'stock';
    marketSelect.value = editing.market || 'CN';
    document.getElementById('holdingQuantityInput').value = editing.quantity;
    document.getElementById('holdingCostPriceInput').value = editing.costPrice;
    document.getElementById('holdingCurrentPriceInput').value = editing.currentPrice;
    document.getElementById('holdingAsOfDateInput').value = editing.asOfDate || todayKey();
    document.getElementById('holdingNoteInput').value = editing.note || '';
    updateCashMode();
}

function renderAllocation(elementId, allocation) {
    const wrap = document.getElementById(elementId);
    if (!wrap) return;
    if (allocation.length === 0) {
        wrap.innerHTML = '<div class="empty-state">暂无持仓。</div>';
        return;
    }
    wrap.innerHTML = allocation.map(item => `
        <div class="allocation-row">
            <div><strong>${escapeHtml(item.label)}</strong><span>${formatCurrency(item.value)}</span></div>
            <div class="allocation-bar"><i style="width:${Math.max(Number(item.weight) || 0, 1)}%"></i></div>
            <span>${formatPercent(item.weight, 1)}</span>
        </div>
    `).join('');
}

function renderHoldingTable(rows) {
    const wrap = document.getElementById('holdingTable');
    if (!wrap) return;
    if (state.accounts.length === 0) {
        wrap.innerHTML = '<div class="empty-state">请先在“账户数据”中新增账户。</div>';
        return;
    }
    if (rows.length === 0) {
        wrap.innerHTML = '<div class="empty-state">暂无持仓。录入持仓后可查看市值、占比和浮盈亏。</div>';
        return;
    }

    const columns = [
        ['name', '名称'],
        ['accountName', '账户'],
        ['assetClass', '类别'],
        ['marketValue', '市值'],
        ['weight', '占比'],
        ['costAmount', '成本'],
        ['unrealizedPnl', '浮盈亏'],
        ['unrealizedPnlPct', '浮盈率'],
        ['priceUpdatedAt', '价格时间']
    ];
    const sortedRows = [...rows].sort(compareHoldings);
    wrap.innerHTML = `
        <table class="holding-table">
            <thead><tr>${columns.map(([key, label]) => `<th class="${key === 'name' || key === 'accountName' || key === 'assetClass' ? '' : 'number-cell'}" data-holding-sort="${key}"><button type="button">${label}${sortIcon(key)}</button></th>`).join('')}<th>操作</th></tr></thead>
            <tbody>${sortedRows.map(renderHoldingRow).join('')}</tbody>
        </table>
    `;
}

function renderHoldingRow(row) {
    return `
        <tr>
            <td><strong>${escapeHtml(row.name)}</strong><small>${escapeHtml(row.symbol || '-')} · ${getMarketLabel(row.market)}</small></td>
            <td>${escapeHtml(row.accountName)}</td>
            <td>${getAssetClassLabel(row.assetClass)}</td>
            <td class="number-cell">${formatCurrency(row.marketValue)}</td>
            <td class="number-cell">${formatPercent(row.weight, 1)}</td>
            <td class="number-cell">${formatCurrency(row.costAmount)}</td>
            <td class="number-cell ${signedClass(row.unrealizedPnl)}">${formatCurrency(row.unrealizedPnl)}</td>
            <td class="number-cell ${signedClass(row.unrealizedPnlPct)}">${formatPercent(row.unrealizedPnlPct)}</td>
            <td class="number-cell">${row.priceUpdatedAt ? row.priceUpdatedAt.slice(0, 10) : row.asOfDate || '-'}</td>
            <td><div class="row-actions"><button class="mini-btn" type="button" data-holding-action="edit" data-holding-id="${row.id}">编辑</button><button class="mini-btn" type="button" data-holding-action="delete" data-holding-id="${row.id}">删除</button></div></td>
        </tr>
    `;
}

export function readHoldingForm() {
    const assetClass = document.getElementById('holdingAssetClassSelect').value;
    const currentPrice = Number(document.getElementById('holdingCurrentPriceInput').value);
    const isCash = assetClass === 'cash';

    return {
        accountId: document.getElementById('holdingAccountSelect').value,
        name: document.getElementById('holdingNameInput').value.trim() || (isCash ? '现金' : ''),
        symbol: isCash ? '' : document.getElementById('holdingSymbolInput').value.trim(),
        assetClass,
        market: isCash ? 'Cash' : document.getElementById('holdingMarketSelect').value,
        quantity: isCash ? 1 : Number(document.getElementById('holdingQuantityInput').value),
        costPrice: isCash ? currentPrice : Number(document.getElementById('holdingCostPriceInput').value),
        currentPrice,
        asOfDate: document.getElementById('holdingAsOfDateInput').value || todayKey(),
        note: document.getElementById('holdingNoteInput').value.trim()
    };
}

function updateCashMode() {
    const form = document.getElementById('holdingForm');
    const assetSelect = document.getElementById('holdingAssetClassSelect');
    const marketSelect = document.getElementById('holdingMarketSelect');
    const symbolInput = document.getElementById('holdingSymbolInput');
    const quantityInput = document.getElementById('holdingQuantityInput');
    const costInput = document.getElementById('holdingCostPriceInput');
    const currentInput = document.getElementById('holdingCurrentPriceInput');
    if (!form || !assetSelect || !marketSelect || !symbolInput || !quantityInput || !costInput || !currentInput) return;

    const isCash = assetSelect.value === 'cash';
    form.classList.toggle('cash-mode', isCash);
    if (!isCash) {
        marketSelect.disabled = false;
        symbolInput.disabled = false;
        quantityInput.readOnly = false;
        costInput.readOnly = false;
        return;
    }

    marketSelect.value = 'Cash';
    marketSelect.disabled = true;
    symbolInput.value = '';
    symbolInput.disabled = true;
    quantityInput.value = '1';
    quantityInput.readOnly = true;
    costInput.value = currentInput.value || costInput.value || '0';
    costInput.readOnly = true;
    syncCashAmountFields();
}

function syncCashAmountFields() {
    const assetSelect = document.getElementById('holdingAssetClassSelect');
    const quantityInput = document.getElementById('holdingQuantityInput');
    const costInput = document.getElementById('holdingCostPriceInput');
    const currentInput = document.getElementById('holdingCurrentPriceInput');
    if (!assetSelect || assetSelect.value !== 'cash' || !quantityInput || !costInput || !currentInput) return;
    quantityInput.value = '1';
    costInput.value = currentInput.value || '0';
}

function overviewCard(label, value, note, className = '') {
    return `<div class="overview-card"><span>${label}</span><strong class="${className}">${value}</strong><small>${escapeHtml(note)}</small></div>`;
}

function compareHoldings(a, b) {
    const direction = state.holdingSortOrder || -1;
    const key = state.holdingSortKey || 'marketValue';
    if (['name', 'accountName', 'assetClass', 'priceUpdatedAt'].includes(key)) {
        return String(a[key] || '').localeCompare(String(b[key] || ''), 'zh-CN', { numeric: true }) * direction;
    }
    const aValue = Number(a[key]);
    const bValue = Number(b[key]);
    if (!Number.isFinite(aValue) && !Number.isFinite(bValue)) return 0;
    if (!Number.isFinite(aValue)) return 1;
    if (!Number.isFinite(bValue)) return -1;
    return (aValue - bValue) * direction;
}

function sortIcon(key) {
    if (state.holdingSortKey !== key) return '';
    return state.holdingSortOrder === 1 ? ' ▲' : ' ▼';
}
