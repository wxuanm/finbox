import { t } from '../../config/i18n.js';
import { escapeHtml } from '../../utils/formatter.js';

// Shared by the paged lists in 账户管理. Buttons carry data-page; each list handles the click and re-renders.
export function getPageCount(rowCount, pageSize) {
    return Math.max(1, Math.ceil(rowCount / pageSize));
}

export function clampPage(page, pageCount) {
    return Math.min(Math.max(page, 1), pageCount);
}

export function renderPager(currentPage, pageCount, rowCount) {
    const button = (page, label, disabled, extraClass = '') => `
        <button class="mini-btn list-pager-page${extraClass}" type="button" data-page="${page}"${disabled ? ' disabled' : ''}>${label}</button>
    `;
    return `
        <div class="list-pager">
            <span>${escapeHtml(t('pagerSummary', { page: currentPage, pages: pageCount, count: rowCount }))}</span>
            <div class="list-pager-actions">
                ${button(1, t('pagerFirst'), currentPage <= 1)}
                ${button(currentPage - 1, t('pagerPrev'), currentPage <= 1)}
                ${buildPageNumbers(currentPage, pageCount).map(page => page === null
                    ? '<span class="list-pager-gap">...</span>'
                    : button(page, page, page === currentPage, page === currentPage ? ' active' : '')).join('')}
                ${button(currentPage + 1, t('pagerNext'), currentPage >= pageCount)}
                ${button(pageCount, t('pagerLast'), currentPage >= pageCount)}
            </div>
        </div>
    `;
}

// First, last, and two pages either side of the current one; null marks a gap.
function buildPageNumbers(currentPage, pageCount) {
    const pages = new Set([1, pageCount]);
    for (let page = currentPage - 2; page <= currentPage + 2; page += 1) {
        if (page >= 1 && page <= pageCount) pages.add(page);
    }
    const result = [];
    let previous = 0;
    [...pages].sort((a, b) => a - b).forEach(page => {
        if (page - previous > 1) result.push(null);
        result.push(page);
        previous = page;
    });
    return result;
}
