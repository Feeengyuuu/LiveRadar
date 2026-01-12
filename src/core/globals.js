/**
 * ====================================================================
 * Global Namespace Module - Organized Global Exposure
 * ====================================================================
 *
 * This module organizes global functions under a single namespace (window.LR)
 * to reduce global namespace pollution.
 *
 * ARCHITECTURE:
 * ✅ Single global namespace: window.LR (LiveRadar)
 * ✅ Event delegation via event-router.js (no inline handlers)
 * ✅ Organized into logical sections (core, utils, state, debug)
 * ⚠️  Backward compatibility maintained (legacy window.* references)
 *
 * USAGE:
 * - New code should use: LR.utils.showToast(...)
 * - Legacy code can still use: window.showToast(...)
 * - Eventually migrate all to use LR namespace
 *
 * MIGRATION PATH:
 * 1. ✅ Phase 1: Organize under LR namespace (current)
 * 2. ⏳ Phase 2: Update all references to use LR.* (future)
 * 3. ⏳ Phase 3: Remove backward compatibility shims (future)
 * 4. ⏳ Phase 4: Replace with proper DI or event bus (future)
 *
 * ==================================================================== */

// Minimal imports for utilities still needed
import { toggleFavorite } from '../features/core/room-management.js';
import { showToast } from '../utils/helpers.js';

/**
 * Create namespaced global object
 * All LiveRadar functions are organized under window.LR
 */
function createNamespace() {
    if (window.LR) {
        console.warn('[Globals] LR namespace already exists, reusing...');
        return;
    }

    window.LR = {
        // Core application functions
        core: {},

        // Utility functions
        utils: {
            showToast,
        },

        // Application state (read-only access recommended)
        state: {},

        // Room management
        rooms: {
            toggleFavorite,
        },

        // Debug and development utilities
        debug: {},

        // Version info
        version: '3.1.1',
        name: 'LiveRadar',
    };

    console.log('[Globals] ✓ LR namespace created');
}

/**
 * Expose minimal functions to window object
 * Creates organized namespace and backward compatibility shims
 */
export function exposeGlobals() {
    console.log('[Globals] Initializing global namespace...');

    // Create LR namespace
    createNamespace();

    // === Backward Compatibility Shims ===
    // These allow legacy code to work while we migrate to LR.*
    window.showToast = showToast;
    window.toggleFavorite = toggleFavorite;

    console.log('[Globals] ✓ Minimal globals exposed');
    console.log('[Globals] ℹ️  Prefer using LR.* namespace over window.* directly');
}

/**
 * Expose core functions and state for dependency injection
 * These are used by feature modules to access shared state
 *
 * @param {Object} core - Core dependencies
 */
export function exposeCoreDependencies(core) {
    const { rooms, roomDataCache, previousLiveStatus, renderAll, fetchStatus, refreshAll, notificationsEnabled } = core;

    // Organize under LR namespace
    window.LR.core = {
        renderAll,
        fetchStatus,
        refreshAll,
    };

    window.LR.state = {
        rooms,
        roomDataCache,
        previousLiveStatus,
        notificationsEnabled,
    };

    // === Backward Compatibility Shims ===
    // Legacy window.* access (to be removed in future)
    window.rooms = rooms;
    window.roomDataCache = roomDataCache;
    window.previousLiveStatus = previousLiveStatus;
    window.renderAll = renderAll;
    window.fetchStatus = fetchStatus;
    window.refreshAll = refreshAll;
    window.notificationsEnabled = notificationsEnabled;

    console.log('[Globals] ✓ Core dependencies exposed under LR namespace');
    console.log('[Globals] ⚠️  Legacy window.* access still available (will be removed in future)');
}

/**
 * Get global reference safely
 * Provides future-proof access to global functions
 *
 * @param {string} path - Dot-separated path (e.g., 'core.renderAll')
 * @returns {*} Function or value at path
 *
 * @example
 * const renderAll = getGlobal('core.renderAll');
 * renderAll();
 */
export function getGlobal(path) {
    const parts = path.split('.');
    let current = window.LR;

    for (const part of parts) {
        if (!current || !(part in current)) {
            console.warn(`[Globals] Path not found: LR.${path}`);
            return undefined;
        }
        current = current[part];
    }

    return current;
}
