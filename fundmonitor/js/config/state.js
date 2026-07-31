export const state = {
    currentTheme: localStorage.getItem('fund-monitor-theme') || 'light',
    currentLang: localStorage.getItem('fund-monitor-lang') || 'zh',
    fundCodes: new Set(),
    groups: ['default'], // Array of group IDs. 'default' is immutable.
    fundGroups: {}, // Code to Group ID mapping
    groupExpanded: {}, // Group ID to boolean mapping
    activeGroup: 'default', // The currently selected group tab
    currentSortColumn: 2,
    sortOrder: -1
};
