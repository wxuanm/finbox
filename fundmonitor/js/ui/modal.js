import { state } from '../config/state.js';
import { i18n } from '../config/i18n.js';
import { formatRet } from '../utils/formatter.js';

let compareSortKey = '';
let compareSortOrder = 1;
let mobileCompareSortKey = '';
let mobileCompareSortOrder = 1;
const defaultMobileSortKey = 'y1';

function parseReturnValue(value) {
    if (!value || value === '---' || value === 'N/A') return -Infinity;
    const num = parseFloat(String(value).replace('%', ''));
    return Number.isNaN(num) ? -Infinity : num;
}

function sortCompareRows(rows, key) {
    if (compareSortKey === key) {
        compareSortOrder *= -1;
    } else {
        compareSortKey = key;
        compareSortOrder = 1;
    }

    rows.sort((a, b) => {
        if (key === 'name') {
            return `${a.name}${a.fundCode}`.localeCompare(`${b.name}${b.fundCode}`, state.currentLang === 'zh' ? 'zh-CN' : 'en', { numeric: true }) * compareSortOrder;
        }

        return (parseReturnValue(a[key]) - parseReturnValue(b[key])) * compareSortOrder;
    });
}

function applyCompareSort(rows, key, order) {
    rows.sort((a, b) => {
        if (key === 'name') {
            return `${a.name}${a.fundCode}`.localeCompare(`${b.name}${b.fundCode}`, state.currentLang === 'zh' ? 'zh-CN' : 'en', { numeric: true }) * order;
        }

        return (parseReturnValue(a[key]) - parseReturnValue(b[key])) * order;
    });
}

function updateCompareSortIcons() {
    document.querySelectorAll('.analysis-compare-table th[data-compare-sort]').forEach(header => {
        const icon = header.querySelector('.sort-icon');
        if (!icon) return;
        icon.textContent = header.dataset.compareSort === compareSortKey ? (compareSortOrder === 1 ? '▲' : '▼') : '';
    });
}

function renderCompareRows(rows, comparisonColumns) {
    return rows.map(row => `
        <tr>
            <td>
                <div class="compare-fund-name">
                    <strong>${row.name}</strong>
                    <span>${row.fundCode}</span>
                </div>
            </td>
            ${comparisonColumns.map(([, key]) => `<td>${formatRet(row[key])}</td>`).join('')}
        </tr>
    `).join('');
}

function bindCompareSorting(rows, comparisonColumns) {
    const table = document.querySelector('.analysis-compare-table');
    if (!table) return;

    table.querySelectorAll('th[data-compare-sort]').forEach(header => {
        header.addEventListener('click', () => {
            sortCompareRows(rows, header.dataset.compareSort);
            table.querySelector('tbody').innerHTML = renderCompareRows(rows, comparisonColumns);
            updateCompareSortIcons();
        });
    });
}

function renderMobileCompareCards(rows, primaryColumn, defaultColumns, moreColumns, dict) {
    const [primaryLabel, primaryKey] = primaryColumn;
    return rows.map((row, index) => `
        <section class="compare-mobile-card">
            <div class="compare-mobile-head">
                <div class="compare-mobile-title">
                    <strong>${row.name}</strong>
                    <span>${row.fundCode}</span>
                </div>
                <div class="compare-mobile-primary">
                    <span>#${index + 1} ${dict[primaryLabel]}</span>
                    ${formatRet(row[primaryKey])}
                </div>
            </div>
            <div class="compare-mobile-grid">
                ${defaultColumns.map(([label, key]) => `
                    <div class="compare-mobile-item"><span>${dict[label]}</span>${formatRet(row[key])}</div>
                `).join('')}
            </div>
            <details class="compare-mobile-more">
                <summary>${state.currentLang === 'zh' ? '展开更多' : 'More periods'}</summary>
                <div class="compare-mobile-grid">
                    ${moreColumns.map(([label, key]) => `
                        <div class="compare-mobile-item"><span>${dict[label]}</span>${formatRet(row[key])}</div>
                    `).join('')}
                </div>
            </details>
        </section>
    `).join('');
}

