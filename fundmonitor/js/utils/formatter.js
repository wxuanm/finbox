export function formatChangeCell(value) {
    const numericValue = parseFloat(value);
    if (Number.isNaN(numericValue)) {
        return '-';
    }

    let changeClass = '';
    let changeIcon = '';
    if (numericValue > 0) {
        changeClass = 'positive';
        changeIcon = '▲';
    } else if (numericValue < 0) {
        changeClass = 'negative';
        changeIcon = '▼';
    }

    const formattedValue = `${numericValue.toFixed(2)}%`;
    return `<span class="${changeClass}">${changeIcon ? `${changeIcon} ` : ''}${formattedValue}</span>`;
}

export function formatRet(val) {
    if (!val || val === '---' || val === 'N/A') return '<span class="neutral">--</span>';
    const num = parseFloat(val.replace('%', ''));
    if (isNaN(num)) return `<span class="neutral">${val}</span>`;
    const cls = num > 0 ? 'positive' : (num < 0 ? 'negative' : 'neutral');
    const prefix = num > 0 ? '+' : '';
    return `<span class="${cls}">${prefix}${num.toFixed(2)}%</span>`;
}
