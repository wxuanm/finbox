import * as vscode from 'vscode';
import { PersistedFundMonitorState } from '../types';

const STORAGE_KEY = 'finbox.fundMonitor.state';

export class StorageService {
  constructor(private readonly context: vscode.ExtensionContext) {}

  load(): PersistedFundMonitorState {
    const raw = this.context.globalState.get<unknown>(STORAGE_KEY);
    return normalizePersistedState(raw);
  }

  async save(state: PersistedFundMonitorState): Promise<void> {
    await this.context.globalState.update(STORAGE_KEY, normalizePersistedState(state));
  }
}

function normalizePersistedState(raw: unknown): PersistedFundMonitorState {
    const fallback: PersistedFundMonitorState = {
      schemaVersion: 1,
      groups: [{ id: 'default', name: '默认分组' }],
      fundGroups: {},
      stockSymbols: [],
      preferences: { themeMode: 'vscode' }
    };

  if (!raw || typeof raw !== 'object') return fallback;

  const value = raw as Partial<PersistedFundMonitorState>;
  const groups = Array.isArray(value.groups)
    ? value.groups
        .map(group => ({ id: String(group?.id || '').trim(), name: String(group?.name || '').trim() }))
        .filter(group => group.id && group.name)
    : [];

  const groupById = new Map(groups.map(group => [group.id, group]));
  groupById.set('default', { id: 'default', name: groupById.get('default')?.name || '默认分组' });

  const orderedGroups = [groupById.get('default')!];
  groups.forEach(group => {
    if (group.id !== 'default' && !orderedGroups.some(item => item.id === group.id)) {
      orderedGroups.push(group);
    }
  });

  const fundGroups: Record<string, string> = {};
  if (value.fundGroups && typeof value.fundGroups === 'object') {
    Object.entries(value.fundGroups).forEach(([code, groupId]) => {
      const normalizedCode = String(code).trim();
      const normalizedGroupId = String(groupId || '').trim();
      if (!/^\d{6}$/.test(normalizedCode)) return;
      fundGroups[normalizedCode] = groupById.has(normalizedGroupId) ? normalizedGroupId : 'default';
    });
  }

  const stockSymbols = Array.isArray(value.stockSymbols)
    ? [...new Set(value.stockSymbols
        .map(symbol => String(symbol || '').trim())
        .filter(symbol => /^\d{6}$/.test(symbol)))]
    : [];

  return {
    schemaVersion: 1,
    groups: orderedGroups,
    fundGroups,
    stockSymbols,
    preferences: {
      themeMode: value.preferences?.themeMode || 'vscode',
      refreshIntervalMinutes: value.preferences?.refreshIntervalMinutes
    }
  };
}
