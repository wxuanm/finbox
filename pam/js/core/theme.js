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
        assetDataAction: state.assetDataAction,
        assetDataMaintenanceOpen: state.assetDataMaintenanceOpen,
        holdingFilters: state.holdingFilters,
        holdingSortKey: state.holdingSortKey,
        holdingSortOrder: state.holdingSortOrder
    });
}

export function updateThemeButton() {
    const btn = document.getElementById('themeBtn');
    const mobileBtn = document.getElementById('mobileThemeBtn');
    const mobileThemeText = document.getElementById('mobileThemeText');
    const isDark = state.theme === 'dark';
    const title = isDark ? '切换到浅色模式' : '切换到暗色模式';
    const icon = isDark
        ? '<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>'
        : '<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"></path></svg>';
    const mobileIcon = icon.replaceAll('width="18" height="18"', 'width="16" height="16"').replace('<svg ', '<svg aria-hidden="true" ');

    if (btn) {
        btn.innerHTML = icon;
        btn.title = title;
        btn.setAttribute('aria-label', title);
    }

    if (mobileBtn) {
        mobileBtn.title = title;
        mobileBtn.setAttribute('aria-label', title);
    }

    if (mobileThemeText) {
        mobileThemeText.textContent = title;
    }

    const mobileSvg = mobileBtn?.querySelector('svg');
    if (mobileSvg) {
        mobileSvg.outerHTML = mobileIcon;
    }
}
