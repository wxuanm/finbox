export const state = {
    accounts: [],
    snapshots: [],
    holdings: [],
    selectedAccountId: '',
    selectedPeriod: '3M',
    selectedHighlightAccountId: '',
    comparisonSortKey: 'periodReturn',
    comparisonSortOrder: -1,
    holdingFilters: { accountId: 'all', assetClass: 'all', market: 'all' },
    holdingSortKey: 'marketValue',
    holdingSortOrder: -1,
    editingHoldingId: '',
    editingSnapshotId: '',
    activeView: 'analysis',
    assetDataAction: 'snapshot',
    assetDataMaintenanceOpen: false,
    amountsHidden: false,
    theme: 'light',
    currentLang: 'zh'
};

export const PERIODS = [
    ['1M', 'period1M'],
    ['3M', 'period3M'],
    ['6M', 'period6M'],
    ['YTD', 'periodYTD'],
    ['1Y', 'period1Y'],
    ['3Y', 'period3Y'],
    ['ALL', 'periodALL']
];
