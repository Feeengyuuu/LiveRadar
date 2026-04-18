/**
 * Global Namespace Module
 *
 * Exposes a minimal window.LR namespace + a couple of legacy window shims
 * that dynamically-generated inline onclick handlers rely on (toggleFavorite).
 *
 * The bulk of cross-module wiring now goes through event-bus + direct imports.
 */

import { toggleFavorite } from '../features/core/room-management.js';
import { showToast } from '../utils/helpers.js';

export function exposeGlobals() {
    if (!window.LR) {
        window.LR = {
            utils: { showToast },
            rooms: { toggleFavorite },
            version: '3.1.1',
            name: 'LiveRadar',
        };
    }

    // Inline onclick handlers (rendered into dynamically-injected DOM)
    // still need these on window. Everything else has been migrated.
    window.showToast = showToast;
    window.toggleFavorite = toggleFavorite;
}
