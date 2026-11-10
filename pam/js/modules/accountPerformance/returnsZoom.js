import { state } from '../../config/state.js';
import { t } from '../../config/i18n.js';

// Desktop zoom for the 账户收益 view. CSS zoom reflows the cards, chart, and comparison table at the chosen
// scale; the value lives in state.returnsZoom and is saved as a preference. The CSS rule is limited to
// widths above 720px, so a phone never inherits a desktop zoom and the controls are hidden there.
export const RETURNS_ZOOM_LEVELS = [0.8, 0.9, 1, 1.1, 1.25];
const VIEW_ID = 'analysisView';
const OUT_ID = 'returnsZoomOutBtn';
const IN_ID = 'returnsZoomInBtn';
const RESET_ID = 'returnsZoomResetBtn';

export function normalizeReturnsZoom(value) {
    const level = Number(value);
    return RETURNS_ZOOM_LEVELS.includes(level) ? level : 1;
}

export function bindReturnsZoom(onChange) {
    const step = delta => {
        const index = RETURNS_ZOOM_LEVELS.indexOf(state.returnsZoom);
        const next = RETURNS_ZOOM_LEVELS[Math.min(RETURNS_ZOOM_LEVELS.length - 1, Math.max(0, index + delta))];
        if (next !== state.returnsZoom) onChange(next);
    };
    document.getElementById(OUT_ID)?.addEventListener('click', () => step(-1));
    document.getElementById(IN_ID)?.addEventListener('click', () => step(1));
    document.getElementById(RESET_ID)?.addEventListener('click', () => {
        if (state.returnsZoom !== 1) onChange(1);
    });
}

export function renderReturnsZoom() {
    const index = RETURNS_ZOOM_LEVELS.indexOf(state.returnsZoom);
    document.getElementById(VIEW_ID)?.style.setProperty('--returns-zoom', String(state.returnsZoom));
    const out = document.getElementById(OUT_ID);
    const inButton = document.getElementById(IN_ID);
    const reset = document.getElementById(RESET_ID);
    if (out) out.disabled = index <= 0;
    if (inButton) inButton.disabled = index >= RETURNS_ZOOM_LEVELS.length - 1;
    if (reset) reset.textContent = `${Math.round(state.returnsZoom * 100)}%`;
    if (reset) reset.title = t('returnsZoomReset');
}
