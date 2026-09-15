import * as vscode from 'vscode';
import { FundNavService } from '../services/fundNavService';
import { FinBoxStore } from '../state/finboxStore';
import { buildNavMetrics } from '../utils/navMetrics';
import { getNonce, mediaUri } from '../utils/webview';

type TrendKind = 'fund' | 'group';
type TrendViewMode = 'chart' | 'list';
type TrendPeriod = 'ytd' | 'm1' | 'm3' | 'm6' | 'y1' | 'y3';

const DEFAULT_FUND_TREND_VIEW_CONFIG = 'finbox.fund.trend.defaultView';
const DEFAULT_FUND_TREND_PERIOD_CONFIG = 'finbox.fund.trend.defaultPeriod';
const TREND_PERIODS: TrendPeriod[] = ['ytd', 'm1', 'm3', 'm6', 'y1', 'y3'];

interface TrendTarget {
  key: string;
  kind: TrendKind;
  title: string;
  tabTitle: string;
  codes: string[];
  defaultView: TrendViewMode;
  defaultPeriod: TrendPeriod;
}

export class FundTrendPanel {
  private readonly panels = new Map<string, vscode.WebviewPanel>();

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly store: FinBoxStore,
    private readonly navService: FundNavService
  ) {}

  async openFund(code: string): Promise<void> {
    if (!/^\d{6}$/.test(code)) return;
    const quote = this.store.getQuote(code);
    await this.openTarget({
      key: `fund:${code}`,
      kind: 'fund',
      title: quote?.name ? `${quote.name} ${code}` : code,
      tabTitle: `${code} 趋势`,
      codes: [code],
      defaultView: getDefaultFundTrendView(),
      defaultPeriod: getDefaultFundTrendPeriod()
    });
  }

  async openGroup(groupId: string): Promise<void> {
    const group = this.store.getGroup(groupId);
    if (!group) return;
    const codes = this.store.getCodesForGroup(groupId).slice(0, 10);
    await this.openTarget({
      key: `group:${groupId}`,
      kind: 'group',
      title: `${group.name} 趋势`,
      tabTitle: `${group.name} 趋势`,
      codes,
      defaultView: 'chart',
      defaultPeriod: getDefaultFundTrendPeriod()
    });
  }

  private async openTarget(target: TrendTarget): Promise<void> {
    const existing = this.panels.get(target.key);
    if (existing) {
      existing.reveal(vscode.ViewColumn.Active);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'finboxFundTrend',
      target.tabTitle,
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')]
      }
    );
    this.panels.set(target.key, panel);
    panel.webview.html = this.getHtml(panel.webview, target.title, target.defaultView, target.defaultPeriod);
    panel.onDidDispose(() => this.panels.delete(target.key));
    panel.webview.onDidReceiveMessage(async message => {
      if (message?.type === 'refreshTrend') await this.loadTrend(panel, target);
    });
    await this.loadTrend(panel, target);
  }

  private async loadTrend(panel: vscode.WebviewPanel, target: TrendTarget): Promise<void> {
    panel.webview.postMessage({ type: 'trendLoading', title: target.title, codes: target.codes });
    if (target.codes.length === 0) {
      panel.webview.postMessage({ type: 'trendError', message: '此分组没有可展示的基金。' });
      return;
    }

    try {
      const nav = await this.navService.fetchThreeYearFundNav(target.codes);
      panel.webview.postMessage({
        type: 'trendData',
        payload: {
          target,
          nav,
          metrics: buildNavMetrics(nav.funds)
        }
      });
    } catch (error) {
      panel.webview.postMessage({
        type: 'trendError',
        message: error instanceof Error ? error.message : '历史趋势加载失败'
      });
    }
  }

  private getHtml(webview: vscode.Webview, title: string, defaultView: TrendViewMode, defaultPeriod: TrendPeriod): string {
    const nonce = getNonce();
    const cssUri = mediaUri(webview, this.extensionUri, 'fundTrend', 'fundTrend.css');
    const echartsUri = mediaUri(webview, this.extensionUri, 'vendor', 'echarts.min.js');
    const jsUri = mediaUri(webview, this.extensionUri, 'fundTrend', 'fundTrend.js');
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
  <link rel="stylesheet" href="${cssUri}">
  <title>${title}</title>
</head>
<body>
  <main class="trend-shell">
    <header class="trend-header">
      <div class="title-block">
        <div class="eyebrow">FINBOX FUND TREND</div>
        <div class="title-row">
          <h1 id="title">${title}</h1>
          <span id="status" class="status">加载中...</span>
        </div>
      </div>
    </header>
    <nav id="periodTabs" class="period-tabs" aria-label="趋势周期">
      <button type="button" data-period="ytd"${defaultPeriod === 'ytd' ? ' class="active"' : ''}>今年</button>
      <button type="button" data-period="m1"${defaultPeriod === 'm1' ? ' class="active"' : ''}>1月</button>
      <button type="button" data-period="m3"${defaultPeriod === 'm3' ? ' class="active"' : ''}>3月</button>
      <button type="button" data-period="m6"${defaultPeriod === 'm6' ? ' class="active"' : ''}>6月</button>
      <button type="button" data-period="y1"${defaultPeriod === 'y1' ? ' class="active"' : ''}>1年</button>
      <button type="button" data-period="y3"${defaultPeriod === 'y3' ? ' class="active"' : ''}>3年</button>
    </nav>
    <section id="summary" class="summary-grid"></section>
    <section class="chart-panel">
      <div class="chart-toolbar">
        <div>
          <div id="chartTitle" class="chart-title">历史收益走势</div>
        </div>
        <div id="viewTabs" class="view-tabs" role="radiogroup" aria-label="显示方式" hidden>
          <label><input type="radio" name="trendView" value="chart"${defaultView === 'chart' ? ' checked' : ''}><span>曲线</span></label>
          <label><input type="radio" name="trendView" value="list"${defaultView === 'list' ? ' checked' : ''}><span>列表</span></label>
        </div>
      </div>
      <div id="chart" class="chart"></div>
      <div id="navList" class="nav-list" hidden></div>
    </section>
    <section id="metrics" class="metrics-grid"></section>
  </main>
  <script nonce="${nonce}" src="${echartsUri}"></script>
  <script nonce="${nonce}" src="${jsUri}"></script>
</body>
</html>`;
  }
}

function getDefaultFundTrendView(): TrendViewMode {
  return vscode.workspace.getConfiguration().get<TrendViewMode>(DEFAULT_FUND_TREND_VIEW_CONFIG, 'list') === 'chart' ? 'chart' : 'list';
}

function getDefaultFundTrendPeriod(): TrendPeriod {
  const value = vscode.workspace.getConfiguration().get<TrendPeriod>(DEFAULT_FUND_TREND_PERIOD_CONFIG, 'm3');
  return TREND_PERIODS.includes(value) ? value : 'm3';
}
