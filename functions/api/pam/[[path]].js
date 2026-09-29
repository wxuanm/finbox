const MAX_BODY_BYTES = 1_000_000;
const MAX_AUTH_BODY_BYTES = 4_096;
const SESSION_COOKIE = 'pam_session';
const SESSION_SECONDS = 7 * 24 * 60 * 60;
const MAX_COUNTS = Object.freeze({ accounts: 200, snapshots: 20_000, holdings: 10_000 });
const ALLOWED_DOMAINS = new Set(['accounts', 'snapshots', 'holdings', 'preferences']);
const encoder = new TextEncoder();
const loginFailures = new Map();

export async function onRequest(context) {
  const { request, env, params } = context;
  const path = normalizePath(params.path);

  if (!env.PAM_DB) return jsonResponse({ error: 'PAM database binding is not configured' }, 503);

  if (path === 'auth/login' && request.method === 'POST') return login(request, env);
  if (path === 'auth/logout' && request.method === 'POST') return logout(request, env.PAM_DB);
  if (path === 'auth/session' && request.method === 'GET') return getSession(request, env.PAM_DB);
  if (path !== 'data') return jsonResponse({ error: 'Not found' }, 404);

  let identity;
  try {
    identity = await authenticateSession(request, env.PAM_DB);
  } catch (error) {
    return jsonResponse({ error: error.message || 'Unauthorized' }, error.status || 401);
  }

  if (request.method === 'GET') return loadData(env.PAM_DB, identity);
  if (request.method === 'PATCH') {
    if (!hasSameOrigin(request)) return jsonResponse({ error: 'Cross-origin writes are not allowed' }, 403);
    return saveData(request, env.PAM_DB, identity);
  }
  return jsonResponse({ error: 'Method not allowed' }, 405, { Allow: 'GET, PATCH' });
}

async function loadData(db, identity) {
  const [stateResult, accountsResult, snapshotsResult, holdingsResult, preferencesResult] = await db.batch([
    db.prepare('SELECT revision, updated_at FROM pam_user_state WHERE owner_id = ?').bind(identity.ownerId),
    db.prepare(`SELECT id, name, currency, created_at, updated_at
      FROM pam_accounts WHERE owner_id = ? ORDER BY position, created_at, id`).bind(identity.ownerId),
    db.prepare(`SELECT id, account_id, snapshot_date, total_value, net_flow, note, source
      FROM pam_snapshots WHERE owner_id = ? ORDER BY snapshot_date, id`).bind(identity.ownerId),
    db.prepare(`SELECT id, account_id, symbol, name, asset_class, market, quantity, cost_price,
      current_price, currency, price_source, price_updated_at, as_of_date, note
      FROM pam_holdings WHERE owner_id = ? ORDER BY id`).bind(identity.ownerId),
    db.prepare('SELECT data FROM pam_preferences WHERE owner_id = ?').bind(identity.ownerId)
  ]);

  const state = stateResult.results?.[0];
  return jsonResponse({
    revision: Number(state?.revision || 0),
    updatedAt: state?.updated_at || '',
    user: publicUser(identity),
    data: {
      accounts: (accountsResult.results || []).map(row => ({
        id: row.id,
        name: row.name,
        currency: row.currency,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      })),
      snapshots: (snapshotsResult.results || []).map(row => ({
        id: row.id,
        accountId: row.account_id,
        date: row.snapshot_date,
        totalValue: row.total_value,
        netFlow: row.net_flow,
        note: row.note,
        ...(row.source && row.source !== 'manual' ? { source: row.source } : {})
      })),
      holdings: (holdingsResult.results || []).map(row => ({
        id: row.id,
        accountId: row.account_id,
        symbol: row.symbol,
        name: row.name,
        assetClass: row.asset_class,
        market: row.market,
        quantity: row.quantity,
        costPrice: row.cost_price,
        currentPrice: row.current_price,
        currency: row.currency,
        priceSource: row.price_source,
        priceUpdatedAt: row.price_updated_at,
        asOfDate: row.as_of_date,
        note: row.note
      })),
      preferences: parseJsonObject(preferencesResult.results?.[0]?.data)
    }
  }, 200, noStoreHeaders());
}