function updateMobileCompareCards(rows, comparisonColumns, dict) {
    const cards = document.querySelector('.compare-mobile-card-list');
    if (!cards) return;

    const primaryColumn = comparisonColumns.find(([, key]) => key === mobileCompareSortKey) || comparisonColumns.find(([, key]) => key === defaultMobileSortKey) || comparisonColumns[0];
    const primaryKey = primaryColumn[1];
    const defaultKeys = new Set(['w1', 'm1', 'm3', 'm6', 'y1']);
    const defaultColumns = comparisonColumns.filter(([, key]) => defaultKeys.has(key) && key !== primaryKey);
    const moreColumns = comparisonColumns.filter(([, key]) => !defaultKeys.has(key));

    cards.innerHTML = renderMobileCompareCards(rows, primaryColumn, defaultColumns, moreColumns, dict);
}

function updateMobileSortChips() {
    document.querySelectorAll('.compare-mobile-sort-chip').forEach(chip => {
        const active = chip.dataset.compareSort === mobileCompareSortKey;
        chip.classList.toggle('active', active);
        chip.textContent = `${chip.dataset.label}${active ? (mobileCompareSortOrder === 1 ? ' ▲' : ' ▼') : ''}`;
    });
}

function bindMobileCompareSorting(rows, comparisonColumns, dict) {
    document.querySelectorAll('.compare-mobile-sort-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const key = chip.dataset.compareSort;
            if (mobileCompareSortKey === key) {
                mobileCompareSortOrder *= -1;
            } else {
                mobileCompareSortKey = key;
                mobileCompareSortOrder = -1;
            }
            applyCompareSort(rows, mobileCompareSortKey, mobileCompareSortOrder);
            updateMobileCompareCards(rows, comparisonColumns, dict);
            updateMobileSortChips();
        });
    });
}

export function closeModal(event) {
    if (event && event.target !== document.getElementById('analysisModal') && event.currentTarget !== event.target) return;
    const modal = document.getElementById('analysisModal');
    const content = document.getElementById('analysisContent');
    const title = document.getElementById('modalTitle');
    
    modal.classList.remove('show');
    document.body.style.overflow = '';
    
    setTimeout(() => {
        content.innerHTML = '';
        if (title) title.textContent = i18n[state.currentLang].modalTitle;
    }, 300);
}

