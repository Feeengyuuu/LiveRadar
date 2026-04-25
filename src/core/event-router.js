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
import { toggleSnow } from '../features/enhancements/snow-effect-loader.js';
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
    removeRoom,
    toggleFavorite
} from '../features/core/room-management.js';
import { getElement } from '../utils/dom-cache.js';
import { toggleAutoRefresh } from '../features/core/auto-refresh.js';
import { unlockAllAudio } from '../features/audio/audio-manager.js';
import { exportRooms, importRooms } from '../features/core/import-export.js';
import { refreshAll } from './refresh-manager.js';
import { getRooms } from './state.js';

/**
 * Action handler registry
 * Maps data-action values to their handler functions
 */
const actionHandlers = {
    // Snow effect
    'toggle-snow': () => {
        void toggleSnow();
    },

    // Platform selector
    'toggle-dropdown': (element, event) => toggleDropdown(event),
    'close-dropdown': () => closeDropdown(),
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
        toggleFavorite(id, platform);
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
    'toggle-auto-refresh': () => toggleAutoRefresh(),

    // Import/Export
    'export-rooms': () => exportRooms(getRooms()),
    'import-rooms': () => {
        getElement('import-file-input')?.click();
    },

    // Refresh
    'refresh-all': () => refreshAll(),

    // Audio
    'unlock-audio': () => unlockAllAudio()
};

let disposeEventRouter = null;

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
    if (event.key === 'Escape') {
        closeDropdown();
        hideHistory();
        return;
    }

    if (event.target.id === 'selector-trigger' && event.key === 'ArrowDown') {
        event.preventDefault();
        const menu = getElement('selector-menu');
        if (menu?.classList.contains('dropdown-enter')) {
            toggleDropdown(event);
        }
        document.querySelector('#selector-menu [data-action="select-platform"]')?.focus();
        return;
    }

    const platformOption = event.target.closest?.('#selector-menu [data-action="select-platform"]');
    if (platformOption && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
        event.preventDefault();
        const options = [...document.querySelectorAll('#selector-menu [data-action="select-platform"]')];
        const currentIndex = options.indexOf(platformOption);
        const direction = event.key === 'ArrowDown' ? 1 : -1;
        const nextIndex = (currentIndex + direction + options.length) % options.length;
        options[nextIndex]?.focus();
        return;
    }

    if (platformOption && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault();
        const { platform, color, label } = platformOption.dataset;
        selectPlatform(platform, color, label);
        getElement('selector-trigger')?.focus();
        return;
    }

    const historyItem = event.target.closest?.('#history-dropdown .history-item');
    if (historyItem && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
        event.preventDefault();
        const items = [...document.querySelectorAll('#history-dropdown .history-item')];
        const currentIndex = items.indexOf(historyItem);
        const direction = event.key === 'ArrowDown' ? 1 : -1;
        const nextIndex = (currentIndex + direction + items.length) % items.length;
        items[nextIndex]?.focus();
        return;
    }

    // Handle Enter key on room-id-input
    if (event.target.id === 'room-id-input' && event.key === 'Enter') {
        event.preventDefault();
        handleAddInput();
        return;
    }

    if (event.target.id === 'room-id-input' && event.key === 'ArrowDown') {
        event.preventDefault();
        showHistory();
        document.querySelector('#history-dropdown .history-item')?.focus();
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
    if (!event.target.closest('#custom-selector-container')) {
        closeDropdown();
    }
    hideHistory(event);
}

/**
 * Initialize event delegation router
 * Sets up global event listeners
 */
export function initEventRouter() {
    if (disposeEventRouter) {
        return disposeEventRouter;
    }

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

    disposeEventRouter = () => {
        document.removeEventListener('click', handleClick);
        document.removeEventListener('input', handleInputEvent);
        document.removeEventListener('focus', handleFocus, true);
        document.removeEventListener('keydown', handleKeydown);
        document.removeEventListener('change', handleChange);
        document.body.removeEventListener('click', handleBodyClick, true);
        disposeEventRouter = null;
    };

    return disposeEventRouter;
}

/**
 * Get list of registered actions (for debugging)
 * @returns {string[]} Array of action names
 */
export function getRegisteredActions() {
    return Object.keys(actionHandlers);
}
