// Scheduled "previous trading day" account snapshots, triggered by the pam-auto-snapshot Cron Worker.
// Rules (docs/specs/pam/technical-design.md):
// - D is the latest NAV date of the built-in reference funds; no weekend-only guessing.
// - Only holdings-valued accounts: at least one CN/Fund holding with a symbol, and the latest snapshot
//   is 'holdings' or 'auto' (or there is none yet).
// - Append only: skip any account with a snapshot on or after D, and accounts created after D.
// - Never update an existing snapshot. netFlow is 0; the user edits it afterwards when needed.
// - Writes bump the owner revision so stale browsers cannot full-replace the new rows away.
import { fetchQuotes } from '../_lib/quoteSources.js';
import {
  SNAPSHOT_DATE_REFERENCE_FUNDS,
  getAccountHoldingMarketValue,
  isQuotableHolding,
  quoteKey,
  resolveReferenceNavDate,
  resolveSnapshotPrice
} from '../../../pam/js/modules/holdings/snapshotValuation.js';

const PREVIOUS_TRADING_DAY = '1';
const PHASES = new Set(['early', 'final']);
const MAX_REFERENCE_AGE_DAYS = 10;
const CHINA_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const VALUATION_SOURCES = new Set(['holdings', 'auto']);

export async function runAutoSnapshot(db, { phase }) {
  const startedAt = Date.now();
  const summary = {
    phase,
    date: '',
    users: 0,
    accounts: 0,
    inserted: 0,
    deferred: 0,
    stalePrices: 0,
    fallbackPrices: 0,
    conflicts: 0,
    skipped: { notHoldingsValued: 0, hasSnapshotOnOrAfterDate: 0, createdAfterDate: 0, noMarketValue: 0 },
    reason: ''
  };
  const finish = reason => ({ ...summary, reason, durationMs: Date.now() - startedAt });

  if (!PHASES.has(phase)) throw new Error('Invalid phase');

  const today = chinaDateKey(Date.now());
  const referenceQuotes = await fetchQuotes(SNAPSHOT_DATE_REFERENCE_FUNDS.map(({ market, symbol }) => ({ market, symbol })));
  const date = resolveReferenceNavDate(toQuoteMap(referenceQuotes.quotes));
  if (!date) return finish('reference-date-unavailable');
  if (!(date < today && date >= addDays(today, -MAX_REFERENCE_AGE_DAYS))) {
    summary.date = date;
    return finish('reference-date-out-of-range');
  }
  summary.date = date;

  const { candidates, holdingsByOwner } = await loadCandidates(db, date, summary);
  if (candidates.length === 0) return finish('no-pending-accounts');

  const items = uniqueQuoteItems(candidates.flatMap(candidate => holdingsByOwner.get(candidate.ownerId)
    .filter(holding => holding.accountId === candidate.accountId && isQuotableHolding(holding))));
  const { quotes } = await fetchQuotes(items);
  const quoteByKey = toQuoteMap(quotes);

  const rowsByOwner = new Map();
  for (const candidate of candidates) {
    const holdings = holdingsByOwner.get(candidate.ownerId).filter(holding => holding.accountId === candidate.accountId);
    const valuation = valueAccount(holdings, quoteByKey, date);
    summary.stalePrices += valuation.staleCount;
    summary.fallbackPrices += valuation.fallbackCount;

    if (!valuation.totalValue) {
      summary.skipped.noMarketValue += 1;
      continue;
    }
    if (phase === 'early' && (valuation.staleCount > 0 || valuation.fallbackCount > 0)) {
      summary.deferred += 1;
      continue;
    }

    const rows = rowsByOwner.get(candidate.ownerId) || { revision: candidate.revision, snapshots: [] };
    rows.snapshots.push({
      id: `snapshot-${crypto.randomUUID()}`,
      accountId: candidate.accountId,
      date,
      totalValue: valuation.totalValue
    });
    rowsByOwner.set(candidate.ownerId, rows);
  }

  summary.users = rowsByOwner.size;
  summary.accounts = [...rowsByOwner.values()].reduce((sum, rows) => sum + rows.snapshots.length, 0);
  if (rowsByOwner.size === 0) return finish(summary.deferred > 0 ? 'deferred-to-final' : 'no-valued-accounts');

  const { inserted, conflicts } = await writeSnapshots(db, rowsByOwner);
  summary.inserted = inserted;
  summary.conflicts = conflicts;
  return finish('ok');
}

