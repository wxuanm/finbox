import { state } from '../../config/state.js';
import { t } from '../../config/i18n.js';
import { currentLocale, escapeHtml, formatCurrency, formatPercent, formatPrice, formatWeight, signedClass, todayKey } from '../../utils/formatter.js';
import { ASSET_CLASSES, MARKETS, getAssetClassLabel, getMarketLabel } from './holdingsMetrics.js';

export function renderHoldingsPanel(metrics) {
    renderHoldingFilters();
    renderHoldingForm();
    renderHoldingContext(metrics);
    renderHoldingTable(metrics.rows);
}

export function bindHoldingsPanel({ onFilter, onAdd, onSubmit, onCancelEdit, onEdit, onDelete, onSort, onRefreshQuotes, onGenerateSnapshots }) {
    document.getElementById('holdingFilterAssetClass')?.addEventListener('change', event => onFilter('assetClass', event.target.value));
    document.getElementById('holdingFilterMarket')?.addEventListener('change', event => onFilter('market', event.target.value));
    document.getElementById('holdingAssetClassSelect')?.addEventListener('change', updateCashMode);
    document.getElementById('holdingCurrentPriceInput')?.addEventListener('input', syncCashAmountFields);
    document.getElementById('holdingForm')?.addEventListener('submit', event => {
        event.preventDefault();
        onSubmit(readHoldingForm());
    });
    document.getElementById('cancelHoldingEditBtn')?.addEventListener('click', onCancelEdit);
    document.getElementById('addHoldingBtn')?.addEventListener('click', () => onAdd());
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

function renderHoldingFilters() {
    const assetSelect = document.getElementById('holdingFilterAssetClass');
    const marketSelect = document.getElementById('holdingFilterMarket');
    if (assetSelect) {
        assetSelect.innerHTML = `<option value="all">${t('allAssetClasses')}</option>` + ASSET_CLASSES.map(([key, label]) => `<option value="${key}">${t(label)}</option>`).join('');
        assetSelect.value = state.holdingFilters.assetClass;
    }
    if (marketSelect) {
        marketSelect.innerHTML = `<option value="all">${t('allMarkets')}</option>` + MARKETS.map(([key, label]) => `<option value="${key}">${t(label)}</option>`).join('');
        marketSelect.value = state.holdingFilters.market;
    }
}

function renderHoldingContext(metrics) {
    const context = document.getElementById('holdingContext');
    const accountBadge = document.getElementById('holdingAccountBadge');
    if (!context) return;

    const rows = metrics.rows;
    const account = state.accounts.find(item => item.id === state.selectedAccountId) || state.accounts[0];
    const staleCount = rows.filter(row => isStalePrice(row)).length;
    const manualCount = rows.filter(row => row.priceSource !== 'quote').length;
    if (accountBadge) accountBadge.textContent = account?.name || t('notSelectedAccount');
    const parts = [t('filterHoldingCount', { count: rows.length })];
    if (staleCount > 0) parts.push(t('staleValuationCount', { count: staleCount }));
    else if (manualCount > 0) parts.push(t('manualValuationCount', { count: manualCount }));
    else if (rows.length > 0) parts.push(t('quoteHealthy'));
    context.textContent = `${parts.join(' · ')}。`;
    context.classList.toggle('holding-context-warning', staleCount > 0);
}

function renderHoldingForm() {
    const accountSelect = document.getElementById('holdingAccountSelect');
    const assetSelect = document.getElementById('holdingAssetClassSelect');
    const marketSelect = document.getElementById('holdingMarketSelect');
    const submitBtn = document.getElementById('holdingSubmitBtn');
    const cancelBtn = document.getElementById('cancelHoldingEditBtn');
    if (!accountSelect || !assetSelect || !marketSelect || !submitBtn || !cancelBtn) return;

    const account = state.accounts.find(item => item.id === state.selectedAccountId) || state.accounts[0];
    accountSelect.innerHTML = account
        ? `<option value="${account.id}">${escapeHtml(account.name)}</option>`
        : `<option value="">${t('pleaseAddAccountFirst')}</option>`;
    accountSelect.value = account?.id || '';
    accountSelect.disabled = true;
    submitBtn.disabled = !account;
    assetSelect.innerHTML = ASSET_CLASSES.map(([key, label]) => `<option value="${key}">${t(label)}</option>`).join('');

    const editing = state.holdings.find(holding => holding.id === state.editingHoldingId);
    const dialogTitle = document.getElementById('holdingDialogTitle');
    if (dialogTitle) dialogTitle.textContent = editing ? t('editHolding') : t('addHolding');
    submitBtn.textContent = editing ? t('updateHolding') : t('addHolding');
    cancelBtn.classList.toggle('hidden', !editing);
    cancelBtn.textContent = t('cancelEdit');
    document.getElementById('holdingAsOfDateInput').value ||= todayKey();

    if (!editing) {
        updateCashMode();
        return;
    }
    assetSelect.value = editing.assetClass || 'stock';
    updateCashMode(editing.market);
    document.getElementById('holdingNameInput').value = editing.name || '';
    document.getElementById('holdingSymbolInput').value = editing.symbol || '';
    document.getElementById('holdingQuantityInput').value = editing.quantity;
    document.getElementById('holdingCostPriceInput').value = editing.costPrice;
    document.getElementById('holdingCurrentPriceInput').value = editing.currentPrice;
    document.getElementById('holdingAsOfDateInput').value = editing.asOfDate || todayKey();
    document.getElementById('holdingNoteInput').value = editing.note || '';
}

function renderHoldingTable(rows) {
    const wrap = document.getElementById('holdingTable');
    if (!wrap) return;
    if (state.accounts.length === 0) {
        wrap.innerHTML = `<div class="empty-state">${t('addAccountFirstInManagement')}</div>`;
        return;
    }
    if (rows.length === 0) {
        wrap.innerHTML = `<div class="empty-state">${t('noHoldingsCurrentAccount')}</div>`;
        return;
    }

    const columns = [
        ['name', t('name')],
        ['marketValue', t('marketValue')],
        ['currentPrice', t('latestPrice')],
        ['unrealizedPnl', t('cumulativePnl')],
        ['weight', t('weight')],
        ['priceUpdatedAt', t('priceTime')]
    ];
    const sortedRows = [...rows].sort(compareHoldings);
    wrap.innerHTML = `
        <table class="holding-table">
            <thead><tr>${columns.map(([key, label]) => `<th class="${key === 'name' || key === 'assetClass' ? '' : 'number-cell'}" data-holding-sort="${key}"><button type="button">${label}${sortIcon(key)}</button></th>`).join('')}<th>${t('actions')}</th></tr></thead>
            <tbody>${sortedRows.map(renderHoldingRow).join('')}</tbody>
        </table>
    `;
}

function renderHoldingRow(row) {
    const priceStatus = getPriceStatusParts(row);
    return `
        <tr>
            <td><strong>${escapeHtml(row.name)}</strong><small>${formatHoldingMeta(row)}</small>${renderHoldingMobileCard(row, priceStatus)}</td>
            <td class="number-cell">${formatCurrency(row.marketValue, state.amountsHidden)}</td>
            <td class="number-cell"><span class="price-pair"><span>${formatPrice(row.costPrice, row.assetClass)}</span><small>${formatPrice(row.currentPrice, row.assetClass)}</small></span></td>
            <td class="number-cell ${signedClass(row.unrealizedPnl)}"><span class="price-pair pnl-pair"><span>${formatCurrency(row.unrealizedPnl, state.amountsHidden)}</span><small>${formatPercent(row.unrealizedPnlPct)}</small></span></td>
            <td class="number-cell">${formatWeight(row.weight)}</td>
            <td class="number-cell"><span class="valuation-status status-pair${isStalePrice(row) ? ' stale' : ''}"><span>${priceStatus.label}</span><small>${priceStatus.date}</small></span></td>
            <td><div class="row-actions"><button class="mini-btn icon-btn" type="button" data-holding-action="edit" data-holding-id="${row.id}" aria-label="${escapeHtml(t('edit'))}" title="${escapeHtml(t('edit'))}">${editIcon()}</button><button class="mini-btn icon-btn" type="button" data-holding-action="delete" data-holding-id="${row.id}" aria-label="${escapeHtml(t('delete'))}" title="${escapeHtml(t('delete'))}">${deleteIcon()}</button></div></td>
        </tr>
    `;
}

function renderHoldingMobileCard(row, priceStatus) {
    return `
        <div class="holding-mobile-card">
            <div class="holding-mobile-card-head">
                <div>
                    <strong>${escapeHtml(row.name)}</strong>
                    <small>${formatHoldingMeta(row)}</small>
                </div>
            </div>
            <div class="holding-mobile-details">
                <div>
                    <span>${t('marketValue')}</span>
                    <strong>${formatCurrency(row.marketValue, state.amountsHidden)}</strong>
                </div>
                <div>
                    <span>${t('cumulativePnl')}</span>
                    <strong class="${signedClass(row.unrealizedPnl)}">${formatCurrency(row.unrealizedPnl, state.amountsHidden)} / ${formatPercent(row.unrealizedPnlPct)}</strong>
                </div>
                <div>
                    <span>${t('weight')}</span>
                    <strong>${formatWeight(row.weight)}</strong>
                </div>
                <div>
                    <span>${t('latestPrice')}</span>
                    <strong>${formatPrice(row.costPrice, row.assetClass)} / ${formatPrice(row.currentPrice, row.assetClass)}</strong>
                </div>
                <div>
                    <span>${t('priceTime')}</span>
                    <strong class="valuation-status${isStalePrice(row) ? ' stale' : ''}">${priceStatus.label} · ${priceStatus.date}</strong>
                </div>
            </div>
            <div class="holding-mobile-actions">
                <button class="mini-btn icon-btn" type="button" data-holding-action="edit" data-holding-id="${row.id}" aria-label="${escapeHtml(t('edit'))}" title="${escapeHtml(t('edit'))}">${editIcon()}</button>
                <button class="mini-btn icon-btn" type="button" data-holding-action="delete" data-holding-id="${row.id}" aria-label="${escapeHtml(t('delete'))}" title="${escapeHtml(t('delete'))}">${deleteIcon()}</button>
            </div>
        </div>
    `;
}

function formatHoldingMeta(row) {
    const labels = [getAssetClassLabel(row.assetClass), row.symbol || '-', getMarketLabel(row.market)];
    return labels.filter((label, index) => label && labels.indexOf(label) === index).map(escapeHtml).join(' · ');
}

export function readHoldingForm() {
    const assetClass = document.getElementById('holdingAssetClassSelect').value;
    const currentPrice = Number(document.getElementById('holdingCurrentPriceInput').value);
    const isCash = assetClass === 'cash';

    return {
        accountId: state.selectedAccountId,
        name: document.getElementById('holdingNameInput').value.trim() || (isCash ? t('assetCash') : ''),
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

function updateCashMode(preferredMarket = '') {
    const form = document.getElementById('holdingForm');
    const assetSelect = document.getElementById('holdingAssetClassSelect');
    const marketSelect = document.getElementById('holdingMarketSelect');
    const symbolInput = document.getElementById('holdingSymbolInput');
    const quantityInput = document.getElementById('holdingQuantityInput');
    const costInput = document.getElementById('holdingCostPriceInput');
    const currentInput = document.getElementById('holdingCurrentPriceInput');
    const nameInput = document.getElementById('holdingNameInput');
    const currentPriceLabel = document.getElementById('holdingCurrentPriceLabel');
    if (!form || !assetSelect || !marketSelect || !symbolInput || !quantityInput || !costInput || !currentInput || !nameInput || !currentPriceLabel) return;

    const isCash = assetSelect.value === 'cash';
    const supportedMarkets = getMarketsForAssetClass(assetSelect.value);
    marketSelect.innerHTML = supportedMarkets.map(([key, label]) => `<option value="${key}">${t(label)}</option>`).join('');
    marketSelect.value = supportedMarkets.some(([key]) => key === preferredMarket)
        ? preferredMarket
        : supportedMarkets[0][0];
    form.classList.toggle('cash-mode', isCash);
    if (!isCash) {
        currentPriceLabel.textContent = t('currentPrice');
        nameInput.placeholder = t('holdingNameShortPlaceholder');
        currentInput.placeholder = '';
        marketSelect.disabled = false;
        symbolInput.disabled = false;
        quantityInput.readOnly = false;
        costInput.readOnly = false;
        return;
    }

    marketSelect.value = 'Cash';
    currentPriceLabel.textContent = t('cashBalance');
    nameInput.placeholder = t('assetCash');
    currentInput.placeholder = t('cashPlaceholder');
    if (!nameInput.value) nameInput.value = t('assetCash');
    marketSelect.disabled = true;
    symbolInput.value = '';
    symbolInput.disabled = true;
    quantityInput.value = '1';
    quantityInput.readOnly = true;
    costInput.value = currentInput.value || costInput.value || '0';
    costInput.readOnly = true;
    syncCashAmountFields();
}

function getMarketsForAssetClass(assetClass) {
    const marketKeys = {
        stock: ['CN', 'Other'],
        fund: ['Fund', 'Other'],
        bond: ['Other'],
        cash: ['Cash'],
        other: ['Other']
    }[assetClass] || ['Other'];
    return MARKETS.filter(([key]) => marketKeys.includes(key));
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

function getPriceStatusParts(row) {
    const date = String(row.priceUpdatedAt || row.asOfDate || '').slice(0, 10);
    if (!date) return { label: t('notRecorded'), date: '-' };
    if (row.priceSource !== 'quote') return { label: t('manual'), date };
    return { label: isStalePrice(row) ? t('stale') : t('quote'), date };
}

function isStalePrice(row) {
    const date = String(row.priceUpdatedAt || row.asOfDate || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return true;
    const updatedAt = new Date(`${date}T00:00:00`).getTime();
    const today = new Date(`${todayKey()}T00:00:00`).getTime();
    return !Number.isFinite(updatedAt) || (today - updatedAt) / 86400000 > 3;
}

function compareHoldings(a, b) {
    const direction = state.holdingSortOrder || -1;
    const key = state.holdingSortKey || 'marketValue';
    if (['name', 'accountName', 'assetClass', 'priceUpdatedAt'].includes(key)) {
        return String(a[key] || '').localeCompare(String(b[key] || ''), currentLocale(), { numeric: true }) * direction;
    }
    const aValue = Number(a[key]);
    const bValue = Number(b[key]);
    if (!Number.isFinite(aValue) && !Number.isFinite(bValue)) return 0;
    if (!Number.isFinite(aValue)) return 1;
    if (!Number.isFinite(bValue)) return -1;
    return (aValue - bValue) * direction;
}

function editIcon() {
    return '<svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4.8L19.1 9.7a2.3 2.3 0 0 0 0-3.2l-1.6-1.6a2.3 2.3 0 0 0-3.2 0L4 15.2V20Z" stroke-linejoin="round"/><path d="m13.5 5.7 4.8 4.8" stroke-linecap="round"/></svg>';
}

function deleteIcon() {
    return '<svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14" stroke-linecap="round"/><path d="M10 11v6M14 11v6" stroke-linecap="round"/><path d="M8 7l.6 12.1A2 2 0 0 0 10.6 21h2.8a2 2 0 0 0 2-1.9L16 7" stroke-linejoin="round"/><path d="M9.5 7V5.6A1.6 1.6 0 0 1 11.1 4h1.8a1.6 1.6 0 0 1 1.6 1.6V7" stroke-linejoin="round"/></svg>';
}

function sortIcon(key) {
    if (state.holdingSortKey !== key) return '';
    return state.holdingSortOrder === 1 ? ' ▲' : ' ▼';
}
