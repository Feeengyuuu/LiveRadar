/**
 * ====================================================================
 * Event Delegation Router
 * ====================================================================
 *
 * Centralized event handling system using event delegation.
 * Replaces inline onclick handlers with data-action attributes.
 *
 * Benefits:
 * - Eliminates global namespace pollution (no window.function assignments)
 * - Better security (CSP-compliant, no inline scripts)
 * - Better modularity (functions stay private)
 * - Automatic handling of dynamically created elements
 *
 * @module core/event-router
 */

// Import all action handlers
import { toggleSnow } from '../features/enhancements/snow-effect.js';
import {
    toggleDropdown,
    selectPlatform,
    closeDropdown,
    showHistory,
    hideHistory,
    handleInput,
    handleAddInput,
    applyHistory,
    deleteHistory,
    removeRoom
} from '../features/core/room-management.js';
import { toggleNotifications } from '../features/core/notifications.js';
import { toggleAutoRefresh } from '../features/core/auto-refresh.js';
import { toggleKeepAlive, unlockAllAudio } from '../features/audio/audio-manager.js';
import { toggleRegionMode } from '../features/enhancements/region-detector.js';
import { exportRooms, importRooms } from '../features/core/import-export.js';
import { refreshAll } from './refresh-manager.js';
import { dismissFileWarning, dismissFileWarningPermanently, showDeploymentGuide } from './file-protocol-warning.js';
import { playNotificationSound } from '../features/audio/notification-audio.js';
import { getRooms } from './state.js';

/**
 * Action handler registry
 * Maps data-action values to their handler functions
 */
const actionHandlers = {
    // Snow effect
    'toggle-snow': () => toggleSnow(),

    // Platform selector
    'toggle-dropdown': (element, event) => toggleDropdown(event),
    'close-dropdown': (element, event) => closeDropdown(),
    'select-platform': (element) => {
        const { platform, color, label } = element.dataset;
        selectPlatform(platform, color, label);
    },

    // Room management
    'add-room': () => handleAddInput(),
    'remove-room': (element, event) => {
        event.preventDefault();
        event.stopPropagation();
        const { id, platform } = element.dataset;
        removeRoom(id, platform);
    },
    'toggle-favorite': (element, event) => {
        event.preventDefault();
        event.stopPropagation();
        const { id, platform } = element.dataset;
        window.toggleFavorite?.(id, platform);
    },

    // Search history
    'apply-history': (element) => {
        const value = element.dataset.value;
        applyHistory(value);
    },
    'delete-history': (element, event) => {
        event.stopPropagation();
        const value = element.dataset.value;
        deleteHistory(event, value);
    },

    // Settings toggles
    'toggle-notifications': () => toggleNotifications(),
    'toggle-auto-refresh': () => toggleAutoRefresh(),
    'toggle-keep-alive': () => toggleKeepAlive(),
    'toggle-region-mode': () => toggleRegionMode(),

    // Import/Export
    'export-rooms': () => exportRooms(getRooms()),
    'import-rooms': () => {
        document.getElementById('import-file-input')?.click();
    },

    // Refresh
    'refresh-all': () => refreshAll(),

    // File protocol warning
    'dismiss-file-warning': () => dismissFileWarning(),
    'dismiss-file-warning-permanently': () => dismissFileWarningPermanently(),
    'show-deployment-guide': () => showDeploymentGuide(),

    // Audio
    'unlock-audio': (element, event) => unlockAllAudio(),
    'play-notification-sound': () => playNotificationSound(true, true)
};

/**
 * Handle click events via delegation
 * @param {Event} event - Click event
 */
function handleClick(event) {
    // Find closest element with data-action
    const actionElement = event.target.closest('[data-action]');
    if (!actionElement) return;

    const action = actionElement.dataset.action;
    const handler = actionHandlers[action];

    if (handler) {
        try {
            handler(actionElement, event);
        } catch (error) {
            console.error(`[Event Router] Error handling action "${action}":`, error);
        }
    } else {
        console.warn(`[Event Router] No handler found for action: ${action}`);
    }
}

/**
 * Handle input events for room search
 * @param {Event} event - Input event
 */
function handleInputEvent(event) {
    // Only handle room-id-input
    if (event.target.id === 'room-id-input') {
        handleInput(event);
    }
}

/**
 * Handle focus events
 * @param {Event} event - Focus event
 */
function handleFocus(event) {
    // Show history on room-id-input focus
    if (event.target.id === 'room-id-input') {
        showHistory();
    }
}

/**
 * Handle keydown events
 * @param {Event} event - Keydown event
 */
function handleKeydown(event) {
    // Handle Enter key on room-id-input
    if (event.target.id === 'room-id-input' && event.key === 'Enter') {
        handleAddInput();
    }
}

/**
 * Handle change events (file input)
 * @param {Event} event - Change event
 */
function handleChange(event) {
    // Handle file import
    if (event.target.id === 'import-file-input') {
        importRooms(event);
    }
}

/**
 * Handle body click for closing dropdowns
 * @param {Event} event - Click event
 */
function handleBodyClick(event) {
    closeDropdown();
    hideHistory(event);
}

/**
 * Initialize event delegation router
 * Sets up global event listeners
 */
export function initEventRouter() {
    console.log('[Event Router] Initializing event delegation...');

    // Global click delegation
    document.addEventListener('click', handleClick);

    // Input event delegation
    document.addEventListener('input', handleInputEvent);

    // Focus event delegation
    document.addEventListener('focus', handleFocus, true);

    // Keydown event delegation
    document.addEventListener('keydown', handleKeydown);

    // Change event delegation
    document.addEventListener('change', handleChange);

    // Body click for closing dropdowns (capture phase to handle first)
    document.body.addEventListener('click', handleBodyClick, true);

    console.log('[Event Router] ✓ Event delegation initialized');
    console.log(`[Event Router] Registered ${Object.keys(actionHandlers).length} action handlers`);
}

/**
 * Get list of registered actions (for debugging)
 * @returns {string[]} Array of action names
 */
export function getRegisteredActions() {
    return Object.keys(actionHandlers);
}
