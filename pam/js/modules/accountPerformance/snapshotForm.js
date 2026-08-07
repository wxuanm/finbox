import { state } from '../../config/state.js';
import { escapeHtml, todayKey } from '../../utils/formatter.js';

export function renderSnapshotForm() {
    const select = document.getElementById('snapshotAccountSelect');
    const dateInput = document.getElementById('snapshotDateInput');
    const submitBtn = document.getElementById('snapshotSubmitBtn');
    const cancelBtn = document.getElementById('cancelEditBtn');
    if (!select || !dateInput || !submitBtn || !cancelBtn) return;

    const account = state.accounts.find(item => item.id === state.selectedAccountId) || state.accounts[0];
    select.innerHTML = account
        ? `<option value="${account.id}">${escapeHtml(account.name)}</option>`
        : '<option value="">请先新增账户</option>';
    select.value = account?.id || '';
    select.disabled = true;
    submitBtn.disabled = !account;

    if (!dateInput.value) dateInput.value = todayKey();

    const editing = state.snapshots.find(snapshot => snapshot.id === state.editingSnapshotId);
    const dialogTitle = document.getElementById('snapshotDialogTitle');
    if (dialogTitle) dialogTitle.textContent = editing ? '编辑快照' : '新增快照';
    submitBtn.textContent = editing ? '更新快照' : '新增快照';
    cancelBtn.classList.toggle('hidden', !editing);
    cancelBtn.textContent = editing ? '取消编辑' : '取消新增';

    if (editing) {
        dateInput.value = editing.date;
        document.getElementById('snapshotValueInput').value = editing.totalValue;
        document.getElementById('snapshotFlowInput').value = editing.netFlow;
        document.getElementById('snapshotNoteInput').value = editing.note || '';
    }
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
}

export function showFormMessage(message, isError = false) {
    const el = document.getElementById('formMessage');
    if (!el) return;
    el.textContent = message || '';
    el.classList.toggle('error', Boolean(isError));
}
