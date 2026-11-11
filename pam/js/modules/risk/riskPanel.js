import { state } from '../../config/state.js';
import { t } from '../../config/i18n.js';
import { escapeHtml, formatCurrency, formatPrice, formatWeight } from '../../utils/formatter.js';
import { buildTrialPosition } from './riskExposure.js';

// Calculator inputs are scratch values: kept across re-renders, never persisted.
const trial = { entry: '', stop: '', risk: '', lot: '100' };
const expandedPositions = new Set();

const STATUS_LABELS = { ok: 'riskStatusOk', near: 'riskStatusNear', over: 'riskStatusOver', unknown: 'riskStatusUnknown' };

// HTML only, no ECharts: the page must stay usable when the chart CDN fails.
export function renderRiskPanel(metrics) {
    const el = document.getElementById('riskContent');
    const scopeEl = document.getElementById('riskScopeSwitch');
    const settingsBtn = document.getElementById('riskSettingsBtn');
    if (!el) return;
    if (settingsBtn) settingsBtn.hidden = state.accounts.length === 0;
    renderScopeSwitch(scopeEl);

    if (state.accounts.length === 0) {
        el.innerHTML = renderEmpty(t('riskNoAccounts'));
        return;
    }
    if (!metrics || metrics.equity <= 0) {
        el.innerHTML = renderEmpty(t('riskNoHoldings'));
        return;
    }

    el.innerHTML = `
        ${renderLines(metrics)}
        ${renderNotices(metrics)}
        <div class="risk-main">
            <section class="alloc-section" aria-labelledby="riskPositionsTitle">
                <h3 id="riskPositionsTitle" class="alloc-section-title">${t('riskPositionsTitle')}</h3>
                ${renderPositions(metrics)}
                <p class="alloc-footnote">${t('riskPositionsNote', { pct: formatSetting(metrics.settings.defaultStopPct) })}</p>
            </section>
            ${renderTrial(metrics)}
        </div>
        <p class="alloc-footnote">${t('riskDisclaimer')}</p>
    `;
}

function renderScopeSwitch(el) {
    if (!el) return;
    el.hidden = state.accounts.length < 2;
    if (el.hidden) {
        el.innerHTML = '';
        return;
    }
    const options = [['all', t('riskScopeAll')], ...state.accounts.map(account => [account.id, account.name])];
    el.innerHTML = `
        <label class="risk-scope-label">
            <span>${t('riskScopeLabel')}</span>
            <select id="riskScopeSelect">${options.map(([value, label]) => `<option value="${escapeHtml(value)}"${value === state.riskScope ? ' selected' : ''}>${escapeHtml(label)}</option>`).join('')}</select>
        </label>
    `;
}

function renderLines(metrics) {
    const { settings } = metrics;
    const principalHint = metrics.principal
        ? t('riskPrincipalHint', { loss: formatCurrency(metrics.principalLoss, state.amountsHidden), principal: formatCurrency(metrics.principal, state.amountsHidden) })
        : t('riskNeedSnapshots');
    const drawdownHint = metrics.nav
        ? t('riskDrawdownHint', { current: formatWeight(metrics.currentDrawdownPct) })
        : t('riskNeedSnapshots');
    const lines = [
        {
            label: t('riskPrincipalLine'),
            value: metrics.principalPct,
            limit: settings.principalLimit,
            status: metrics.principalStatus,
            hint: principalHint
        },
        {
            label: t('riskDrawdownLine'),
            value: metrics.projectedDrawdownPct,
            limit: settings.drawdownLimit,
            status: metrics.drawdownStatus,
            hint: drawdownHint
        }
    ];
    return `
        <div class="risk-lines">
            ${lines.map(renderLine).join('')}
            <dl class="risk-figures">
                <div>
                    <dt>${t('riskExposureTotal')}</dt>
                    <dd><strong>${formatWeight(metrics.exposurePct)}</strong><small>${formatCurrency(metrics.exposure, state.amountsHidden)}</small></dd>
                </div>
                <div>
                    <dt>${t('riskExitEquity')}</dt>
                    <dd><strong>${formatCurrency(metrics.exitEquity, state.amountsHidden)}</strong><small>${t('riskEquityNow', { value: formatCurrency(metrics.equity, state.amountsHidden) })}</small></dd>
                </div>
                <div>
                    <dt>${t('riskDefaultShare')}</dt>
                    <dd><strong class="${metrics.defaultCount > 0 ? 'warning' : ''}">${formatWeight(metrics.defaultShare || 0)}</strong><small>${t('riskDefaultCount', { count: metrics.defaultCount })}</small></dd>
                </div>
            </dl>
        </div>
    `;
}

