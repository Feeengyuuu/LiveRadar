/**
 * ====================================================================
 * Global Functions Exposure Module
 * ====================================================================
 *
 * Exposes internal functions to the window object for HTML inline event handlers.
 *
 * Why this is needed:
 * - HTML uses inline event handlers (onclick="functionName()")
 * - These handlers expect functions to be available on window object
 * - This module centralizes all global function exports
 *
 * TODO: Migrate HTML to use addEventListener and remove this module
 * ==================================================================== */

// Import all functions that need to be exposed
import { toggleSnow } from '../features/snow-effect.js';
import { toggleDropdown, selectPlatform, closeDropdown, showHistory, hideHistory, handleInput, handleAddInput, applyHistory, deleteHistory, removeRoom } from '../features/room-management.js';
import { toggleNotifications } from '../features/notifications.js';
import { toggleAutoRefresh } from '../features/auto-refresh.js';
import { toggleKeepAlive, unlockAllAudio } from '../features/audio/audio-manager.js';
import { toggleRegionMode } from '../features/region-detector.js';
import { exportRooms, importRooms } from '../features/import-export.js';
import { refreshAll } from '../core/refresh-manager.js';
import { dismissFileWarning, dismissFileWarningPermanently, showDeploymentGuide } from './file-protocol-warning.js';
import { playNotificationSound } from '../features/audio/notification-audio.js';
import { showToast } from '../utils/helpers.js';
import { getRooms } from '../core/state.js';

/**
 * Expose all functions to window object
 * Call this once during app initialization
 */
export function exposeGlobals() {
    console.log('[Globals] Exposing functions to window object...');

    // === Utilities ===
    window.showToast = showToast;

    // === Snow Effect ===
    window.toggleSnow = toggleSnow;

    // === Platform Selector & Dropdown ===
    window.toggleDropdown = toggleDropdown;
    window.selectPlatform = selectPlatform;
    window.closeDropdown = closeDropdown;

    // === Search & History ===
    window.showHistory = showHistory;
    window.hideHistory = hideHistory;
    window.handleInput = handleInput;
    window.handleAddInput = handleAddInput;
    window.applyHistory = applyHistory;
    window.deleteHistory = deleteHistory;

    // === Room Management ===
    window.removeRoom = removeRoom;

    // === Settings Toggles ===
    window.toggleNotifications = toggleNotifications;
    window.toggleAutoRefresh = toggleAutoRefresh;
    window.toggleKeepAlive = toggleKeepAlive;
    window.toggleRegionMode = toggleRegionMode;

    // === Import/Export ===
    window.exportRooms = () => exportRooms(getRooms());
    window.importRooms = importRooms;

    // === Refresh ===
    window.refreshAll = refreshAll;

    // === Warning Banner ===
    window.dismissFileWarning = dismissFileWarning;
    window.dismissFileWarningPermanently = dismissFileWarningPermanently;
    window.showDeploymentGuide = showDeploymentGuide;

    // === Audio ===
    window.unlockAllAudio = unlockAllAudio;
    window.playNotificationSound = playNotificationSound;

    console.log('[Globals] ✓ All functions exposed to window');
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
