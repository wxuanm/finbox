import { state } from '../config/state.js';
import { savePreferences } from '../modules/accountPerformance/storage.js';

export function applyTheme(theme) {
    state.theme = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.dataset.theme = state.theme;
    updateThemeButton();
}

export function toggleTheme() {
    applyTheme(state.theme === 'dark' ? 'light' : 'dark');
    savePreferences({
        theme: state.theme,
        selectedAccountId: state.selectedAccountId,
        selectedPeriod: state.selectedPeriod,
        activeView: state.activeView,
        holdingFilters: state.holdingFilters,
        holdingSortKey: state.holdingSortKey,
        holdingSortOrder: state.holdingSortOrder
    });
}

export function updateThemeButton() {
    const btn = document.getElementById('themeBtn');
    if (!btn) return;
    btn.title = state.theme === 'dark' ? '切换到浅色模式' : '切换到暗色模式';
}
