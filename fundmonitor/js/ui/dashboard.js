import { state } from '../config/state.js';
import { i18n } from '../config/i18n.js';

function formatLeaderChange(value) {
    const prefix = value > 0 ? '+' : '';
    return `${prefix}${value.toFixed(2)}%`;
}

function formatLeaderLine(leader) {
    return `${leader.name || leader.code} (${leader.code}) ${formatLeaderChange(leader.change)}`;
}

function updateLeader(prefix, leaders) {
    const card = document.getElementById(`${prefix}Stat`);

    if (!card) return;

    if (leaders.length === 0) {
        card.title = i18n[state.currentLang].statNoLeader;
        return;
    }

    card.title = leaders.map(formatLeaderLine).join('\n');
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
    const positiveLeaders = [];
    const negativeLeaders = [];

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
            positiveLeaders.push(leader);
        } else if (estimatedChange < 0) {
            negativeCount += 1;
            negativeLeaders.push(leader);
        }
    });

    positiveCountStat.textContent = String(positiveCount);
    negativeCountStat.textContent = String(negativeCount);
    updateLeader('topGain', positiveLeaders.sort((a, b) => b.change - a.change).slice(0, 3));
    updateLeader('topDrop', negativeLeaders.sort((a, b) => a.change - b.change).slice(0, 3));
}

export function updateLastRefreshTime() {
    const lastRefreshStat = document.getElementById('lastRefreshStat');
    const now = new Date();
    lastRefreshStat.textContent = now.toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit'
    });
}
