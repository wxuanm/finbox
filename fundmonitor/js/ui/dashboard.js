import { state } from '../config/state.js';
import { i18n } from '../config/i18n.js';

function formatLeaderChange(value) {
    const prefix = value > 0 ? '+' : '';
    return `${prefix}${value.toFixed(2)}%`;
}

function formatLeaderLine(leader) {
    return `${leader.name || leader.code} (${leader.code}) ${formatLeaderChange(leader.change)}`;
}

function isDesktopTooltipEnabled() {
    return !window.matchMedia('(max-width: 768px)').matches;
}

function ensureFloatingDashboardTooltip() {
    let tooltip = document.getElementById('dashboardChangeTooltip');
    if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.id = 'dashboardChangeTooltip';
        tooltip.className = 'group-change-tooltip';
        document.body.appendChild(tooltip);
    }
    return tooltip;
}

function renderFloatingDashboardTooltip(tooltip, leaders) {
    tooltip.replaceChildren(...leaders.map(leader => {
        const row = document.createElement('div');
        row.className = 'group-change-tooltip-row';

        const change = document.createElement('span');
        change.className = 'group-change-tooltip-change';
        change.textContent = formatLeaderChange(leader.change);

        const name = document.createElement('span');
        name.className = 'group-change-tooltip-name';
        name.textContent = `${leader.name || leader.code} (${leader.code})`;

        row.append(name, change);
        return row;
    }));
}

function positionFloatingDashboardTooltip(anchor, tooltip) {
    const rect = anchor.getBoundingClientRect();
    const margin = 10;
    const viewportPadding = 12;
    const tooltipRect = tooltip.getBoundingClientRect();
    const belowTop = rect.bottom + margin;
    const aboveTop = rect.top - tooltipRect.height - margin;
    const top = belowTop + tooltipRect.height <= window.innerHeight - viewportPadding
        ? belowTop
        : Math.max(viewportPadding, aboveTop);
    const left = Math.min(
        Math.max(viewportPadding, rect.left),
        window.innerWidth - tooltipRect.width - viewportPadding
    );

    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
}

function hideFloatingDashboardTooltip(anchor) {
    const tooltip = document.getElementById('dashboardChangeTooltip');
    if (!tooltip || tooltip.dataset.anchorId !== anchor.dataset.tooltipId) return;

    tooltip.classList.remove('show');
    tooltip.removeAttribute('data-anchor-id');
}

function showFloatingDashboardTooltip(anchor) {
    const leaders = anchor.dashboardTooltipLeaders || [];
    if (leaders.length === 0 || !isDesktopTooltipEnabled()) return;

    const tooltip = ensureFloatingDashboardTooltip();
    renderFloatingDashboardTooltip(tooltip, leaders);
    tooltip.dataset.anchorId = anchor.dataset.tooltipId;
    tooltip.classList.add('show');
    positionFloatingDashboardTooltip(anchor, tooltip);
}

function attachDashboardTooltipEvents(card) {
    if (card.dataset.tooltipBound === 'true') return;

    card.dataset.tooltipBound = 'true';
    card.dataset.tooltipId = `dashboard-tooltip-${Math.random().toString(36).slice(2)}`;
    card.addEventListener('mouseenter', event => showFloatingDashboardTooltip(event.currentTarget));
    card.addEventListener('mousemove', event => {
        const tooltip = document.getElementById('dashboardChangeTooltip');
        if (tooltip?.classList.contains('show')) {
            positionFloatingDashboardTooltip(event.currentTarget, tooltip);
        }
    });
    card.addEventListener('mouseleave', event => hideFloatingDashboardTooltip(event.currentTarget));
}

function updateLeader(prefix, leaders) {
    const card = document.getElementById(`${prefix}Stat`);

    if (!card) return;

    attachDashboardTooltipEvents(card);
    card.dashboardTooltipLeaders = leaders;
    card.setAttribute('aria-label', leaders.length === 0
        ? i18n[state.currentLang].statNoLeader
        : leaders.map(formatLeaderLine).join('\n')
    );
    card.removeAttribute('title');

    if (leaders.length === 0) {
        hideFloatingDashboardTooltip(card);
        return;
    }
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
