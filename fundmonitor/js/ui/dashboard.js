import { state } from '../config/state.js';
import { i18n } from '../config/i18n.js';

function formatLeaderChange(value) {
    const prefix = value > 0 ? '+' : '';
    return `${prefix}${value.toFixed(2)}%`;
}

function updateLeader(prefix, leader) {
    const nameEl = document.getElementById(`${prefix}Name`);
    const changeEl = document.getElementById(`${prefix}Change`);

    if (!nameEl || !changeEl) return;

    if (!leader) {
        nameEl.textContent = i18n[state.currentLang].statNoLeader;
        nameEl.title = '';
        changeEl.textContent = '--';
        return;
    }

    nameEl.textContent = leader.name || leader.code;
    nameEl.title = leader.name || leader.code;
    changeEl.textContent = formatLeaderChange(leader.change);
}

export function updateDashboardStats() {
    const table = document.getElementById('fundTable');
    const fundCountStat = document.getElementById('fundCountStat');
    const positiveCountStat = document.getElementById('positiveCountStat');
    const negativeCountStat = document.getElementById('negativeCountStat');

    const dataRows = Array.from(table.querySelectorAll('tr[id^="fund-"]'));
    fundCountStat.textContent = String(state.fundCodes.size);

    let positiveCount = 0;
    let negativeCount = 0;
    let topGain = null;
    let topDrop = null;

    dataRows.forEach(row => {
        const estimatedChange = Number.parseFloat(row.dataset.estimatedChange);
        if (Number.isNaN(estimatedChange)) return;

        const leader = {
            code: row.dataset.fundCode || row.id.replace('fund-', ''),
            name: row.dataset.fundName || '',
            change: estimatedChange
        };

        if (estimatedChange > 0) {
            positiveCount += 1;
            if (!topGain || estimatedChange > topGain.change) topGain = leader;
        } else if (estimatedChange < 0) {
            negativeCount += 1;
            if (!topDrop || estimatedChange < topDrop.change) topDrop = leader;
        }
    });

    positiveCountStat.textContent = String(positiveCount);
    negativeCountStat.textContent = String(negativeCount);
    updateLeader('topGain', topGain);
    updateLeader('topDrop', topDrop);
}

export function updateLastRefreshTime() {
    const lastRefreshStat = document.getElementById('lastRefreshStat');
    const now = new Date();
    lastRefreshStat.textContent = now.toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit'
    });
}