async function saveData(request, db, identity) {
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > MAX_BODY_BYTES) return jsonResponse({ error: 'Request body is too large' }, 413);

  let payload;
  try {
    const raw = await request.text();
    if (encoder.encode(raw).byteLength > MAX_BODY_BYTES) return jsonResponse({ error: 'Request body is too large' }, 413);
    payload = JSON.parse(raw);
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const parsed = parseSyncPayload(payload);
  if (parsed.error) return jsonResponse({ error: parsed.error }, 400);

  const now = new Date().toISOString();
  const writeToken = crypto.randomUUID();
  await db.prepare(`INSERT OR IGNORE INTO pam_user_state
    (owner_id, email, revision, write_token, updated_at) VALUES (?, ?, 0, '', ?)`)
    .bind(identity.ownerId, identity.email, now).run();

  const statements = [
    db.prepare(`UPDATE pam_user_state SET revision = revision + 1, write_token = ?, email = ?, updated_at = ?
      WHERE owner_id = ? AND revision = ?`)
      .bind(writeToken, identity.email, now, identity.ownerId, parsed.baseRevision)
  ];

  parsed.domains.forEach(domain => appendDomainStatements(statements, db, domain, parsed.data[domain], {
    ownerId: identity.ownerId,
    writeToken,
    now
  }));

  const results = await db.batch(statements);
  const claimed = Number(results[0]?.meta?.changes || 0) === 1;
  if (!claimed) {
    const current = await db.prepare('SELECT revision FROM pam_user_state WHERE owner_id = ?')
      .bind(identity.ownerId).first();
    return jsonResponse({
      error: 'Cloud data changed on another device',
      code: 'revision_conflict',
      currentRevision: Number(current?.revision || 0)
    }, 409, noStoreHeaders());
  }

  return jsonResponse({ revision: parsed.baseRevision + 1, updatedAt: now }, 200, noStoreHeaders());
}

function appendDomainStatements(statements, db, domain, value, context) {
  const { ownerId, writeToken, now } = context;
  const ownsWrite = `EXISTS (SELECT 1 FROM pam_user_state
    WHERE owner_id = ? AND write_token = ?)`;

  if (domain === 'accounts') {
    statements.push(db.prepare(`DELETE FROM pam_accounts WHERE owner_id = ? AND ${ownsWrite}`)
      .bind(ownerId, ownerId, writeToken));
    statements.push(db.prepare(`INSERT INTO pam_accounts
      (owner_id, id, name, currency, created_at, updated_at, position)
      SELECT ?, json_extract(value, '$.id'), json_extract(value, '$.name'),
        json_extract(value, '$.currency'), json_extract(value, '$.createdAt'),
        json_extract(value, '$.updatedAt'), CAST(key AS INTEGER)
      FROM json_each(?) WHERE ${ownsWrite}`)
      .bind(ownerId, JSON.stringify(value), ownerId, writeToken));
    return;
  }

  if (domain === 'snapshots') {
    statements.push(db.prepare(`DELETE FROM pam_snapshots WHERE owner_id = ? AND ${ownsWrite}`)
      .bind(ownerId, ownerId, writeToken));
    statements.push(db.prepare(`INSERT INTO pam_snapshots
      (owner_id, id, account_id, snapshot_date, total_value, net_flow, note, source)
      SELECT ?, json_extract(value, '$.id'), json_extract(value, '$.accountId'),
        json_extract(value, '$.date'), json_extract(value, '$.totalValue'),
        json_extract(value, '$.netFlow'), json_extract(value, '$.note'),
        COALESCE(json_extract(value, '$.source'), 'manual')
      FROM json_each(?) WHERE ${ownsWrite}`)
      .bind(ownerId, JSON.stringify(value), ownerId, writeToken));
    return;
  }

  if (domain === 'holdings') {
    statements.push(db.prepare(`DELETE FROM pam_holdings WHERE owner_id = ? AND ${ownsWrite}`)
      .bind(ownerId, ownerId, writeToken));
    statements.push(db.prepare(`INSERT INTO pam_holdings
      (owner_id, id, account_id, symbol, name, asset_class, market, quantity, cost_price,
       current_price, currency, price_source, price_updated_at, as_of_date, note)
      SELECT ?, json_extract(value, '$.id'), json_extract(value, '$.accountId'),
        json_extract(value, '$.symbol'), json_extract(value, '$.name'),
        json_extract(value, '$.assetClass'), json_extract(value, '$.market'),
        json_extract(value, '$.quantity'), json_extract(value, '$.costPrice'),
        json_extract(value, '$.currentPrice'), json_extract(value, '$.currency'),
        json_extract(value, '$.priceSource'), json_extract(value, '$.priceUpdatedAt'),
        json_extract(value, '$.asOfDate'), json_extract(value, '$.note')
      FROM json_each(?) WHERE ${ownsWrite}`)
      .bind(ownerId, JSON.stringify(value), ownerId, writeToken));
    return;
  }

  statements.push(db.prepare(`INSERT INTO pam_preferences (owner_id, data, updated_at)
    SELECT ?, ?, ? WHERE ${ownsWrite}
    ON CONFLICT(owner_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`)
    .bind(ownerId, JSON.stringify(value), now, ownerId, writeToken));
}

