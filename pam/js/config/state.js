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
