const SYNC_META_KEY = 'pam:v1:cloud-sync';
const CHANGE_EVENT = 'pam:local-data-change';
const ALL_DOMAINS = ['accounts', 'snapshots', 'holdings', 'preferences'];
const SYNC_DELAY_MS = 700;
const RETRY_DELAY_MS = 12_000;

let options = null;
let revision = 0;
let remoteData = null;
let remoteUpdatedAt = '';
let dirtyDomains = new Set();
let sendingDomains = new Set();
let ready = false;
let paused = false;
let suppressChanges = false;
let requestInProgress = false;
let syncTimer = null;
let initialized = false;

export async function initializeCloudSync(syncOptions) {
    options = syncOptions;
    if (!initialized) {
        window.addEventListener(CHANGE_EVENT, handleLocalChange);
        window.addEventListener('online', retryCloudSync);
        initialized = true;
    }

    const meta = readSyncMeta();
    revision = meta.revision;
    dirtyDomains = new Set(meta.dirtyDomains);
    ready = false;
    paused = false;
    emitStatus('connecting');

    try {
        const response = await fetch('/api/pam/data', {
            headers: { Accept: 'application/json' },
            credentials: 'same-origin'
        });
        const payload = await readResponseJson(response);
        if (!response.ok) throw createSyncError(payload.error || `HTTP ${response.status}`, response.status);

        remoteData = normalizeCloudData(payload.data);
        remoteUpdatedAt = String(payload.updatedAt || '');
        const remoteRevision = Number(payload.revision || 0);
        const remoteUserId = String(payload.user?.id || '');
        const localHasData = Boolean(options.hasLocalBusinessData?.());
        const remoteHasData = remoteRevision > 0 || hasBusinessData(remoteData);
        const previouslyConnected = meta.connected;

        if (previouslyConnected && meta.userId && remoteUserId && meta.userId !== remoteUserId) {
            revision = remoteRevision;
            dirtyDomains.clear();
            sendingDomains.clear();
            applyRemoteData(remoteData);
            ready = true;
            persistSyncMeta({ connected: true, userId: remoteUserId, userEmail: payload.user?.email || '' });
            emitStatus('synced');
            return;
        }

        if (dirtyDomains.size > 0 && previouslyConnected) {
            if (meta.revision !== remoteRevision) {
                revision = remoteRevision;
                pauseForConflict();
                return;
            }
            revision = remoteRevision;
            ready = true;
            persistSyncMeta({ connected: true, userId: remoteUserId, userEmail: payload.user?.email || meta.userEmail });
            scheduleSync(0);
            return;
        }

        if (localHasData && !previouslyConnected) {
            revision = remoteRevision;
            paused = true;
            emitStatus('migration');
            options.onMigrationRequired?.({
                cloudHasData: remoteHasData,
                userEmail: payload.user?.email || '',
                uploadLocal: () => uploadLocalData(remoteUserId, payload.user?.email || ''),
                useCloud: () => useCloudData(remoteUserId, payload.user?.email || '')
            });
            return;
        }

        revision = remoteRevision;
        applyRemoteData(remoteData);
        ready = true;
        persistSyncMeta({ connected: true, userId: remoteUserId, userEmail: payload.user?.email || meta.userEmail });
        emitStatus('synced');
    } catch (error) {
        ready = false;
        paused = false;
        emitStatus(error.status === 401 ? 'unauthorized' : 'local', error.message);
    }
}

export function retryCloudSync() {
    if (!options || requestInProgress) return;
    clearTimeout(syncTimer);
    syncTimer = null;
    initializeCloudSync(options);
}

export async function replaceWithLatestCloud() {
    if (!options || requestInProgress) return;
    requestInProgress = true;
    emitStatus('connecting');
    try {
        const response = await fetch('/api/pam/data', {
            headers: { Accept: 'application/json' },
            credentials: 'same-origin'
        });
        const payload = await readResponseJson(response);
        if (!response.ok) throw createSyncError(payload.error || `HTTP ${response.status}`, response.status);
        remoteData = normalizeCloudData(payload.data);
        remoteUpdatedAt = String(payload.updatedAt || '');
        revision = Number(payload.revision || 0);
        dirtyDomains.clear();
        sendingDomains.clear();
        applyRemoteData(remoteData);
        paused = false;
        ready = true;
        persistSyncMeta({ connected: true, userId: payload.user?.id || '', userEmail: payload.user?.email || '' });
        emitStatus('synced');
    } catch (error) {
        ready = false;
        paused = true;
        emitStatus('error', error.message);
    } finally {
        requestInProgress = false;
    }
}

function handleLocalChange(event) {
    const domain = event.detail?.domain;
    if (suppressChanges || !ALL_DOMAINS.includes(domain)) return;
    dirtyDomains.add(domain);
    persistSyncMeta();
    if (ready && !paused) {
        emitStatus('pending');
        scheduleSync();
    }
}

function uploadLocalData(userId, userEmail) {
    paused = false;
    ready = true;
    ALL_DOMAINS.forEach(domain => dirtyDomains.add(domain));
    persistSyncMeta({ connected: true, userId, userEmail });
    emitStatus('pending');
    scheduleSync(0);
}

