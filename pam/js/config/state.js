export const state = {
    accounts: [],
    snapshots: [],
    selectedAccountId: '',
    selectedPeriod: 'ALL',
    selectedHighlightAccountId: '',
    comparisonSortKey: 'periodReturn',
    comparisonSortOrder: -1,
    editingSnapshotId: '',
    activeView: 'analysis',
    theme: 'light'
};

export const PERIODS = [
    ['1M', '1月'],
    ['3M', '3月'],
    ['6M', '6月'],
    ['YTD', '今年'],
    ['1Y', '1年'],
    ['3Y', '3年'],
    ['ALL', '全部']
];