// Status is always stated in text; the warning tone marks near/over, never profit/loss red/green.
function renderLine({ label, value, limit, status, hint }) {
    const fill = Number.isFinite(value) ? Math.min(100, value / limit * 100 / 1.25) : 0;
    const limitAt = 100 / 1.25;
    return `
        <section class="risk-line ${status}">
            <div class="risk-line-head">
                <h3>${label}</h3>
                <span class="alloc-status ${status === 'near' || status === 'over' ? 'over' : ''}">${t(STATUS_LABELS[status])}</span>
            </div>
            <p class="risk-line-value"><strong>${Number.isFinite(value) ? formatWeight(value) : '-'}</strong><span>${t('riskLimitShort', { limit: formatSetting(limit) })}</span></p>
            <span class="risk-meter" aria-hidden="true"><span class="risk-meter-fill" style="width:${fill}%"></span><span class="risk-meter-limit" style="left:${limitAt}%"></span></span>
            <p class="risk-line-hint">${hint}</p>
        </section>
    `;
}

function renderNotices(metrics) {
    const notices = [];
    if (metrics.triggeredCount > 0) notices.push(t('riskTriggeredNotice', { count: metrics.triggeredCount }));
    if (metrics.staleCount > 0) notices.push(`⚠ ${t('riskStaleNotice', { count: metrics.staleCount, share: formatWeight(metrics.staleShare) })}`);
    const gap = metrics.nav?.snapshotGapPct;
    if (Number.isFinite(gap) && Math.abs(gap) >= 10) {
        notices.push(t('riskSnapshotGapNotice', { date: metrics.nav.latestDate, gap: formatWeight(Math.abs(gap)) }));
    }
    if (notices.length === 0) return '';
    return `<div class="alloc-notice risk-notice" role="status">${notices.map(text => `<p>${text}</p>`).join('')}</div>`;
}

function renderPositions(metrics) {
    if (metrics.positions.length === 0) {
        return `<div class="alloc-table-wrap"><p class="risk-empty-line">${t('riskOnlyCash')}</p></div>`;
    }
    const showAccount = state.riskScope === 'all' && state.accounts.length > 1;
    const rows = metrics.positions.map(position => renderPositionRow(position, metrics, showAccount)).join('');
    return `
        <div class="alloc-table-wrap">
            <table class="alloc-table risk-table">
                <thead><tr>
                    <th scope="col">${t('name')}</th>
                    <th scope="col" class="number-cell">${t('riskStopCol')}</th>
                    <th scope="col" class="number-cell">${t('riskExposureCol')}</th>
                    <th scope="col" class="number-cell">${t('riskPrincipalCol')}</th>
                    <th scope="col" class="number-cell risk-exit-col">${t('riskExitPnlCol')}</th>
                    <th scope="col" aria-label="${escapeHtml(t('actions'))}"></th>
                </tr></thead>
                <tbody>${rows}</tbody>
            </table>
            <ul class="risk-list">${metrics.positions.map(position => renderPositionItem(position, metrics, showAccount)).join('')}</ul>
        </div>
    `;
}

function stopLabel(position) {
    if (position.stopSource === 'default') return `<span class="risk-tag">${t('riskStopDefault')}</span>`;
    if (position.triggered) return `<span class="risk-tag warning">${t('riskStopTriggered')}</span>`;
    if (position.breakEvenProtected) return `<span class="risk-tag">${t('riskStopProtected')}</span>`;
    return '';
}

function exposureShare(position, metrics) {
    return metrics.equity > 0 ? position.exposure / metrics.equity * 100 : null;
}

function formatSignedAmount(value) {
    if (state.amountsHidden) return formatCurrency(value, true);
    return `${value > 0.005 ? '+' : ''}${formatCurrency(value)}`;
}

function positionName(position, showAccount) {
    const meta = [position.symbol, showAccount ? position.accountName : ''].filter(Boolean).map(escapeHtml).join(' · ');
    return `
        <span>${position.stale ? `<span class="alloc-stale" title="${escapeHtml(t('stale'))}">⚠</span> ` : ''}${escapeHtml(position.name)}</span>
        ${meta ? `<small class="alloc-muted">${meta}</small>` : ''}
    `;
}

