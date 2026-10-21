import { state } from '../../config/state.js';
import { t } from '../../config/i18n.js';
import { escapeHtml, formatCurrency, todayKey } from '../../utils/formatter.js';

export function renderSnapshotForm() {
    const select = document.getElementById('snapshotAccountSelect');
    const dateInput = document.getElementById('snapshotDateInput');
    const submitBtn = document.getElementById('snapshotSubmitBtn');
    const cancelBtn = document.getElementById('cancelEditBtn');
    if (!select || !dateInput || !submitBtn || !cancelBtn) return;

    const account = state.accounts.find(item => item.id === state.selectedAccountId) || state.accounts[0];
    select.innerHTML = account
        ? `<option value="${account.id}">${escapeHtml(account.name)}</option>`
        : `<option value="">${t('pleaseAddAccountFirst')}</option>`;
    select.value = account?.id || '';
    select.disabled = true;
    submitBtn.disabled = !account;

    if (!dateInput.value) dateInput.value = todayKey();

    const editing = state.snapshots.find(snapshot => snapshot.id === state.editingSnapshotId);
    const dialogTitle = document.getElementById('snapshotDialogTitle');
    if (dialogTitle) dialogTitle.textContent = editing ? t('editSnapshot') : t('addSnapshot');
    submitBtn.textContent = editing ? t('updateSnapshot') : t('addSnapshot');
    cancelBtn.classList.toggle('hidden', !editing);
    cancelBtn.textContent = editing ? t('cancelEdit') : t('cancelAdd');

    if (editing) {
        dateInput.value = editing.date;
        document.getElementById('snapshotValueInput').value = editing.totalValue;
        document.getElementById('snapshotFlowInput').value = editing.netFlow;
        document.getElementById('snapshotNoteInput').value = editing.note || '';
    }
    syncSnapshotAdjustLater();
}

export function readSnapshotForm() {
    return {
        accountId: state.selectedAccountId,
        date: document.getElementById('snapshotDateInput').value,
        totalValue: Number(document.getElementById('snapshotValueInput').value),
        netFlow: Number(document.getElementById('snapshotFlowInput').value || 0),
        note: document.getElementById('snapshotNoteInput').value.trim()
    };
}

export function resetSnapshotForm() {
    state.editingSnapshotId = '';
    document.getElementById('snapshotDateInput').value = todayKey();
    document.getElementById('snapshotValueInput').value = '';
    document.getElementById('snapshotFlowInput').value = '0';
    document.getElementById('snapshotNoteInput').value = '';
    const adjustInput = document.getElementById('snapshotAdjustLaterInput');
    if (adjustInput) adjustInput.checked = false;
    syncSnapshotAdjustLater();
}

export function shouldAdjustLaterSnapshots() {
    return Boolean(document.getElementById('snapshotAdjustLaterInput')?.checked);
}

// Total assets are stored per snapshot, so a flow added or corrected on a past date never reaches
// the totals recorded after it. Each later snapshot shifts by the change in counted cumulative net
// flow up to its date. The earliest snapshot's flow is ignored by the unit NAV baseline, so it is
// excluded on both sides; moved dates and replaced same-day snapshots fall out of the same rule.
export function getLaterSnapshotAdjustments(payload) {
    if (!payload.accountId || !payload.date || !Number.isFinite(payload.netFlow)) return [];
    const before = state.snapshots.filter(snapshot => snapshot.accountId === payload.accountId);
    const kept = before.filter(snapshot => snapshot.id !== state.editingSnapshotId && snapshot.date !== payload.date);
    const after = [...kept, payload];

    return kept
        .map(snapshot => {
            const delta = countedFlowUntil(after, snapshot.date) - countedFlowUntil(before, snapshot.date);
            return { snapshot, delta: Math.round(delta * 100) / 100 };
        })
        .filter(item => item.delta !== 0)
        .sort((a, b) => a.snapshot.date.localeCompare(b.snapshot.date));
}

function countedFlowUntil(snapshots, date) {
    const earliestDate = snapshots.reduce((min, snapshot) => (snapshot.date < min ? snapshot.date : min), snapshots[0]?.date);
    return snapshots
        .filter(snapshot => snapshot.date !== earliestDate && snapshot.date <= date)
        .reduce((sum, snapshot) => sum + (Number(snapshot.netFlow) || 0), 0);
}

export function syncSnapshotAdjustLater() {
    const field = document.getElementById('snapshotAdjustLaterField');
    const hint = document.getElementById('snapshotAdjustLaterHint');
    if (!field || !hint || !document.getElementById('snapshotDateInput')) return;

    const adjustments = getLaterSnapshotAdjustments(readSnapshotForm());
    field.classList.toggle('hidden', adjustments.length === 0);
    if (adjustments.length === 0) return;

    const deltas = new Set(adjustments.map(item => item.delta));
    const delta = adjustments[0].delta;
    hint.textContent = deltas.size === 1
        ? t('adjustLaterSnapshotsHint', {
            count: adjustments.length,
            amount: `${delta > 0 ? '+' : ''}${formatCurrency(delta, state.amountsHidden)}`
        })
        : t('adjustLaterSnapshotsMixedHint', { count: adjustments.length });
}

export function showFormMessage(message, isError = false) {
    const el = document.getElementById('formMessage');
    if (!el) return;
    el.textContent = message || '';
    el.classList.toggle('error', Boolean(isError));
}
