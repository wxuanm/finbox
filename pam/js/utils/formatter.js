import { state } from '../config/state.js';

export function formatCurrency(value, masked = false) {
    const num = Number(value);
    if (!Number.isFinite(num)) return '-';
    if (masked) return '****';
    return new Intl.NumberFormat(currentLocale(), {
        style: 'currency',
        currency: 'CNY',
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

export function formatPercent(value, digits = 2) {
    const num = Number(value);
    if (!Number.isFinite(num)) return '-';
    return `${num >= 0 ? '+' : ''}${num.toFixed(digits)}%`;
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
