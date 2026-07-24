import { state } from '../config/state.js';

export function updateDashboardStats() {
    const table = document.getElementById('fundTable');
    const fundCountStat = document.getElementById('fundCountStat');
    const positiveCountStat = document.getElementById('positiveCountStat');
    const negativeCountStat = document.getElementById('negativeCountStat');

    const dataRows = Array.from(table.querySelectorAll('tr[id^="fund-"]'));
    fundCountStat.textContent = String(state.fundCodes.size);

    const positiveCount = dataRows.filter(row => row.cells[2] && row.cells[2].querySelector('.positive')).length;
    const negativeCount = dataRows.filter(row => row.cells[2] && row.cells[2].querySelector('.negative')).length;

    positiveCountStat.textContent = String(positiveCount);
    negativeCountStat.textContent = String(negativeCount);
}

export function updateLastRefreshTime() {
    const lastRefreshStat = document.getElementById('lastRefreshStat');
    const now = new Date();
    lastRefreshStat.textContent = now.toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit'
    });
}
