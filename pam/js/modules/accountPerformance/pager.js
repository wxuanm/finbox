import { t } from '../../config/i18n.js';
import { escapeHtml } from '../../utils/formatter.js';

// Shared by the paged lists in 账户管理. Buttons carry data-page; each list handles the click and re-renders.
// Like the VSIX NAV list, desktop lists pair two records per table row; phones show one record per row.
export const LIST_SINGLE_COLUMN_QUERY = '(max-width: 720px)';
// Cell class that draws the divider between the left and right halves of a paired row.
export const LIST_HALF_START_CLASS = 'list-half-start';

export function getListColumnCount(singleColumnQuery = LIST_SINGLE_COLUMN_QUERY) {
    return window.matchMedia?.(singleColumnQuery).matches ? 1 : 2;
}

// Newest first down the left half, then continuing down the right half; a short right half leaves a blank cell.
export function pairRows(rows, columnCount) {
    if (columnCount < 2) return rows.map(row => [row]);
    const half = Math.ceil(rows.length / 2);
    return rows.slice(0, half).map((row, index) => [row, rows[half + index]]);
}

// Keeps the first visible row on screen when the page size changes, e.g. across the phone breakpoint.
export function keepFirstRowPage(page, fromPageSize, toPageSize) {
    return Math.floor((page - 1) * fromPageSize / toPageSize) + 1;
}

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
