export const state = {
    accounts: [],
    snapshots: [],
    holdings: [],
    allocation: { excludedAccountIds: [], updatedAt: '', targets: null, band: { absolute: 5, relative: 25 } },
    allocationRebalanceMode: 'cashIn',
    selectedAccountId: '',
    selectedPeriod: '3M',
    selectedHighlightAccountId: '',
    // Accounts added to the phone returns chart from the ranking; the portfolio and benchmark are always drawn.
    chartOverlayAccountIds: [],
    comparisonSortKey: 'periodReturn',
    comparisonSortOrder: -1,
    holdingFilters: { accountId: 'all', assetClass: 'all', market: 'all' },
    holdingSortKey: 'marketValue',
    holdingSortOrder: -1,
    holdingView: 'table',
    accountTrendView: 'chart',
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
