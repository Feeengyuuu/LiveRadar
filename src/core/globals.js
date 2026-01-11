/**
 * ====================================================================
 * Global Functions Exposure Module (Deprecated - Transitioning to Event Delegation)
 * ====================================================================
 *
 * MIGRATION STATUS:
 * ✅ HTML inline event handlers have been replaced with data-action attributes
 * ✅ Event delegation router (event-router.js) now handles all UI events
 * ⚠️  This module is kept temporarily for backwards compatibility and debugging
 *
 * Functions exposed here are for:
 * 1. Core module dependencies (renderAll, fetchStatus, etc.)
 * 2. Utility functions called from JS modules (showToast)
 * 3. Debugging/testing purposes
 *
 * ==================================================================== */

// Minimal imports for utilities still needed
import { toggleFavorite } from '../features/core/room-management.js';
import { showToast } from '../utils/helpers.js';

/**
 * Expose minimal functions to window object
 * Most UI event handlers are now managed by event-router.js
 */
export function exposeGlobals() {
    console.log('[Globals] Exposing minimal global functions...');

    // === Utilities (still needed by modules) ===
    window.showToast = showToast;

    // === Room management (still needed by renderer) ===
    window.toggleFavorite = toggleFavorite;

    console.log('[Globals] ✓ Minimal globals exposed');
    console.log('[Globals] ℹ️  Most UI events handled by event-router.js');
}

/**
 * Expose core functions and state for dependency injection
 * These are used by feature modules to access shared state
 *
 * @param {Object} core - Core dependencies
 */
export function exposeCoreDependencies(core) {
    const { rooms, roomDataCache, previousLiveStatus, renderAll, fetchStatus, notificationsEnabled } = core;

    // Expose state references
    window.rooms = rooms;
    window.roomDataCache = roomDataCache;
    window.previousLiveStatus = previousLiveStatus;

    // Expose core functions
    window.renderAll = renderAll;
    window.fetchStatus = fetchStatus;

    // Expose flags
    window.notificationsEnabled = notificationsEnabled;

    console.log('[Globals] ✓ Core dependencies exposed');
}