// One batch is one transaction: revisions, accounts, and snapshot markers come from the same read,
// so the revision claim later proves nothing changed since this valuation.
async function loadCandidates(db, date, summary) {
  const dateEndUtc = new Date(Date.parse(`${date}T00:00:00Z`) + DAY_MS - CHINA_OFFSET_MS).toISOString();
  const activeOwners = `SELECT 'user:' || id FROM pam_users WHERE status = 'active'`;
  const [accountsResult, holdingsResult] = await db.batch([
    db.prepare(`SELECT a.owner_id, a.id AS account_id, a.created_at, s.revision,
        latest.source AS latest_source,
        EXISTS (SELECT 1 FROM pam_snapshots later
          WHERE later.owner_id = a.owner_id AND later.account_id = a.id AND later.snapshot_date >= ?) AS has_later
      FROM pam_accounts a
      JOIN pam_user_state s ON s.owner_id = a.owner_id
      LEFT JOIN (
        SELECT owner_id, account_id, source,
          ROW_NUMBER() OVER (PARTITION BY owner_id, account_id ORDER BY snapshot_date DESC, id DESC) AS rn
        FROM pam_snapshots
      ) latest ON latest.owner_id = a.owner_id AND latest.account_id = a.id AND latest.rn = 1
      WHERE a.owner_id IN (${activeOwners})`).bind(date),
    db.prepare(`SELECT owner_id, id, account_id, symbol, market, quantity, current_price
      FROM pam_holdings WHERE owner_id IN (${activeOwners})`)
  ]);

  const holdingsByOwner = new Map();
  (holdingsResult.results || []).forEach(row => {
    const list = holdingsByOwner.get(row.owner_id) || [];
    list.push({
      id: row.id,
      accountId: row.account_id,
      symbol: row.symbol,
      market: row.market,
      quantity: row.quantity,
      currentPrice: row.current_price
    });
    holdingsByOwner.set(row.owner_id, list);
  });

  const candidates = [];
  (accountsResult.results || []).forEach(row => {
    const holdings = (holdingsByOwner.get(row.owner_id) || []).filter(holding => holding.accountId === row.account_id);
    const holdingsValued = holdings.some(isQuotableHolding)
      && (row.latest_source === null || VALUATION_SOURCES.has(row.latest_source));
    if (!holdingsValued) {
      summary.skipped.notHoldingsValued += 1;
      return;
    }
    if (Number(row.has_later)) {
      summary.skipped.hasSnapshotOnOrAfterDate += 1;
      return;
    }
    if (String(row.created_at || '') >= dateEndUtc) {
      summary.skipped.createdAfterDate += 1;
      return;
    }
    candidates.push({ ownerId: row.owner_id, accountId: row.account_id, revision: Number(row.revision || 0) });
  });

  return { candidates, holdingsByOwner };
}

function valueAccount(holdings, quoteByKey, date) {
  const priceByHoldingId = new Map();
  let staleCount = 0;
  let fallbackCount = 0;
  holdings.forEach(holding => {
    const quote = isQuotableHolding(holding) ? quoteByKey.get(quoteKey(holding)) : undefined;
    const valuation = resolveSnapshotPrice(holding, quote, PREVIOUS_TRADING_DAY, date);
    if (valuation.price === null) return;
    priceByHoldingId.set(holding.id, valuation.price);
    // Cash and manual-only markets are always manually priced; only quote misses count as fallback.
    if (valuation.isFallback && isQuotableHolding(holding)) fallbackCount += 1;
    if (valuation.isStale) staleCount += 1;
  });
  const value = Number(getAccountHoldingMarketValue(holdings, holdings[0]?.accountId, priceByHoldingId).toFixed(2));
  return { totalValue: Number.isFinite(value) && value > 0 ? value : 0, staleCount, fallbackCount };
}

async function writeSnapshots(db, rowsByOwner) {
  const now = new Date().toISOString();
  const ownsWrite = 'EXISTS (SELECT 1 FROM pam_user_state WHERE owner_id = ? AND write_token = ?)';
  const statements = [];
  const owners = [];

  rowsByOwner.forEach((rows, ownerId) => {
    const writeToken = crypto.randomUUID();
    owners.push({ ownerId, writeToken });
    statements.push(db.prepare(`UPDATE pam_user_state SET revision = revision + 1, write_token = ?, updated_at = ?
      WHERE owner_id = ? AND revision = ?`).bind(writeToken, now, ownerId, rows.revision));
    statements.push(db.prepare(`INSERT INTO pam_snapshots
      (owner_id, id, account_id, snapshot_date, total_value, net_flow, note, source)
      SELECT ?, json_extract(value, '$.id'), json_extract(value, '$.accountId'),
        json_extract(value, '$.date'), json_extract(value, '$.totalValue'), 0, '', 'auto'
      FROM json_each(?) WHERE ${ownsWrite}
      ON CONFLICT DO NOTHING`).bind(ownerId, JSON.stringify(rows.snapshots), ownerId, writeToken));
  });

  const results = await db.batch(statements);
  let inserted = 0;
  let conflicts = 0;
  owners.forEach((owner, index) => {
    const claimed = Number(results[index * 2]?.meta?.changes || 0) === 1;
    if (!claimed) {
      conflicts += 1;
      return;
    }
    inserted += Number(results[index * 2 + 1]?.meta?.changes || 0);
  });
  return { inserted, conflicts };
}

function uniqueQuoteItems(holdings) {
  const byKey = new Map();
  holdings.forEach(holding => byKey.set(quoteKey(holding), { market: holding.market, symbol: holding.symbol }));
  return [...byKey.values()];
}

function toQuoteMap(quotes = []) {
  return new Map(quotes.map(quote => [quoteKey(quote), quote]));
}

function chinaDateKey(timestamp) {
  return new Date(timestamp + CHINA_OFFSET_MS).toISOString().slice(0, 10);
}

function addDays(dateKey, days) {
  return new Date(Date.parse(`${dateKey}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}
