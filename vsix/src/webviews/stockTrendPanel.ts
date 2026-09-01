import * as vscode from 'vscode';
import { FinBoxStore } from '../state/finboxStore';
import { normalizeStockSymbols } from '../utils/marketSymbols';
import { escapeHtml, getNonce } from '../utils/webview';

export class StockTrendPanel {
  private readonly panelsBySymbol = new Map<string, vscode.WebviewPanel>();

  constructor(private readonly store: FinBoxStore) {}

  open(symbolInput: string): void {
    const symbol = normalizeStockSymbols([symbolInput])[0];
    if (!symbol) {
      void vscode.window.showWarningMessage('请输入带 sh/sz 前缀的六位 A 股代码。');
      return;
    }

    const existing = this.panelsBySymbol.get(symbol);
    if (existing) {
      existing.reveal(vscode.ViewColumn.Active);
      return;
    }

    const quote = this.store.getStockQuote(symbol);
    const code = symbol.slice(2);
    const title = `${quote?.name || symbol} ${code}`;
    const panel = vscode.window.createWebviewPanel(
      'finboxStockTrend',
      `实时走势(${code})`,
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: []
      }
    );

    this.panelsBySymbol.set(symbol, panel);
    panel.onDidDispose(() => this.panelsBySymbol.delete(symbol));
    panel.onDidChangeViewState(event => {
      if (event.webviewPanel.visible) {
        void event.webviewPanel.webview.postMessage({ type: 'reloadStockTrendFrame' });
      }
    });
    panel.webview.html = this.getHtml(panel.webview, title, buildEastmoneyTrendUrl(symbol));
  }

  private getHtml(webview: vscode.Webview, title: string, trendUrl: string): string {
    const nonce = getNonce();
    const safeTitle = escapeHtml(title);
    const safeUrl = escapeHtml(trendUrl);

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src https://quote.eastmoney.com; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <title>${safeTitle}</title>
  <style nonce="${nonce}">
    html,
    body {
      width: 100%;
      height: 100%;
      margin: 0;
      padding: 0;
      background: #111318;
      color: var(--vscode-editor-foreground);
      overflow: hidden;
    }

    .frame-wrap {
      position: relative;
      width: 100%;
      height: 100%;
      overflow: auto;
    }

    iframe {
      display: block;
      width: 100%;
      height: 100%;
      border: 0;
      background: #f4f5f7;
      filter: invert(100%) hue-rotate(180deg) brightness(0.92) contrast(0.95);
    }
  </style>
</head>
<body>
  <div class="frame-wrap">
    <iframe id="stockTrendFrame" title="${safeTitle}" src="${safeUrl}" sandbox="allow-scripts allow-same-origin allow-forms allow-popups"></iframe>
  </div>
  <script nonce="${nonce}">
    const frame = document.getElementById('stockTrendFrame');
    const trendUrl = ${JSON.stringify(trendUrl)};

    window.addEventListener('message', event => {
      if (event.data && event.data.type === 'reloadStockTrendFrame') {
        const separator = trendUrl.includes('?') ? '&' : '?';
        frame.src = trendUrl + separator + '_finboxVisible=' + Date.now();
      }
    });
  </script>
</body>
</html>`;
  }
}

function buildEastmoneyTrendUrl(symbol: string): string {
  const market = symbol.startsWith('sh') ? '1' : '0';
  const code = symbol.slice(2);
  return `https://quote.eastmoney.com/basic/full.html?mcid=${market}.${code}`;
}
