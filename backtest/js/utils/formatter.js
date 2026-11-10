export function formatPercent(value, { signed = true, digits = 2 } = {}) {
    if (value === null || value === undefined || !Number.isFinite(value)) return '--';
    const pct = value * 100;
    const text = pct.toFixed(digits);
    return signed && pct > 0 ? `+${text}%` : `${text}%`;
}

export function formatRatio(value, digits = 2) {
    if (value === null || value === undefined || !Number.isFinite(value)) return '--';
    return value.toFixed(digits);
}

export function formatMoney(value, lang = 'zh') {
    if (!Number.isFinite(value)) return '--';
    return value.toLocaleString(lang === 'en' ? 'en-US' : 'zh-CN', { maximumFractionDigits: 0 });
}

// Chinese market convention: red for gains, green for losses.
export function trendClass(value) {
    if (!Number.isFinite(value) || Math.abs(value) < 1e-12) return '';
    return value > 0 ? 'up' : 'down';
}

export function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
