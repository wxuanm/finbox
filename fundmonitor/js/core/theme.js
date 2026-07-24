import { state } from '../config/state.js';
import { i18n } from '../config/i18n.js';

export function applyTheme() {
    document.documentElement.setAttribute('data-theme', state.currentTheme);
    const themeBtn = document.getElementById('themeBtn');
    if (themeBtn) {
        if (state.currentTheme === 'light') {
            themeBtn.innerHTML = '<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"></path></svg>';
        } else {
            themeBtn.innerHTML = '<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>';
        }
        themeBtn.title = state.currentTheme === 'light' ? i18n[state.currentLang].themeDark : i18n[state.currentLang].themeLight;
    }
}

export function toggleTheme() {
    state.currentTheme = state.currentTheme === 'light' ? 'dark' : 'light';
    localStorage.setItem('fund-monitor-theme', state.currentTheme);
    applyTheme();
}
