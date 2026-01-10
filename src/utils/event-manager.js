/**
 * ====================================================================
 * Event Manager - Centralized Event Handling
 * ====================================================================
 *
 * Provides:
 * - Event delegation for efficient DOM event handling
 * - Centralized event binding (replaces inline onclick handlers)
 * - Memory-efficient event listener management
 * - Custom event system for component communication
 *
 * @module utils/event-manager
 */

import { Logger } from './logger.js';

const log = Logger.create('EventManager');

// ====================================================================
// Event Delegation
// ====================================================================

/**
 * Registered event delegates
 * @type {Map<string, Map<string, Function>>}
 * Structure: eventType -> selector -> handler
 */
const delegates = new Map();

/**
 * Root element for delegation
 * @type {HTMLElement|null}
 */
let delegateRoot = null;

/**
 * Initialize event delegation on a root element
 * @param {HTMLElement} [root=document.body] - Root element for delegation
 */
export function initEventDelegation(root = document.body) {
    if (delegateRoot) {
        log.warn('Event delegation already initialized');
        return;
    }

    delegateRoot = root;

    // Supported event types for delegation
    const eventTypes = ['click', 'dblclick', 'change', 'input', 'submit', 'keydown', 'keyup'];

    eventTypes.forEach(eventType => {
        delegates.set(eventType, new Map());

        delegateRoot.addEventListener(eventType, (event) => {
            handleDelegatedEvent(eventType, event);
        }, { passive: eventType !== 'submit' });
    });

    log.info('Event delegation initialized');
}

/**
 * Handle delegated event
 * @param {string} eventType - Event type
 * @param {Event} event - Event object
 */
function handleDelegatedEvent(eventType, event) {
    const handlers = delegates.get(eventType);
    if (!handlers || handlers.size === 0) return;

    // Find matching element by traversing up the DOM
    let target = event.target;

    while (target && target !== delegateRoot) {
        for (const [selector, handler] of handlers) {
            if (target.matches(selector)) {
                try {
                    handler(event, target);
                } catch (error) {
                    log.error(`Error in delegated handler for ${selector}:`, error);
                }
            }
        }
        target = target.parentElement;
    }
}

/**
 * Register a delegated event handler
 * @param {string} eventType - Event type (click, change, etc.)
 * @param {string} selector - CSS selector to match
 * @param {Function} handler - Event handler (event, matchedElement) => void
 * @returns {Function} Unregister function
 *
 * @example
 * // Handle all button clicks
 * delegate('click', '.btn-refresh', (e, btn) => {
 *     refreshAll();
 * });
 *
 * // Handle card clicks
 * delegate('click', '[data-room-id]', (e, card) => {
 *     const roomId = card.dataset.roomId;
 *     openRoom(roomId);
 * });
 */
export function delegate(eventType, selector, handler) {
    if (!delegates.has(eventType)) {
        log.warn(`Event type "${eventType}" not supported for delegation`);
        return () => {};
    }

    delegates.get(eventType).set(selector, handler);
    log.debug(`Registered delegate: ${eventType} on ${selector}`);

    // Return unregister function
    return () => {
        delegates.get(eventType)?.delete(selector);
    };
}

/**
 * Remove a delegated handler
 * @param {string} eventType - Event type
 * @param {string} selector - CSS selector
 */
export function undelegate(eventType, selector) {
    delegates.get(eventType)?.delete(selector);
}

// ====================================================================
// Direct Event Binding (for specific elements)
// ====================================================================

/**
 * Registered direct listeners for cleanup
 * @type {Map<HTMLElement, Map<string, Function>>}
 */
const directListeners = new Map();

/**
 * Add event listener with automatic cleanup tracking
 * @param {HTMLElement} element - Target element
 * @param {string} eventType - Event type
 * @param {Function} handler - Event handler
 * @param {Object} [options] - addEventListener options
 * @returns {Function} Remove listener function
 */
export function on(element, eventType, handler, options = {}) {
    if (!element) {
        log.warn('Cannot add listener to null element');
        return () => {};
    }

    element.addEventListener(eventType, handler, options);

    // Track for cleanup
    if (!directListeners.has(element)) {
        directListeners.set(element, new Map());
    }
    directListeners.get(element).set(`${eventType}:${handler.name || 'anonymous'}`, handler);

    // Return remove function
    return () => {
        element.removeEventListener(eventType, handler, options);
        directListeners.get(element)?.delete(`${eventType}:${handler.name || 'anonymous'}`);
    };
}

/**
 * Add one-time event listener
 * @param {HTMLElement} element - Target element
 * @param {string} eventType - Event type
 * @param {Function} handler - Event handler
 * @returns {Function} Remove listener function
 */
export function once(element, eventType, handler) {
    const wrappedHandler = (event) => {
        handler(event);
        element.removeEventListener(eventType, wrappedHandler);
    };

    element.addEventListener(eventType, wrappedHandler);
    return () => element.removeEventListener(eventType, wrappedHandler);
}

/**
 * Remove all listeners from an element
 * @param {HTMLElement} element - Target element
 */
export function removeAllListeners(element) {
    const listeners = directListeners.get(element);
    if (listeners) {
        // Note: This only removes tracked listeners
        // Can't remove listeners added elsewhere
        directListeners.delete(element);
    }
}

// ====================================================================
// Custom Event System
// ====================================================================

