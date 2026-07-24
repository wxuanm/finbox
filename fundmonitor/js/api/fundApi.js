import { state } from '../config/state.js';
import { i18n } from '../config/i18n.js';
import { updateFundRow } from '../ui/fundTable.js';
import { updateDashboardStats } from '../ui/dashboard.js';

export function handleFetchError(code) {
    const row = document.getElementById(`fund-${code}`);
    if (row) {
        row.classList.add('error-row');
        row.cells[1].innerHTML = `<span class="error-message">${i18n[state.currentLang].fetchError}</span>`;
        row.cells[2].textContent = '-';
        row.cells[3].textContent = '-';
        row.cells[4].textContent = '-';
        row.cells[5].textContent = '-';
        row.cells[6].textContent = '-';
        row.cells[7].textContent = '-';
        row.cells[8].textContent = '-';
        row.cells[9].textContent = '-';
        row.cells[10].textContent = '-';
        updateDashboardStats();
    }
}

export function fetchDataForCode(codeStr) {
    const existingScript = document.getElementById(`fund-script-${codeStr}`);
    if (existingScript) {
        existingScript.remove();
    }

    const script = document.createElement('script');
    script.id = `fund-script-${codeStr}`;
    script.src = `/api/fundgz?code=${codeStr}&rt=${Date.now()}`;
    script.onload = () => {
        if (window.fundinfo) {
            try {
                const rawArr = window.fundinfo;
                rawArr.forEach(fundStr => {
                    const fields = fundStr.split(',');
                    const fundCode = fields[0];
                    updateFundRow(fundCode, fields);
                });
            } catch (e) {
                handleFetchError(codeStr);
            }
        } else {
            handleFetchError(codeStr);
        }
        delete window.fundinfo;
        script.remove();
    };
    script.onerror = () => {
        // If it was a batch request and failed, we mark all codes in that batch as error
        const codes = codeStr.split(',');
        codes.forEach(c => handleFetchError(c));
        script.remove();
    };
    document.head.appendChild(script);
}