function renderPositionRow(position, metrics, showAccount) {
    return `
        <tr>
            <td class="risk-name-cell">${positionName(position, showAccount)}</td>
            <td class="number-cell">
                <span class="risk-stack">
                    <span>${formatPrice(position.stopPrice, position.assetClass)}</span>
                    <small>${t('riskStopDistance', { pct: formatWeight(position.stopDistancePct) })} ${stopLabel(position)}</small>
                </span>
            </td>
            <td class="number-cell">
                <span class="risk-stack">
                    <span>${formatWeight(exposureShare(position, metrics))}</span>
                    <small>${formatCurrency(position.exposure, state.amountsHidden)}</small>
                </span>
            </td>
            <td class="number-cell">${position.principalLoss > 0.005 ? formatCurrency(position.principalLoss, state.amountsHidden) : '<span class="alloc-muted">0</span>'}</td>
            <td class="number-cell risk-exit-col">${formatSignedAmount(position.exitPnl)}</td>
            <td><button class="mini-btn" type="button" data-risk-stop="${escapeHtml(position.id)}">${t('riskSetStop')}</button></td>
        </tr>
    `;
}

// Phones: name and exposure on one line, stop and principal below; details behind a tap.
function renderPositionItem(position, metrics, showAccount) {
    const isOpen = expandedPositions.has(position.id);
    const detailsId = `riskDetails-${position.id}`;
    const detail = (label, value) => `<div><dt>${label}</dt><dd>${value}</dd></div>`;
    return `
        <li class="risk-item${isOpen ? ' expanded' : ''}">
            <button class="risk-item-toggle" type="button" data-risk-toggle="${escapeHtml(position.id)}" aria-expanded="${isOpen}" aria-controls="${detailsId}">
                <span class="risk-item-name">${positionName(position, showAccount)}</span>
                <span class="risk-item-figures">
                    <strong>${formatWeight(exposureShare(position, metrics))}</strong>
                    <small>${formatCurrency(position.exposure, state.amountsHidden)}</small>
                </span>
                <span class="risk-item-meta">${t('riskStopShort', { price: formatPrice(position.stopPrice, position.assetClass) })} ${stopLabel(position)}</span>
            </button>
            <div id="${detailsId}" class="risk-item-details"${isOpen ? '' : ' hidden'}>
                <dl>
                    ${detail(t('currentPrice'), formatPrice(position.currentPrice, position.assetClass))}
                    ${detail(t('costPrice'), formatPrice(position.costPrice, position.assetClass))}
                    ${detail(t('riskPrincipalCol'), formatCurrency(position.principalLoss, state.amountsHidden))}
                    ${detail(t('riskExitPnlCol'), formatSignedAmount(position.exitPnl))}
                </dl>
                <button class="ghost-btn" type="button" data-risk-stop="${escapeHtml(position.id)}">${t('riskSetStop')}</button>
            </div>
        </li>
    `;
}

function renderTrial(metrics) {
    const suggested = metrics.equity * metrics.settings.riskPerTradePct / 100;
    const riskValue = trial.risk === '' ? '' : trial.risk;
    const result = buildTrialPosition({
        entry: trial.entry,
        stop: trial.stop,
        riskAmount: riskValue === '' ? suggested : riskValue,
        lotSize: trial.lot,
        metrics
    });
    return `
        <section class="alloc-section risk-trial" aria-labelledby="riskTrialTitle">
            <h3 id="riskTrialTitle" class="alloc-section-title">${t('riskTrialTitle')}</h3>
            <div class="risk-trial-card">
                <div class="risk-trial-inputs">
                    ${trialInput('entry', t('riskTrialEntry'), '0.001')}
                    ${trialInput('stop', t('riskTrialStop'), '0.001')}
                    ${trialInput('risk', t('riskTrialRisk'), '0.01', state.amountsHidden ? t('riskTrialRiskHiddenPlaceholder', { pct: formatSetting(metrics.settings.riskPerTradePct) }) : t('riskTrialRiskPlaceholder', { value: formatCurrency(suggested), pct: formatSetting(metrics.settings.riskPerTradePct) }))}
                    ${trialInput('lot', t('riskTrialLot'), '1')}
                </div>
                ${renderTrialResult(result, metrics)}
            </div>
        </section>
    `;
}

function trialInput(key, label, step, placeholder = '') {
    return `
        <label>
            <span>${label}</span>
            <input type="number" inputmode="decimal" min="0" step="${step}" data-risk-trial="${key}" value="${escapeHtml(trial[key])}" placeholder="${escapeHtml(placeholder)}">
        </label>
    `;
}