function useCloudData(userId, userEmail) {
    applyRemoteData(remoteData || emptyData());
    dirtyDomains.clear();
    sendingDomains.clear();
    paused = false;
    ready = true;
    persistSyncMeta({ connected: true, userId, userEmail });
    emitStatus('synced');
}

function applyRemoteData(data) {
    suppressChanges = true;
    try {
        options.applyRemoteData?.(data);
    } finally {
        suppressChanges = false;
    }
}

function scheduleSync(delay = SYNC_DELAY_MS) {
    if (!ready || paused || requestInProgress || dirtyDomains.size === 0) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(flushChanges, delay);
}

async function flushChanges() {
    syncTimer = null;
    if (!ready || paused || requestInProgress || dirtyDomains.size === 0) return;

    requestInProgress = true;
    let nextDelay = SYNC_DELAY_MS;
    sendingDomains = new Set(dirtyDomains);
    sendingDomains.forEach(domain => dirtyDomains.delete(domain));
    persistSyncMeta();
    emitStatus('syncing');

    try {
        const localData = options.getLocalData();
        const domains = [...sendingDomains];
        const response = await fetch('/api/pam/data', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({
                baseRevision: revision,
                domains,
                data: Object.fromEntries(domains.map(domain => [domain, localData[domain]]))
            })
        });
        const payload = await readResponseJson(response);
        if (response.status === 409) {
            sendingDomains.forEach(domain => dirtyDomains.add(domain));
            sendingDomains.clear();
            revision = Number(payload.currentRevision || revision);
            pauseForConflict();
            return;
        }
        if (!response.ok) throw createSyncError(payload.error || `HTTP ${response.status}`, response.status);

        revision = Number(payload.revision);
        remoteUpdatedAt = String(payload.updatedAt || '');
        sendingDomains.clear();
        persistSyncMeta({ connected: true });
        emitStatus(dirtyDomains.size > 0 ? 'pending' : 'synced');
    } catch (error) {
        sendingDomains.forEach(domain => dirtyDomains.add(domain));
        sendingDomains.clear();
        persistSyncMeta();
        const isClientError = error.status >= 400 && error.status < 500;
        if (isClientError) {
            ready = false;
            paused = true;
        } else {
            nextDelay = RETRY_DELAY_MS;
        }
        emitStatus(error.status === 401 ? 'unauthorized' : 'error', error.message);
    } finally {
        requestInProgress = false;
        if (ready && !paused && dirtyDomains.size > 0 && !syncTimer) {
            scheduleSync(nextDelay);
        }
    }
}

function pauseForConflict() {
    ready = false;
    paused = true;
    persistSyncMeta({ connected: true });
    emitStatus('conflict');
    options.onConflict?.();
}

function emitStatus(code, detail = '') {
    options?.onStatus?.({ code, detail, updatedAt: remoteUpdatedAt, pending: dirtyDomains.size + sendingDomains.size });
}

function persistSyncMeta(overrides = {}) {
    const current = readSyncMeta();
    const pendingDomains = [...new Set([...dirtyDomains, ...sendingDomains])];
    localStorage.setItem(SYNC_META_KEY, JSON.stringify({
        revision,
        dirtyDomains: pendingDomains,
        connected: overrides.connected ?? current.connected,
        userId: overrides.userId ?? current.userId,
        userEmail: overrides.userEmail ?? current.userEmail
    }));
}

function readSyncMeta() {
    try {
        const parsed = JSON.parse(localStorage.getItem(SYNC_META_KEY) || '{}');
        return {
            revision: Number.isInteger(parsed.revision) && parsed.revision >= 0 ? parsed.revision : 0,
            dirtyDomains: Array.isArray(parsed.dirtyDomains)
                ? parsed.dirtyDomains.filter(domain => ALL_DOMAINS.includes(domain))
                : [],
            connected: Boolean(parsed.connected),
            userId: String(parsed.userId || ''),
            userEmail: String(parsed.userEmail || '')
        };
    } catch {
        return { revision: 0, dirtyDomains: [], connected: false, userId: '', userEmail: '' };
    }
}

function normalizeCloudData(value) {
    const data = value && typeof value === 'object' ? value : {};
    return {
        accounts: Array.isArray(data.accounts) ? data.accounts : [],
        snapshots: Array.isArray(data.snapshots) ? data.snapshots : [],
        holdings: Array.isArray(data.holdings) ? data.holdings : [],
        preferences: data.preferences && typeof data.preferences === 'object' && !Array.isArray(data.preferences)
            ? data.preferences
            : {}
    };
}

function hasBusinessData(data) {
    return data.accounts.length > 0 || data.snapshots.length > 0 || data.holdings.length > 0;
}

function emptyData() {
    return { accounts: [], snapshots: [], holdings: [], preferences: {} };
}

async function readResponseJson(response) {
    try {
        return await response.json();
    } catch {
        return {};
    }
}

function createSyncError(message, status) {
    const error = new Error(message);
    error.status = status;
    return error;
}
