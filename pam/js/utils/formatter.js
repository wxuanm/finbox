import { state } from '../config/state.js';

export function formatCurrency(value, masked = false) {
    const num = Number(value);
    if (!Number.isFinite(num)) return '-';
    if (masked) return '****';
    return new Intl.NumberFormat(currentLocale(), {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(num);
}

export function formatNumber(value, digits = 2) {
    const num = Number(value);
    if (!Number.isFinite(num)) return '-';
    return num.toLocaleString(currentLocale(), {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits
    });
}

export function formatPercent(value, digits = 2, options = {}) {
    const num = Number(value);
    if (!Number.isFinite(num)) return '-';
    const formatted = new Intl.NumberFormat(currentLocale(), {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits
    }).format(num);
    return `${options.sign === false || num < 0 ? '' : '+'}${formatted}%`;
}

export function formatWeight(value) {
    return formatPercent(value, 2, { sign: false });
}

export function formatPrice(value, assetClass = '') {
    const num = Number(value);
    if (!Number.isFinite(num)) return '-';
    const digits = {
        fund: 4,
        stock: 3
    }[assetClass] || 2;
    return new Intl.NumberFormat(currentLocale(), {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits
    }).format(num);
}

export function formatRatio(value) {
    return formatNumber(value, 2);
}

export function formatChartAxisPercent(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return '-';
    return `${new Intl.NumberFormat(currentLocale(), {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(num)}%`;
}

export function signedClass(value) {
    const num = Number(value);
    if (!Number.isFinite(num) || num === 0) return '';
    return num > 0 ? 'positive' : 'negative';
}

export function todayKey() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

export function currentLocale() {
    return state.currentLang === 'en' ? 'en-US' : 'zh-CN';
}