export function navigateToAnalysis(codes, groupName = '') {
    const modal = document.getElementById('analysisModal');
    const content = document.getElementById('analysisContent');
    const loader = document.getElementById('modalLoader');
    const title = document.getElementById('modalTitle');
    const codeList = Array.isArray(codes) ? codes : [codes];
    modal.dataset.analysisCodes = codeList.join(',');
    modal.dataset.analysisGroupName = groupName;
    
    // Reset state
    content.style.display = 'none';
    content.style.opacity = '0';
    content.innerHTML = '';
    if (title) title.textContent = i18n[state.currentLang].modalTitle;
    loader.classList.remove('hidden');
    modal.classList.add('show');
    document.body.style.overflow = 'hidden';

    // Fetch native data
    const script = document.createElement('script');
    script.src = `/api/fundgz?code=${codeList.join(',')}&t=1&rt=${Date.now()}`;
    
    // Generate native UI on load
    script.onload = () => {
        if (typeof window.fundinfo_yjpj !== 'undefined') {
            const data = window.fundinfo_yjpj;
            const dict = i18n[state.currentLang];
            const rows = (data.jdsy || []).map(row => {
                const [
                    fundCode = '-', name = '-', estDate = '-',
                    ytd = '-', w1 = '-', m1 = '-', m3 = '-', m6 = '-', y1 = '-',
                    y2 = '-', y3 = '-', y5 = '-', inc = '-'
                ] = String(row).split(',');
                return { fundCode, name, estDate, ytd, w1, m1, m3, m6, y1, y2, y3, y5, inc };
            });

            if (rows.length === 0) {
                loader.classList.add('hidden');
                content.style.display = 'block';
                content.style.opacity = '1';
                content.innerHTML = `<div class="error-message modal-error">${i18n[state.currentLang].fetchError} (No Data)</div>`;
                delete window.fundinfo_yjpj;
                script.remove();
                return;
            }

            const comparisonColumns = [
                ['period1w', 'w1'],
                ['period1m', 'm1'],
                ['period3m', 'm3'],
                ['period6m', 'm6'],
                ['periodYtd', 'ytd'],
                ['period1y', 'y1'],
                ['period2y', 'y2'],
                ['period3y', 'y3'],
                ['period5y', 'y5'],
                ['periodInc', 'inc']
            ];
            const primaryColumn = ['period1y', 'y1'];
            compareSortKey = '';
            compareSortOrder = 1;
            mobileCompareSortKey = defaultMobileSortKey;
            mobileCompareSortOrder = -1;
            const mobileSortColumns = [
                ['period1w', 'w1'],
                ['period1m', 'm1'],
                ['period3m', 'm3'],
                ['period1y', 'y1']
            ];
            const mobileRows = [...rows];
            applyCompareSort(mobileRows, mobileCompareSortKey, mobileCompareSortOrder);
            if (title) {
                title.textContent = `${groupName ? `${groupName} · ` : ''}${dict.modalTitle} · ${rows.length} ${dict.compareCount}`;
            }

            content.innerHTML = `
                <div class="analysis-compare-summary">
                    ${rows.map(row => `
                        <div class="compare-summary-card">
                            <div class="compare-summary-name">
                                <strong>${row.name}</strong>
                                <span>${row.fundCode}</span>
                            </div>
                            <div class="compare-summary-return">
                                <span>${dict[primaryColumn[0]]}</span>
                                ${formatRet(row[primaryColumn[1]])}
                            </div>
                        </div>
                    `).join('')}
                </div>

                <div class="analysis-compare-wrap">
                    <table class="analysis-compare-table">
                        <thead>
                            <tr>
                                <th data-compare-sort="name">${dict.compareName}<span class="sort-icon"></span></th>
                                ${comparisonColumns.map(([label, key]) => `<th data-compare-sort="${key}">${dict[label]}<span class="sort-icon"></span></th>`).join('')}
                            </tr>
                        </thead>
                        <tbody>
                            ${renderCompareRows(rows, comparisonColumns)}
                        </tbody>
                    </table>
                </div>

                <div class="analysis-compare-cards">
                    <div class="compare-mobile-sort-bar">
                        <span>${state.currentLang === 'zh' ? '排序' : 'Sort'}</span>
                        <div class="compare-mobile-sort-chips">
                            ${mobileSortColumns.map(([label, key]) => `<button class="compare-mobile-sort-chip${key === mobileCompareSortKey ? ' active' : ''}" type="button" data-compare-sort="${key}" data-label="${dict[label]}">${dict[label]}${key === mobileCompareSortKey ? ' ▼' : ''}</button>`).join('')}
                        </div>
                    </div>
                    <div class="compare-mobile-card-list">
                        ${renderMobileCompareCards(mobileRows, primaryColumn, comparisonColumns.filter(([, key]) => ['w1', 'm1', 'm3', 'm6', 'y1'].includes(key) && key !== primaryColumn[1]), comparisonColumns.filter(([, key]) => !['w1', 'm1', 'm3', 'm6', 'y1'].includes(key)), dict)}
                    </div>
                </div>
            `;
            
            // Show content, hide loader
            loader.classList.add('hidden');
            content.style.display = 'block';
            // Trigger reflow to animate opacity
            void content.offsetWidth;
            content.style.opacity = '1';
            bindCompareSorting(rows, comparisonColumns);
            bindMobileCompareSorting(mobileRows, comparisonColumns, dict);
        } else {
            loader.classList.add('hidden');
            content.style.display = 'block';
            content.style.opacity = '1';
            content.innerHTML = `<div class="error-message modal-error">${i18n[state.currentLang].fetchError} (No Data)</div>`;
        }
        delete window.fundinfo_yjpj;
        script.remove();
    };
    
    script.onerror = () => {
        loader.classList.add('hidden');
        content.style.display = 'block';
        content.style.opacity = '1';
        content.innerHTML = `<div class="error-message modal-error">${i18n[state.currentLang].fetchError} (Network Error)</div>`;
        script.remove();
    };
    document.head.appendChild(script);
}

export function initModalListeners() {
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const modal = document.getElementById('analysisModal');
            if (modal.classList.contains('show')) {
                closeModal();
            }
        }
    });
}
