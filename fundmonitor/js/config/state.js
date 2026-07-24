export const state = {
    currentTheme: localStorage.getItem('fund-monitor-theme') || 'light',
    currentLang: localStorage.getItem('fund-monitor-lang') || 'zh',
    fundCodes: new Set(),
    currentSortColumn: -1,
    sortOrder: 1
};
