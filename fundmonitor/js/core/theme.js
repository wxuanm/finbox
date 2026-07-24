import { state } from '../config/state.js';
import { i18n } from '../config/i18n.js';

export function applyTheme() {
    document.documentElement.setAttribute('data-theme', state.currentTheme);
    const themeBtn = document.getElementById('themeBtn');
    if (themeBtn) {
        themeBtn.textContent = state.currentTheme === 'light' ? '🌙' : '☀️';
        themeBtn.title = state.currentTheme === 'light' ? i18n[state.currentLang].themeDark : i18n[state.currentLang].themeLight;
    }
}

export function toggleTheme() {
    state.currentTheme = state.currentTheme === 'light' ? 'dark' : 'light';
    localStorage.setItem('fund-monitor-theme', state.currentTheme);
    applyTheme();
}
