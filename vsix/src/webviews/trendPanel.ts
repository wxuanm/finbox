import * as vscode from 'vscode';
import { FundNavService } from '../services/fundNavService';
import { FundMonitorStore } from '../state/fundMonitorStore';
import { buildNavMetrics } from '../utils/navMetrics';
import { getNonce, mediaUri } from '../utils/webview';

type TrendKind = 'fund' | 'group';

interface TrendTarget {
  key: string;
  kind: TrendKind;
  title: string;
  codes: string[];
}

export class TrendPanel {
  private readonly panels = new Map<string, vscode.WebviewPanel>();

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly store: FundMonitorStore,
    private readonly navService: FundNavService
  ) {}

  async openFund(code: string): Promise<void> {
    if (!/^\d{6}$/.test(code)) return;
    const quote = this.store.getQuote(code);
    await this.openTarget({
      key: `fund:${code}`,
      kind: 'fund',
      title: quote?.name ? `${quote.name} ${code}` : code,
      codes: [code]
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
      codes
    });
  }

  private async openTarget(target: TrendTarget): Promise<void> {
    const existing = this.panels.get(target.key);
    if (existing) {
      existing.reveal(vscode.ViewColumn.Active);
      await this.loadTrend(existing, target);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'finboxFundTrend',
      target.title,
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')]
      }
    );
    this.panels.set(target.key, panel);
    panel.webview.html = this.getHtml(panel.webview, target.title);
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

  private getHtml(webview: vscode.Webview, title: string): string {
    const nonce = getNonce();
    const cssUri = mediaUri(webview, this.extensionUri, 'trend', 'trend.css');
    const jsUri = mediaUri(webview, this.extensionUri, 'trend', 'trend.js');
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
        <h1 id="title">${title}</h1>
      </div>
      <div class="actions">
        <button id="refreshBtn" type="button">刷新</button>
      </div>
    </header>
    <div id="status" class="status">加载中...</div>
    <nav id="periodTabs" class="period-tabs" aria-label="趋势周期">
      <button type="button" data-period="ytd">今年</button>
      <button type="button" data-period="m1">1月</button>
      <button type="button" data-period="m3">3月</button>
      <button type="button" data-period="m6">6月</button>
      <button type="button" data-period="y1">1年</button>
      <button type="button" data-period="y3" class="active">3年</button>
    </nav>
    <section id="summary" class="summary-grid"></section>
    <section class="chart-panel">
      <div class="chart-toolbar">
        <div>
          <div id="chartTitle" class="chart-title">历史收益走势</div>
          <div id="chartHint" class="chart-hint">按所选周期归一化展示累计收益</div>
        </div>
      </div>
      <div id="chart" class="chart"></div>
    </section>
    <section id="metrics" class="metrics-grid"></section>
  </main>
  <script nonce="${nonce}" src="${jsUri}"></script>
</body>
</html>`;
  }
}
