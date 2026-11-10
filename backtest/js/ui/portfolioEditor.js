import { state } from '../config/state.js';
import { t } from '../config/i18n.js';
import { REBALANCE_MODES } from '../engine/backtestEngine.js';
import { itemKey } from '../api/historyApi.js';
import { escapeHtml } from '../utils/formatter.js';

const MAX_ASSETS = 20;
const REBALANCE_LABEL_KEYS = {
    none: 'rebalanceNone',
    monthly: 'rebalanceMonthly',
    quarterly: 'rebalanceQuarterly',
    yearly: 'rebalanceYearly'
};

export function portfolioDisplayName(portfolio, lang) {
    return portfolio.name.trim() || t(lang, 'defaultPortfolioName', { n: portfolio.index });
}

export function weightTotal(portfolio) {
    return Math.round(portfolio.assets.reduce((sum, asset) => sum + (Number(asset.weight) || 0), 0) * 100) / 100;
}

/** Returns a list of translated error messages; empty when the portfolio can run. */
export function validatePortfolio(portfolio, lang) {
    const errors = [];
    if (portfolio.assets.length === 0) {
        errors.push(t(lang, 'errNoAssets'));
        return errors;
    }
    const seen = new Set();
    portfolio.assets.forEach(asset => {
        if (!/^\d{6}$/.test(asset.code)) {
            errors.push(t(lang, 'errBadCode', { code: asset.code || '—' }));
            return;
        }
        const key = itemKey(asset.market, asset.code);
        if (seen.has(key)) errors.push(t(lang, 'errDuplicate', { code: asset.code }));
        seen.add(key);
    });
    const total = weightTotal(portfolio);
    if (Math.abs(total - 100) > 0.01 || portfolio.assets.some(asset => !(Number(asset.weight) > 0))) {
        errors.push(t(lang, 'errWeightTotal', { total }));
    }
    return errors;
}

export const SERIES_COLOR_VARS = ['--chart-series-1', '--chart-series-2', '--chart-series-3'];

export function seriesColorVar(portfolio) {
    return SERIES_COLOR_VARS[(portfolio.index - 1) % SERIES_COLOR_VARS.length];
}

/** @param {{ canAdd: boolean, canRemove: boolean }} options */
export function renderPortfolioEditor(container, portfolio, { canAdd = false, canRemove = false } = {}) {
    const lang = state.lang;
    const total = weightTotal(portfolio);
    const totalOk = Math.abs(total - 100) <= 0.01;

    container.innerHTML = `
        <div class="portfolio-card" data-portfolio-id="${escapeHtml(portfolio.id)}" style="--card-accent: var(${seriesColorVar(portfolio)})">
            <div class="portfolio-card-title">
                <span class="series-dot" aria-hidden="true"></span>
                <strong>${escapeHtml(portfolioDisplayName(portfolio, lang))}</strong>
                <span class="card-tools">
                    <button type="button" class="text-btn" data-action="duplicate-portfolio" ${canAdd ? '' : 'disabled'}>${escapeHtml(t(lang, 'duplicatePortfolio'))}</button>
                    <button type="button" class="text-btn danger" data-action="remove-portfolio" ${canRemove ? '' : 'disabled'}>${escapeHtml(t(lang, 'removePortfolio'))}</button>
                </span>
            </div>
            <div class="portfolio-card-head">
                <label class="field grow">
                    <span>${escapeHtml(t(lang, 'portfolioName'))}</span>
                    <input type="text" maxlength="40" data-field="name"
                        value="${escapeHtml(portfolio.name)}"
                        placeholder="${escapeHtml(t(lang, 'defaultPortfolioName', { n: portfolio.index }))}">
                </label>
                <label class="field">
                    <span>${escapeHtml(t(lang, 'rebalance'))}</span>
                    <select data-field="rebalance">
                        ${REBALANCE_MODES.map(mode => `<option value="${mode}" ${mode === portfolio.rebalance ? 'selected' : ''}>${escapeHtml(t(lang, REBALANCE_LABEL_KEYS[mode]))}</option>`).join('')}
                    </select>
                </label>
            </div>
            <div class="asset-table" role="table">
                <div class="asset-row asset-row-head" role="row">
                    <span role="columnheader">${escapeHtml(t(lang, 'market'))}</span>
                    <span role="columnheader">${escapeHtml(t(lang, 'code'))}</span>
                    <span role="columnheader">${escapeHtml(t(lang, 'weight'))}</span>
                    <span role="columnheader" class="sr-only">${escapeHtml(t(lang, 'removeAsset'))}</span>
                </div>
                ${portfolio.assets.map((asset, index) => renderAssetRow(asset, index, lang)).join('')}
            </div>
            <div class="portfolio-card-foot">
                <div class="foot-actions">
                    <button type="button" class="ghost-btn" data-action="add-asset" ${portfolio.assets.length >= MAX_ASSETS ? 'disabled' : ''}>+ ${escapeHtml(t(lang, 'addAsset'))}</button>
                    <button type="button" class="ghost-btn" data-action="equal-weight" ${portfolio.assets.length === 0 ? 'disabled' : ''}>${escapeHtml(t(lang, 'equalWeight'))}</button>
                </div>
                <span class="weight-total ${totalOk ? 'ok' : 'bad'}" data-role="weight-total">${escapeHtml(t(lang, 'weightTotal', { total }))}</span>
            </div>
        </div>`;
}

