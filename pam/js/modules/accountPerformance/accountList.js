import { state } from '../../config/state.js';
import { periodLabel, t } from '../../config/i18n.js';
import { escapeHtml, formatCurrency, formatPercent, signedClass } from '../../utils/formatter.js';

// 账户管理 summary: four 资产配置-style tiles for the selected account. The portfolio totals live on 账户收益,
// so this page answers "how is this account doing". An account that cannot be calculated shows its reason.
export function renderAccountSummary(metrics) {
    const el = document.getElementById('accountSummary');
    if (!el) return;
    el.hidden = state.accounts.length === 0;
    if (state.accounts.length === 0) {
        el.innerHTML = '';
        return;
    }
    const masked = state.amountsHidden;
    const account = state.accounts.find(item => item.id === state.selectedAccountId) || state.accounts[0];
    const metric = metrics.find(item => item.account.id === account.id);
    const latest = latestSnapshotOf(account.id);
    const valid = Boolean(metric?.valid);
    const annualizedReturn = calculateAnnualizedReturn(metric);
    const dash = '-';

    const tile = (label, value, tone, hint) => `
        <div>
            <dt>${escapeHtml(label)}</dt>
            <dd><strong class="${tone}">${value}</strong><small>${hint}</small></dd>
        </div>
    `;
    el.innerHTML = [
        tile(
            t('totalAssets'),
            latest ? formatCurrency(latest.totalValue, masked) : dash,
            '',
            escapeHtml(latest ? latest.date : t('noSnapshot'))
        ),
        tile(
            t('cumulativeProfit'),
            valid ? formatSignedCurrency(metric.profitLoss, masked) : dash,
            signedClass(valid ? metric.profitLoss : null),
            escapeHtml(valid ? `${t('periodPnl')} ${formatSignedCurrency(metric.periodProfitLoss, masked)}` : (metric?.error || t('needTwoSnapshots')))
        ),
        tile(
            t('periodReturn'),
            valid && Number.isFinite(metric.periodReturn) ? formatPercent(metric.periodReturn) : dash,
            signedClass(valid ? metric.periodReturn : null),
            escapeHtml(periodLabel(state.selectedPeriod))
        ),
        tile(
            t('annualizedReturn'),
            Number.isFinite(annualizedReturn) ? formatPercent(annualizedReturn) : dash,
            signedClass(annualizedReturn),
            escapeHtml(valid ? `${t('cumulativeReturn')} ${formatPercent(metric.cumulativeReturn)}` : dash)
        )
    ].join('');
}

function formatSignedCurrency(value, masked = false) {
    const num = Number(value);
    if (masked || !Number.isFinite(num)) return formatCurrency(num, masked);
    return `${num > 0 ? '+' : ''}${formatCurrency(num)}`;
}

function latestSnapshotOf(accountId) {
    return state.snapshots
        .filter(snapshot => snapshot.accountId === accountId)
        .reduce((latest, snapshot) => (!latest || snapshot.date > latest.date ? snapshot : latest), null);
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

// The account switch bar is the account picker for the whole view: one chip per account, the selected one
// highlighted. Chips can be dragged to reorder. The rename/delete menu beside the bar acts on the selected
// account. The bar and menu are hidden while there are no accounts.
export function renderAccountList() {
    const wrap = document.getElementById("accountSwitchBar");
    const menu = document.getElementById("accountMenu");
    const hasAccounts = state.accounts.length > 0;
    // The chip list is empty with no accounts, so it hides; 新增账户 in the action row stays available.
    if (wrap) wrap.hidden = !hasAccounts;
    if (menu) {
        menu.hidden = !hasAccounts;
        menu.open = false;
    }
    if (!wrap) return;
    const selectedId = currentSelectedId();
    wrap.innerHTML = state.accounts.map(account => {
        const active = account.id === selectedId;
        return `<button class="account-chip${active ? " active" : ""}" type="button" draggable="true" data-account-id="${account.id}" aria-pressed="${active}">${escapeHtml(account.name)}</button>`;
    }).join("");
}

export function currentSelectedId() {
    return state.accounts.some(account => account.id === state.selectedAccountId)
        ? state.selectedAccountId
        : state.accounts[0]?.id;
}

export function bindAccountList({ onSelect, onRename, onDelete, onReorder }) {
    const wrap = document.getElementById("accountSwitchBar");
    if (!wrap) return;
    let draggedAccountId = "";

    wrap.addEventListener("click", event => {
        const chip = event.target.closest(".account-chip");
        if (!chip) return;
        onSelect(chip.dataset.accountId);
        // The chips are re-rendered; keep keyboard focus on the chosen one.
        document.querySelector(`#accountSwitchBar [data-account-id="${CSS.escape(chip.dataset.accountId)}"]`)?.focus({ preventScroll: true });
    });

    document.getElementById("accountRenameBtn")?.addEventListener("click", () => {
        const id = currentSelectedId();
        if (id) onRename(id);
    });
    document.getElementById("accountDeleteBtn")?.addEventListener("click", () => {
        const id = currentSelectedId();
        if (id) onDelete(id);
    });

    wrap.addEventListener("dragstart", event => {
        const chip = event.target.closest(".account-chip");
        if (!chip) return;
        draggedAccountId = chip.dataset.accountId;
        chip.classList.add("is-dragging");
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", draggedAccountId);
    });

    wrap.addEventListener("dragover", event => {
        if (!draggedAccountId) return;
        const chip = event.target.closest(".account-chip");
        if (!chip || chip.dataset.accountId === draggedAccountId) return;
        event.preventDefault();
        clearDropTargets(wrap);
        chip.classList.add(isDropAfter(event, chip) ? "drop-after" : "drop-before");
        event.dataTransfer.dropEffect = "move";
    });

    wrap.addEventListener("dragleave", event => {
        const chip = event.target.closest(".account-chip");
        if (!chip || chip.contains(event.relatedTarget)) return;
        chip.classList.remove("drop-before", "drop-after");
    });

    wrap.addEventListener("drop", event => {
        if (!draggedAccountId) return;
        const chip = event.target.closest(".account-chip");
        if (!chip || chip.dataset.accountId === draggedAccountId) return;
        event.preventDefault();
        const position = isDropAfter(event, chip) ? "after" : "before";
        clearDropTargets(wrap);
        onReorder?.(draggedAccountId, chip.dataset.accountId, position);
    });

    wrap.addEventListener("dragend", () => {
        draggedAccountId = "";
        wrap.querySelector(".is-dragging")?.classList.remove("is-dragging");
        clearDropTargets(wrap);
    });
}

// Keeps the selected chip in view on the sideways-scrolling bar.
export function scrollAccountCardIntoView(accountId, behavior = "smooth") {
    if (!accountId) return;
    const row = document.getElementById("accountSwitchBar");
    const chip = row && Array.from(row.querySelectorAll(".account-chip")).find(element => element.dataset.accountId === accountId);
    if (!chip || row.clientWidth === 0) return;
    const target = chip.offsetLeft - (row.clientWidth - chip.offsetWidth) / 2;
    row.scrollTo({ left: Math.min(Math.max(0, target), row.scrollWidth - row.clientWidth), behavior });
}

function isDropAfter(event, item) {
    const rect = item.getBoundingClientRect();
    return event.clientX > rect.left + rect.width / 2;
}

function clearDropTargets(wrap) {
    wrap.querySelectorAll(".drop-before, .drop-after").forEach(item => {
        item.classList.remove("drop-before", "drop-after");
    });
}