function renderTrialResult(result, metrics) {
    if (result.error) {
        const message = result.error === 'stopAboveEntry' ? t('riskTrialStopAbove') : t('riskTrialPrompt');
        return `<p class="risk-trial-status">${message}</p>`;
    }
    if (result.units <= 0) {
        return `<p class="risk-trial-status warning">${result.limitedBy === 'principal' ? t('riskTrialNoRoom') : t('riskTrialTooSmall')}</p>`;
    }
    const row = (label, value, tone = '') => `<div><dt>${label}</dt><dd class="${tone}">${value}</dd></div>`;
    const toneOf = status => (status === 'near' || status === 'over' ? 'warning' : '');
    const warnings = [];
    if (result.limitedBy === 'principal') warnings.push(t('riskTrialCapped', { units: formatUnits(result.rUnits) }));
    if (result.exceedsCash) warnings.push(t('riskTrialCash', { value: formatCurrency(metrics.cashValue, state.amountsHidden) }));
    return `
        <dl class="risk-trial-result">
            ${row(t('riskTrialUnits'), `<strong>${formatUnits(result.units)}</strong>`)}
            ${row(t('riskTrialValue'), `${formatCurrency(result.value, state.amountsHidden)}<small>${t('riskTrialWeight', { weight: formatWeight(result.weightPct) })}</small>`)}
            ${row(t('riskTrialAdded'), `${formatCurrency(result.addedRisk, state.amountsHidden)}<small>${t('riskStopDistance', { pct: formatWeight(result.stopDistancePct) })}</small>`)}
            ${row(t('riskTrialPrincipalAfter'), `${Number.isFinite(result.principalPctAfter) ? formatWeight(result.principalPctAfter) : '-'}<small>${t('riskLimitShort', { limit: formatSetting(metrics.settings.principalLimit) })}</small>`, toneOf(result.principalStatusAfter))}
            ${row(t('riskTrialDrawdownAfter'), `${Number.isFinite(result.projectedDrawdownAfter) ? formatWeight(result.projectedDrawdownAfter) : '-'}<small>${t('riskLimitShort', { limit: formatSetting(metrics.settings.drawdownLimit) })}</small>`, toneOf(result.drawdownStatusAfter))}
        </dl>
        ${warnings.map(text => `<p class="risk-trial-status warning">${text}</p>`).join('')}
        <p class="alloc-footnote">${t('riskTrialNote')}</p>
    `;
}

function formatUnits(value) {
    return new Intl.NumberFormat(state.currentLang === 'en' ? 'en-US' : 'zh-CN', { maximumFractionDigits: 0 }).format(value);
}

function formatSetting(value) {
    return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

function renderEmpty(message) {
    return `
        <div class="empty-state alloc-empty">
            <div>
                <p>${message}</p>
                <button class="primary-btn" type="button" data-risk-action="go-asset-data">${t('allocationGoAssetData')}</button>
            </div>
        </div>
    `;
}

export function bindRiskPanel({ onScopeChange, onEditStop, onGoToAssetData, onRender }) {
    document.getElementById('riskScopeSwitch')?.addEventListener('change', event => {
        if (event.target.id === 'riskScopeSelect') onScopeChange(event.target.value);
    });
    const content = document.getElementById('riskContent');
    // Re-render on change (blur or Enter), not on every keystroke, so the input keeps focus.
    content?.addEventListener('change', event => {
        const key = event.target.dataset?.riskTrial;
        if (!key) return;
        const value = event.target.value.trim();
        const num = Number(value);
        trial[key] = value === '' || !Number.isFinite(num) || num <= 0 ? '' : value;
        onRender();
        requestAnimationFrame(() => document.querySelector(`[data-risk-trial="${key}"]`)?.focus());
    });
    content?.addEventListener('keydown', event => {
        if (event.target.dataset?.riskTrial && event.key === 'Enter') {
            event.preventDefault();
            event.target.dispatchEvent(new Event('change', { bubbles: true }));
        }
    });
    content?.addEventListener('click', event => {
        const stop = event.target.closest('[data-risk-stop]');
        if (stop) {
            onEditStop(stop.dataset.riskStop);
            return;
        }
        const toggle = event.target.closest('[data-risk-toggle]');
        if (toggle) {
            const id = toggle.dataset.riskToggle;
            const isOpen = !expandedPositions.has(id);
            if (isOpen) expandedPositions.add(id);
            else expandedPositions.delete(id);
            toggle.closest('.risk-item')?.classList.toggle('expanded', isOpen);
            toggle.setAttribute('aria-expanded', String(isOpen));
            document.getElementById(`riskDetails-${id}`)?.toggleAttribute('hidden', !isOpen);
            return;
        }
        if (event.target.closest('[data-risk-action="go-asset-data"]')) onGoToAssetData();
    });
}