function parseSyncPayload(payload) {
  if (!payload || typeof payload !== 'object') return { error: 'Request body must be an object' };
  const baseRevision = Number(payload.baseRevision);
  if (!Number.isInteger(baseRevision) || baseRevision < 0) return { error: 'Invalid base revision' };
  const domains = Array.isArray(payload.domains) ? [...new Set(payload.domains)] : [];
  if (domains.length === 0 || domains.some(domain => !ALLOWED_DOMAINS.has(domain))) {
    return { error: 'Invalid sync domains' };
  }
  const data = payload.data && typeof payload.data === 'object' ? payload.data : {};
  for (const domain of domains) {
    const error = validateDomain(domain, data[domain]);
    if (error) return { error };
  }
  return { baseRevision, domains, data };
}

function validateDomain(domain, value) {
  if (domain === 'preferences') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return 'Invalid preferences';
    return '';
  }
  if (!Array.isArray(value)) return `Invalid ${domain}`;
  if (value.length > MAX_COUNTS[domain]) return `Too many ${domain}`;
  const validators = { accounts: isAccount, snapshots: isSnapshot, holdings: isHolding };
  if (!value.every(validators[domain])) return `Invalid ${domain} record`;
  if (new Set(value.map(item => item.id)).size !== value.length) return `Duplicate ${domain} id`;
  if (domain === 'snapshots') {
    const dateKeys = value.map(item => `${item.accountId}\u0000${item.date}`);
    if (new Set(dateKeys).size !== dateKeys.length) return 'Duplicate account snapshot date';
  }
  return '';
}

function isAccount(item) {
  return isObject(item)
    && isShortString(item.id, 120)
    && isShortString(item.name, 120)
    && item.currency === 'CNY'
    && isIsoDateTime(item.createdAt)
    && isIsoDateTime(item.updatedAt);
}

function isSnapshot(item) {
  return isObject(item)
    && isShortString(item.id, 120)
    && isShortString(item.accountId, 120)
    && /^\d{4}-\d{2}-\d{2}$/.test(String(item.date || ''))
    && isFiniteNumber(item.totalValue, 0)
    && isFiniteNumber(item.netFlow)
    && isBoundedString(item.note, 500)
    && (item.source === undefined || ['manual', 'holdings'].includes(item.source));
}

function isHolding(item) {
  return isObject(item)
    && isShortString(item.id, 120)
    && isShortString(item.accountId, 120)
    && isShortString(item.name, 200)
    && isBoundedString(item.symbol, 40)
    && ['stock', 'fund', 'bond', 'cash', 'other'].includes(item.assetClass)
    && ['CN', 'Fund', 'Cash', 'Other'].includes(item.market)
    && [item.quantity, item.costPrice, item.currentPrice].every(value => isFiniteNumber(value, 0))
    && item.currency === 'CNY'
    && ['manual', 'quote'].includes(item.priceSource)
    && isBoundedString(item.priceUpdatedAt, 60)
    && isBoundedString(item.asOfDate, 20)
    && isBoundedString(item.note, 500);
}

