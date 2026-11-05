import { t } from '../../config/i18n.js';

// Landscape full-screen view of the returns chart panel.
// Native path: Fullscreen API on the panel plus a landscape orientation lock (Android Chrome).
// Fallback path: a fixed overlay; on a portrait touch screen CSS rotates it 90deg (iPhone Safari has
// neither element full screen nor orientation lock). Rotating the phone flips the media query back.
const PANEL_ID = 'performanceChartPanel';
const BUTTON_ID = 'chartFullscreenBtn';
const ROOT_OPEN_CLASS = 'chart-fullscreen-open';
const PANEL_OPEN_CLASS = 'is-fullscreen';
const ROTATE_QUERY = '(orientation: portrait) and (pointer: coarse)';

const ENTER_ICON = '<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5"/><path d="M20 9V4h-5"/><path d="M4 15v5h5"/><path d="M20 15v5h-5"/></svg>';
const EXIT_ICON = '<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4v5H4"/><path d="M15 4v5h5"/><path d="M9 20v-5H4"/><path d="M15 20v-5h5"/></svg>';

let open = false;
// Full screen opened from the phone layout keeps the phone chart's portfolio line, alongside every account.
let openedFromCompact = false;
let nativeFullscreen = false;
let onResize = () => {};

export function bindChartFullscreen(options = {}) {
    if (typeof options.onResize === 'function') onResize = options.onResize;
    document.getElementById(BUTTON_ID)?.addEventListener('click', () => {
        if (open) closeChartFullscreen();
        else openChartFullscreen();
    });
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('keydown', event => {
        if (open && event.key === 'Escape') closeChartFullscreen();
    });
    renderChartFullscreenButton();
}

export function isChartFullscreenOpen() {
    return open;
}

export function isChartFullscreenFromCompact() {
    return open && openedFromCompact;
}

export function renderChartFullscreenButton() {
    const button = document.getElementById(BUTTON_ID);
    if (!button) return;
    const label = t(open ? 'chartFullscreenExit' : 'chartFullscreenEnter');
    button.innerHTML = open ? EXIT_ICON : ENTER_ICON;
    button.title = label;
    button.setAttribute('aria-label', label);
}

function openChartFullscreen() {
    const panel = document.getElementById(PANEL_ID);
    if (!panel || open) return;
    open = true;
    openedFromCompact = window.matchMedia?.('(max-width: 720px)')?.matches === true;
    document.documentElement.classList.add(ROOT_OPEN_CLASS);
    panel.classList.add(PANEL_OPEN_CLASS);
    renderChartFullscreenButton();
    scheduleResize();
    // Must start synchronously inside the click so the browser accepts the full-screen request.
    requestNativeLandscape(panel).finally(scheduleResize);
    document.getElementById(BUTTON_ID)?.focus({ preventScroll: true });
}

function closeChartFullscreen() {
    if (!open) return;
    open = false;
    const wasNative = nativeFullscreen;
    nativeFullscreen = false;
    try {
        screen.orientation?.unlock?.();
    } catch {
        // Unlock throws where locking is unsupported; nothing to undo.
    }
    if (wasNative && getFullscreenElement()) exitNativeFullscreen();
    document.documentElement.classList.remove(ROOT_OPEN_CLASS);
    document.getElementById(PANEL_ID)?.classList.remove(PANEL_OPEN_CLASS);
    renderChartFullscreenButton();
    scheduleResize();
}

async function requestNativeLandscape(panel) {
    const request = panel.requestFullscreen || panel.webkitRequestFullscreen;
    if (typeof request !== 'function') return;
    try {
        await request.call(panel, { navigationUI: 'hide' });
    } catch {
        return;
    }
    if (!open) {
        exitNativeFullscreen();
        return;
    }
    nativeFullscreen = true;
    try {
        if (typeof screen.orientation?.lock !== 'function') throw new Error('orientation lock unsupported');
        await screen.orientation.lock('landscape');
    } catch {
        // Native full screen cannot be CSS-rotated, so a phone held upright switches to the rotated overlay.
        // Desktops and screens already in landscape keep native full screen.
        if (open && window.matchMedia?.(ROTATE_QUERY)?.matches) {
            nativeFullscreen = false;
            exitNativeFullscreen();
        }
    }
}

function handleFullscreenChange() {
    // Leaving native full screen through the browser (Esc, back gesture) closes the view too.
    if (open && nativeFullscreen && !getFullscreenElement()) closeChartFullscreen();
}

function getFullscreenElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
}

function exitNativeFullscreen() {
    const exit = document.exitFullscreen || document.webkitExitFullscreen;
    if (typeof exit !== 'function' || !getFullscreenElement()) return;
    try {
        const result = exit.call(document);
        result?.catch?.(() => {});
    } catch {
        // Already leaving full screen.
    }
}

// Class toggles and rotation change the chart box without a window resize, so resize it explicitly.
function scheduleResize() {
    requestAnimationFrame(() => onResize());
}
