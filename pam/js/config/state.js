export const state = {
    accounts: [],
    snapshots: [],
    holdings: [],
    allocation: { excludedAccountIds: [], updatedAt: '', targets: null, band: { absolute: 5, relative: 25 } },
    allocationRebalanceMode: 'cashIn',
    // 风险敞口: 'all' or an account id, plus thresholds normalized by normalizeRiskSettings.
    riskScope: 'all',
    riskSettings: { defaultStopPct: 5, principalLimit: 5, drawdownLimit: 10, riskPerTradePct: 1 },
    editingStopHoldingId: '',
    selectedAccountId: '',
    selectedPeriod: '3M',
    selectedHighlightAccountId: '',
    // Phones show the returns chart only after the user opens it; desktop always shows it.
    returnsChartOpen: false,
    // Desktop folds (above 720px): keys of folded panels, separate from the phone fold state.
    desktopFolded: [],
    // Phones can fold the 账户管理 trend and record panels under their titles; both start open.
    accountTrendOpen: true,
    assetRecordOpen: true,
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