async function login(request, env) {
  if (!hasSameOrigin(request)) return jsonResponse({ error: 'Cross-origin login is not allowed' }, 403);
  const rateKey = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (isLoginLimited(rateKey)) return jsonResponse({ error: 'Too many login attempts' }, 429, { 'Retry-After': '300' });

  let body;
  try {
    body = await readSmallJson(request);
  } catch (error) {
    return jsonResponse({ error: error.message }, error.status || 400);
  }
  const accessKey = String(body.accessKey || '').trim();
  const parsed = parseAccessKey(accessKey);
  const pepper = String(env.PAM_KEY_PEPPER || '');
  if (!parsed || pepper.length < 32) {
    recordLoginFailure(rateKey);
    return jsonResponse({ error: 'Invalid access key' }, 401, noStoreHeaders());
  }

  const credential = await env.PAM_DB.prepare(`SELECT c.user_id, c.secret_hash, c.expires_at,
      u.username, u.display_name, u.role, u.status, u.auth_version
    FROM pam_credentials c JOIN pam_users u ON u.id = c.user_id
    WHERE c.key_id = ? AND c.revoked_at = ''`).bind(parsed.keyId).first();
  const validHash = credential
    ? await verifyCredentialHash(pepper, `${parsed.keyId}.${parsed.secret}`, credential.secret_hash)
    : false;
  const now = new Date();
  const unexpired = !credential?.expires_at || credential.expires_at > now.toISOString();
  if (!credential || !validHash || !unexpired || credential.status !== 'active') {
    recordLoginFailure(rateKey);
    return jsonResponse({ error: 'Invalid access key' }, 401, noStoreHeaders());
  }

  clearLoginFailures(rateKey);
  const rawToken = randomToken(32);
  const tokenHash = await sha256Base64Url(rawToken);
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + SESSION_SECONDS * 1000).toISOString();
  await env.PAM_DB.batch([
    env.PAM_DB.prepare(`INSERT INTO pam_sessions
      (token_hash, user_id, auth_version, created_at, expires_at, last_seen_at)
      VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(tokenHash, credential.user_id, credential.auth_version, createdAt, expiresAt, createdAt),
    env.PAM_DB.prepare('UPDATE pam_credentials SET last_used_at = ? WHERE key_id = ?')
      .bind(createdAt, parsed.keyId),
    env.PAM_DB.prepare('DELETE FROM pam_sessions WHERE expires_at <= ? OR revoked_at != \'\'')
      .bind(createdAt)
  ]);

  return jsonResponse({ user: publicUser(credential) }, 200, {
    ...noStoreHeaders(),
    'Set-Cookie': sessionCookie(request, rawToken, SESSION_SECONDS)
  });
}

async function logout(request, db) {
  if (!hasSameOrigin(request)) return jsonResponse({ error: 'Cross-origin logout is not allowed' }, 403);
  const rawToken = readCookie(request, SESSION_COOKIE);
  if (rawToken) {
    const tokenHash = await sha256Base64Url(rawToken);
    await db.prepare('UPDATE pam_sessions SET revoked_at = ? WHERE token_hash = ?')
      .bind(new Date().toISOString(), tokenHash).run();
  }
  return jsonResponse({ ok: true }, 200, {
    ...noStoreHeaders(),
    'Set-Cookie': sessionCookie(request, '', 0)
  });
}

async function getSession(request, db) {
  try {
    const identity = await authenticateSession(request, db);
    return jsonResponse({ user: publicUser(identity) }, 200, noStoreHeaders());
  } catch (error) {
    return jsonResponse({ error: 'Unauthorized' }, error.status || 401, noStoreHeaders());
  }
}

async function authenticateSession(request, db) {
  const rawToken = readCookie(request, SESSION_COOKIE);
  if (!rawToken || rawToken.length > 100) throw httpError('Unauthorized', 401);
  const tokenHash = await sha256Base64Url(rawToken);
  const now = new Date().toISOString();
  const session = await db.prepare(`SELECT s.user_id, u.username, u.display_name, u.role,
      u.status, u.auth_version
    FROM pam_sessions s JOIN pam_users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.revoked_at = '' AND s.expires_at > ?
      AND s.auth_version = u.auth_version AND u.status = 'active'`)
    .bind(tokenHash, now).first();
  if (!session) throw httpError('Unauthorized', 401);
  return {
    ...session,
    ownerId: `user:${session.user_id}`,
    email: session.username
  };
}

function publicUser(identity) {
  return {
    id: identity.ownerId || `user:${identity.user_id}`,
    username: identity.username,
    displayName: identity.display_name,
    role: identity.role
  };
}

async function readSmallJson(request) {
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > MAX_AUTH_BODY_BYTES) throw httpError('Request body is too large', 413);
  const raw = await request.text();
  if (encoder.encode(raw).byteLength > MAX_AUTH_BODY_BYTES) throw httpError('Request body is too large', 413);
  try {
    return JSON.parse(raw);
  } catch {
    throw httpError('Invalid JSON body', 400);
  }
}

function parseAccessKey(value) {
  const match = /^pam_([A-Za-z0-9_-]{12})_([A-Za-z0-9_-]{43})$/.exec(value);
  return match ? { keyId: match[1], secret: match[2] } : null;
}

async function verifyCredentialHash(pepper, value, expected) {
  try {
    const key = await crypto.subtle.importKey('raw', encoder.encode(pepper), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    return crypto.subtle.verify('HMAC', key, decodeBase64Url(expected), encoder.encode(value));
  } catch {
    return false;
  }
}

async function sha256Base64Url(value) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return encodeBase64Url(new Uint8Array(digest));
}

function randomToken(size) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return encodeBase64Url(bytes);
}

function encodeBase64Url(bytes) {
  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeBase64Url(value) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(String(value || '').length / 4) * 4, '=');
  const binary = atob(normalized);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

function readCookie(request, name) {
  const cookie = request.headers.get('Cookie') || '';
  for (const part of cookie.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return '';
}

function sessionCookie(request, value, maxAge) {
  const secure = isLocalHostname(new URL(request.url).hostname) ? '' : '; Secure';
  return `${SESSION_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

function isLoginLimited(key) {
  const current = loginFailures.get(key);
  if (!current || current.resetAt <= Date.now()) {
    loginFailures.delete(key);
    return false;
  }
  return current.count >= 10;
}

function recordLoginFailure(key) {
  if (loginFailures.size > 1_000) loginFailures.clear();
  const current = loginFailures.get(key);
  if (!current || current.resetAt <= Date.now()) {
    loginFailures.set(key, { count: 1, resetAt: Date.now() + 5 * 60 * 1000 });
    return;
  }
  current.count += 1;
}

function clearLoginFailures(key) {
  loginFailures.delete(key);
}

function hasSameOrigin(request) {
  const origin = request.headers.get('Origin');
  return Boolean(origin) && origin === new URL(request.url).origin;
}

function normalizePath(path) {
  return (Array.isArray(path) ? path.join('/') : String(path || '')).replace(/^\/+|\/+$/g, '');
}

function isLocalHostname(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

function parseJsonObject(value) {
  try {
    const parsed = JSON.parse(value || '{}');
    return isObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isShortString(value, maxLength) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
}

function isBoundedString(value, maxLength) {
  return typeof value === 'string' && value.length <= maxLength;
}

function isIsoDateTime(value) {
  return typeof value === 'string' && value.length <= 40 && Number.isFinite(Date.parse(value));
}

function isFiniteNumber(value, minimum = -Infinity) {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum;
}

function httpError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function noStoreHeaders() {
  return { 'Cache-Control': 'no-store, private', Vary: 'Cookie' };
}

function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers }
  });
}
