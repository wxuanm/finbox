import * as vscode from 'vscode';
import { FundGroup, FundQuote, PersistedFundMonitorState, SidebarState, StockQuote, StockSidebarState } from '../types';
import { normalizeFundCodes } from '../utils/fundCodes';
import { StorageService } from '../services/storageService';

export class FundMonitorStore {
  private persisted: PersistedFundMonitorState;
  private quotes = new Map<string, FundQuote>();
  private stockQuotes = new Map<string, StockQuote>();
  private failedCodes = new Set<string>();
  private failedStockSymbols = new Set<string>();
  private updatedAt = '';
  private stockUpdatedAt = '';
  private readonly onDidChangeEmitter = new vscode.EventEmitter<void>();

  readonly onDidChange = this.onDidChangeEmitter.event;

  constructor(private readonly storage: StorageService) {
    this.persisted = this.storage.load();
  }

  snapshot(): SidebarState {
    return {
      groups: this.persisted.groups,
      fundGroups: this.persisted.fundGroups,
      quotes: Object.fromEntries(this.quotes),
      failedCodes: [...this.failedCodes],
      updatedAt: this.updatedAt
    };
  }

  stockSnapshot(): StockSidebarState {
    return {
      stockSymbols: this.persisted.stockSymbols,
      quotes: Object.fromEntries(this.stockQuotes),
      failedSymbols: [...this.failedStockSymbols],
      updatedAt: this.stockUpdatedAt
    };
  }

  getCodes(): string[] {
    return Object.keys(this.persisted.fundGroups).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  }

  getGroup(groupId: string): FundGroup | undefined {
    return this.persisted.groups.find(group => group.id === groupId);
  }

  getCodesForGroup(groupId: string): string[] {
    return this.getCodes().filter(code => (this.persisted.fundGroups[code] || 'default') === groupId);
  }

  getQuote(code: string): FundQuote | undefined {
    return this.quotes.get(code);
  }

  getStockSymbols(): string[] {
    return [...this.persisted.stockSymbols];
  }

  getStockQuote(symbol: string): StockQuote | undefined {
    return this.stockQuotes.get(symbol);
  }

  async addFunds(codesInput: string, groupId = 'default'): Promise<string[]> {
    const codes = normalizeFundCodes(codesInput);
    const targetGroupId = this.persisted.groups.some(group => group.id === groupId) ? groupId : 'default';
    let changed = false;

    codes.forEach(code => {
      if (this.persisted.fundGroups[code] !== targetGroupId) {
        this.persisted.fundGroups[code] = targetGroupId;
        changed = true;
      }
    });

    if (changed) await this.persist();
    return codes;
  }

  async removeFund(code: string): Promise<void> {
    if (!this.persisted.fundGroups[code]) return;
    delete this.persisted.fundGroups[code];
    this.quotes.delete(code);
    this.failedCodes.delete(code);
    await this.persist();
  }

  async createGroup(name: string): Promise<string | undefined> {
    const cleaned = name.trim();
    if (!cleaned || cleaned === 'default') return undefined;
    if (this.persisted.groups.some(group => group.name === cleaned || group.id === cleaned)) return undefined;

    const id = buildGroupId(cleaned, this.persisted.groups.map(group => group.id));
    this.persisted.groups.push({ id, name: cleaned });
    await this.persist();
    return id;
  }

  async renameGroup(groupId: string, name: string): Promise<void> {
    if (groupId === 'default') return;
    const cleaned = name.trim();
    if (!cleaned) return;
    if (this.persisted.groups.some(group => group.id !== groupId && group.name === cleaned)) return;

    const group = this.getGroup(groupId);
    if (!group || group.name === cleaned) return;
    group.name = cleaned;
    await this.persist();
  }

  async deleteGroup(groupId: string): Promise<void> {
    if (groupId === 'default') return;
    if (!this.getGroup(groupId)) return;

    Object.entries(this.persisted.fundGroups).forEach(([code, currentGroupId]) => {
      if (currentGroupId === groupId) this.persisted.fundGroups[code] = 'default';
    });
    this.persisted.groups = this.persisted.groups.filter(group => group.id !== groupId);
    await this.persist();
  }

  async moveFund(code: string, groupId: string): Promise<void> {
    if (!this.persisted.fundGroups[code]) return;
    if (!this.getGroup(groupId)) return;
    this.persisted.fundGroups[code] = groupId;
    await this.persist();
  }

  async addStocks(symbolsInput: string): Promise<string[]> {
    const symbols = normalizeFundCodes(symbolsInput);
    let changed = false;

    symbols.forEach(symbol => {
      if (!this.persisted.stockSymbols.includes(symbol)) {
        this.persisted.stockSymbols.push(symbol);
        changed = true;
      }
    });

    if (changed) await this.persist();
    return symbols;
  }

  async removeStock(symbol: string): Promise<void> {
    if (!this.persisted.stockSymbols.includes(symbol)) return;
    this.persisted.stockSymbols = this.persisted.stockSymbols.filter(item => item !== symbol);
    this.stockQuotes.delete(symbol);
    this.failedStockSymbols.delete(symbol);
    await this.persist();
  }

  async moveStock(symbol: string, direction: 'up' | 'down'): Promise<void> {
    const currentIndex = this.persisted.stockSymbols.indexOf(symbol);
    if (currentIndex === -1) return;

    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= this.persisted.stockSymbols.length) return;

    const [item] = this.persisted.stockSymbols.splice(currentIndex, 1);
    this.persisted.stockSymbols.splice(targetIndex, 0, item);
    await this.persist();
  }

  setQuotes(quotes: FundQuote[], failedCodes: string[], updatedAt: string): void {
    quotes.forEach(quote => {
      this.quotes.set(quote.code, quote);
      this.failedCodes.delete(quote.code);
    });
    failedCodes.forEach(code => this.failedCodes.add(code));
    this.updatedAt = updatedAt;
    this.onDidChangeEmitter.fire();
  }

  setStockQuotes(quotes: StockQuote[], failedSymbols: string[], updatedAt: string): void {
    quotes.forEach(quote => {
      this.stockQuotes.set(quote.symbol, quote);
      this.failedStockSymbols.delete(quote.symbol);
    });
    failedSymbols.forEach(symbol => this.failedStockSymbols.add(symbol));
    this.stockUpdatedAt = updatedAt;
    this.onDidChangeEmitter.fire();
  }

  dispose(): void {
    this.onDidChangeEmitter.dispose();
  }

  private async persist(): Promise<void> {
    await this.storage.save(this.persisted);
    this.onDidChangeEmitter.fire();
  }
}

function buildGroupId(name: string, existingIds: string[]): string {
  const base = name.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, '-').replace(/^-+|-+$/g, '') || 'group';
  const existing = new Set(existingIds);
  let id = base;
  let index = 2;
  while (existing.has(id)) {
    id = `${base}-${index}`;
    index += 1;
  }
  return id;
}
