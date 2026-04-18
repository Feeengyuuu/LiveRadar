/**
 * Minimal pub/sub event bus for cross-module coordination.
 *
 * Replaces `window.*` callback globals (see globals.js Phase 4 migration plan).
 * Resolves circular-dependency cases like refresh-manager ↔ auto-refresh.
 *
 * @module core/event-bus
 */

/** @type {Map<string, Set<Function>>} */
const channels = new Map();

/**
 * Subscribe to an event.
 * @param {string} event
 * @param {Function} handler
 * @returns {Function} unsubscribe
 */
export function on(event, handler) {
    let set = channels.get(event);
    if (!set) {
        set = new Set();
        channels.set(event, set);
    }
    set.add(handler);
    return () => off(event, handler);
}

/**
 * Unsubscribe a handler.
 * @param {string} event
 * @param {Function} handler
 */
export function off(event, handler) {
    channels.get(event)?.delete(handler);
}

/**
 * Emit an event to all subscribers. Handler errors are caught and logged.
 * @param {string} event
 * @param  {...any} args
 */
export function emit(event, ...args) {
    const set = channels.get(event);
    if (!set) return;
    for (const handler of set) {
        try {
            handler(...args);
        } catch (err) {
            console.error(`[EventBus] Handler for "${event}" threw:`, err);
        }
    }
}

/** Canonical event names. */
export const Events = Object.freeze({
    RENDER_REQUEST: 'render:request',
    REFRESH_REQUEST: 'refresh:request',
    AUTO_REFRESH_RESET: 'auto-refresh:reset',
    AUTO_REFRESH_UPDATE_BTN: 'auto-refresh:update-btn',
});
