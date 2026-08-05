import { state } from '../../config/state.js';
import { escapeHtml, todayKey } from '../../utils/formatter.js';

export function renderSnapshotForm() {
    const select = document.getElementById('snapshotAccountSelect');
    const dateInput = document.getElementById('snapshotDateInput');
    const submitBtn = document.getElementById('snapshotSubmitBtn');
    const cancelBtn = document.getElementById('cancelEditBtn');
    if (!select || !dateInput || !submitBtn || !cancelBtn) return;

    select.innerHTML = state.accounts.length === 0
        ? '<option value="">请先新增账户</option>'
        : state.accounts.map(account => `<option value="${account.id}">${escapeHtml(account.name)}</option>`).join('');
    select.value = state.selectedAccountId || state.accounts[0]?.id || '';
    select.disabled = state.accounts.length === 0;
    submitBtn.disabled = state.accounts.length === 0;

    if (!dateInput.value) dateInput.value = todayKey();

    const editing = state.snapshots.find(snapshot => snapshot.id === state.editingSnapshotId);
    submitBtn.textContent = editing ? '更新快照' : '保存快照';
    cancelBtn.classList.toggle('hidden', !editing);

    if (editing) {
        select.value = editing.accountId;
        dateInput.value = editing.date;
        document.getElementById('snapshotValueInput').value = editing.totalValue;
        document.getElementById('snapshotFlowInput').value = editing.netFlow;
        document.getElementById('snapshotNoteInput').value = editing.note || '';
    }
}

export function readSnapshotForm() {
    return {
        accountId: document.getElementById('snapshotAccountSelect').value,
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
}

export function showFormMessage(message, isError = false) {
    const el = document.getElementById('formMessage');
    if (!el) return;
    el.textContent = message || '';
    el.classList.toggle('error', Boolean(isError));
}