function renderAssetRow(asset, index, lang) {
    const name = state.names[itemKey(asset.market, asset.code)] || '';
    return `
        <div class="asset-row" role="row" data-asset-index="${index}">
            <select data-field="market" aria-label="${escapeHtml(t(lang, 'market'))}">
                <option value="CN" ${asset.market === 'CN' ? 'selected' : ''}>${escapeHtml(t(lang, 'marketCN'))}</option>
                <option value="Fund" ${asset.market === 'Fund' ? 'selected' : ''}>${escapeHtml(t(lang, 'marketFund'))}</option>
            </select>
            <div class="code-cell">
                <input type="text" inputmode="numeric" maxlength="6" data-field="code"
                    value="${escapeHtml(asset.code)}" aria-label="${escapeHtml(t(lang, 'code'))}" placeholder="000000">
                <span class="asset-name" title="${escapeHtml(name)}">${escapeHtml(name)}</span>
            </div>
            <input type="number" min="0" max="100" step="0.1" data-field="weight"
                value="${Number.isFinite(asset.weight) ? asset.weight : ''}" aria-label="${escapeHtml(t(lang, 'weight'))}">
            <button type="button" class="icon-btn" data-action="remove-asset" aria-label="${escapeHtml(t(lang, 'removeAsset'))}" title="${escapeHtml(t(lang, 'removeAsset'))}">×</button>
        </div>`;
}

/**
 * Wires delegated events once. `getPortfolio(id)` resolves the edited portfolio,
 * `onChange(portfolio, { structural })` persists and re-renders when rows change.
 */
export function bindPortfolioEditor(root, { getPortfolio, onChange, onPortfolioAction }) {
    root.addEventListener('input', event => {
        const target = event.target;
        const { portfolio, assetIndex } = locate(target, getPortfolio);
        if (!portfolio) return;
        const field = target.dataset.field;

        if (field === 'name') {
            portfolio.name = target.value.slice(0, 40);
            const title = target.closest('.portfolio-card')?.querySelector('.portfolio-card-title strong');
            if (title) title.textContent = portfolioDisplayName(portfolio, state.lang);
        } else if (field === 'code' && assetIndex !== null) {
            const code = target.value.replace(/\D/g, '').slice(0, 6);
            if (code !== target.value) target.value = code;
            portfolio.assets[assetIndex].code = code;
            const nameEl = target.parentElement.querySelector('.asset-name');
            if (nameEl) nameEl.textContent = state.names[itemKey(portfolio.assets[assetIndex].market, code)] || '';
        } else if (field === 'weight' && assetIndex !== null) {
            portfolio.assets[assetIndex].weight = target.value === '' ? 0 : Number(target.value);
            updateWeightTotal(target.closest('.portfolio-card'), portfolio);
        } else {
            return;
        }
        onChange(portfolio, { structural: false });
    });

    root.addEventListener('change', event => {
        const target = event.target;
        const { portfolio, assetIndex } = locate(target, getPortfolio);
        if (!portfolio) return;
        if (target.dataset.field === 'rebalance' && REBALANCE_MODES.includes(target.value)) {
            portfolio.rebalance = target.value;
            onChange(portfolio, { structural: false });
        } else if (target.dataset.field === 'market' && assetIndex !== null) {
            portfolio.assets[assetIndex].market = target.value === 'Fund' ? 'Fund' : 'CN';
            onChange(portfolio, { structural: true });
        }
    });

    root.addEventListener('click', event => {
        const button = event.target.closest('[data-action]');
        if (!button || !root.contains(button) || button.disabled) return;
        const action = button.dataset.action;
        if (action === 'add-portfolio') {
            onPortfolioAction('add', null);
            return;
        }
        const { portfolio, assetIndex } = locate(button, getPortfolio);
        if (!portfolio) return;
        if (action === 'duplicate-portfolio' || action === 'remove-portfolio') {
            onPortfolioAction(action === 'duplicate-portfolio' ? 'duplicate' : 'remove', portfolio);
            return;
        }

        if (action === 'add-asset' && portfolio.assets.length < MAX_ASSETS) {
            portfolio.assets.push({ market: 'Fund', code: '', weight: 0 });
        } else if (action === 'remove-asset' && assetIndex !== null) {
            portfolio.assets.splice(assetIndex, 1);
        } else if (action === 'equal-weight' && portfolio.assets.length > 0) {
            applyEqualWeight(portfolio);
        } else {
            return;
        }
        onChange(portfolio, { structural: true });
    });
}

// Splits 100% into equal shares at 0.01 precision; the remainder goes to the first rows.
export function applyEqualWeight(portfolio) {
    const count = portfolio.assets.length;
    const base = Math.floor(10000 / count);
    let remainder = 10000 - base * count;
    portfolio.assets.forEach(asset => {
        const extra = remainder > 0 ? 1 : 0;
        remainder -= extra;
        asset.weight = (base + extra) / 100;
    });
}

function updateWeightTotal(card, portfolio) {
    const el = card?.querySelector('[data-role="weight-total"]');
    if (!el) return;
    const total = weightTotal(portfolio);
    el.textContent = t(state.lang, 'weightTotal', { total });
    el.classList.toggle('ok', Math.abs(total - 100) <= 0.01);
    el.classList.toggle('bad', Math.abs(total - 100) > 0.01);
}

function locate(element, getPortfolio) {
    const card = element.closest('[data-portfolio-id]');
    const portfolio = card ? getPortfolio(card.dataset.portfolioId) : null;
    const row = element.closest('[data-asset-index]');
    const assetIndex = row ? Number(row.dataset.assetIndex) : null;
    return { portfolio, assetIndex };
}