/**
 * Custom event subscribers
 * @type {Map<string, Set<Function>>}
 */
const customEventSubscribers = new Map();

/**
 * Subscribe to a custom event
 * @param {string} eventName - Custom event name
 * @param {Function} handler - Event handler
 * @returns {Function} Unsubscribe function
 *
 * @example
 * subscribe('room:added', (data) => {
 *     console.log('Room added:', data.roomId);
 * });
 */
export function subscribe(eventName, handler) {
    if (!customEventSubscribers.has(eventName)) {
        customEventSubscribers.set(eventName, new Set());
    }

    customEventSubscribers.get(eventName).add(handler);

    return () => {
        customEventSubscribers.get(eventName)?.delete(handler);
    };
}

/**
 * Publish a custom event
 * @param {string} eventName - Custom event name
 * @param {*} [data] - Event data
 *
 * @example
 * publish('room:added', { roomId: '123', platform: 'douyu' });
 */
export function publish(eventName, data) {
    const handlers = customEventSubscribers.get(eventName);
    if (!handlers) return;

    handlers.forEach(handler => {
        try {
            handler(data);
        } catch (error) {
            log.error(`Error in custom event handler for ${eventName}:`, error);
        }
    });
}

/**
 * Subscribe to event once
 * @param {string} eventName - Custom event name
 * @param {Function} handler - Event handler
 * @returns {Function} Unsubscribe function
 */
export function subscribeOnce(eventName, handler) {
    const wrappedHandler = (data) => {
        handler(data);
        customEventSubscribers.get(eventName)?.delete(wrappedHandler);
    };

    return subscribe(eventName, wrappedHandler);
}

// ====================================================================
// Common Event Handlers Registry
// ====================================================================

/**
 * Common handlers that can be referenced by name
 * @type {Map<string, Function>}
 */
const namedHandlers = new Map();

/**
 * Register a named handler
 * @param {string} name - Handler name
 * @param {Function} handler - Handler function
 */
export function registerHandler(name, handler) {
    namedHandlers.set(name, handler);
}

/**
 * Get a named handler
 * @param {string} name - Handler name
 * @returns {Function|undefined} Handler function
 */
export function getHandler(name) {
    return namedHandlers.get(name);
}

/**
 * Execute a named handler
 * @param {string} name - Handler name
 * @param {Event} [event] - Event object
 * @param {...any} args - Additional arguments
 * @returns {*} Handler return value
 */
export function executeHandler(name, event, ...args) {
    const handler = namedHandlers.get(name);
    if (handler) {
        return handler(event, ...args);
    }
    log.warn(`Handler "${name}" not found`);
}

// ====================================================================
// Keyboard Shortcuts
// ====================================================================

/**
 * Registered keyboard shortcuts
 * @type {Map<string, Function>}
 */
const keyboardShortcuts = new Map();

/**
 * Register a keyboard shortcut
 * @param {string} combo - Key combination (e.g., 'ctrl+r', 'escape', 'shift+enter')
 * @param {Function} handler - Handler function
 * @returns {Function} Unregister function
 */
export function shortcut(combo, handler) {
    const normalizedCombo = normalizeKeyCombo(combo);
    keyboardShortcuts.set(normalizedCombo, handler);

    return () => keyboardShortcuts.delete(normalizedCombo);
}

/**
 * Normalize key combination string
 * @param {string} combo - Raw key combination
 * @returns {string} Normalized combination
 */
function normalizeKeyCombo(combo) {
    return combo.toLowerCase().split('+').sort().join('+');
}

/**
 * Get current key combination from event
 * @param {KeyboardEvent} event - Keyboard event
 * @returns {string} Current key combination
 */
function getKeyCombo(event) {
    const parts = [];
    if (event.ctrlKey || event.metaKey) parts.push('ctrl');
    if (event.altKey) parts.push('alt');
    if (event.shiftKey) parts.push('shift');
    parts.push(event.key.toLowerCase());
    return parts.sort().join('+');
}

/**
 * Initialize keyboard shortcut handling
 */
export function initKeyboardShortcuts() {
    document.addEventListener('keydown', (event) => {
        // Don't trigger shortcuts when typing in inputs
        if (event.target.matches('input, textarea, select')) return;

        const combo = getKeyCombo(event);
        const handler = keyboardShortcuts.get(combo);

        if (handler) {
            event.preventDefault();
            handler(event);
        }
    });

    log.info('Keyboard shortcuts initialized');
}

// ====================================================================
// Cleanup
// ====================================================================

/**
 * Cleanup all event listeners and subscriptions
 */
export function cleanup() {
    // Clear delegates
    delegates.forEach(map => map.clear());

    // Clear direct listeners (note: doesn't actually remove them from DOM)
    directListeners.clear();

    // Clear custom events
    customEventSubscribers.clear();

    // Clear named handlers
    namedHandlers.clear();

    // Clear shortcuts
    keyboardShortcuts.clear();

    log.info('Event manager cleaned up');
}

// ====================================================================
// Export
// ====================================================================

export const EventManager = {
    init: initEventDelegation,
    delegate,
    undelegate,
    on,
    once,
    removeAllListeners,
    subscribe,
    publish,
    subscribeOnce,
    registerHandler,
    getHandler,
    executeHandler,
    shortcut,
    initKeyboardShortcuts,
    cleanup
};

export default EventManager;
