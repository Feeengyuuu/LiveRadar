/**
 * Global Namespace Module
 *
 * Exposes a minimal window.LR namespace for debugging.
 * Runtime wiring no longer depends on legacy window shims.
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
}
