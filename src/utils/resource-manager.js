/**
 * ============================================================
 * Resource Manager - Memory leak prevention
 * ============================================================
 * Centralized management of timers, intervals, and event listeners
 * to prevent memory leaks and ensure proper cleanup.
 */

/**
 * Resource manager for tracking and cleaning up application resources
 */
export const ResourceManager = {
    _timers: new Set(),
    _intervals: new Set(),
    _listeners: new Map(),

    /**
     * Add a timer to be tracked
     * @param {number} id - Timer ID from setTimeout
     * @returns {number} The timer ID
     */
    addTimer(id) {
        this._timers.add(id);
        return id;
    },

    /**
     * Add an interval to be tracked
     * @param {number} id - Interval ID from setInterval
     * @returns {number} The interval ID
     */
    addInterval(id) {
        this._intervals.add(id);
        return id;
    },

    /**
     * Clear a specific timer
     * @param {number} id - Timer ID to clear
     */
    clearTimer(id) {
        window.clearTimeout(id);
        this._timers.delete(id);
    },

    /**
     * Clear a specific interval
     * @param {number} id - Interval ID to clear
     */
    clearInterval(id) {
        window.clearInterval(id);
        this._intervals.delete(id);
    },

    /**
     * Add an event listener and track it for cleanup
     * @param {EventTarget} element - DOM element or event target
     * @param {string} event - Event name
     * @param {Function} handler - Event handler function
     * @param {Object} options - Event listener options
     */
    addEventListener(element, event, handler, options) {
        if (!this._listeners.has(element)) {
            this._listeners.set(element, []);
        }
        this._listeners.get(element).push({ event, handler, options });
        element.addEventListener(event, handler, options);
    },

    /**
     * Clean up all tracked resources
     * Should be called on page unload or when resetting the application
     */
    cleanup() {
        // Clear all timers
        this._timers.forEach(id => window.clearTimeout(id));
        this._timers.clear();

        // Clear all intervals
        this._intervals.forEach(id => window.clearInterval(id));
        this._intervals.clear();

        // Remove all event listeners
        this._listeners.forEach((listeners, element) => {
            listeners.forEach(({ event, handler, options }) => {
                element.removeEventListener(event, handler, options);
            });
        });
        this._listeners.clear();

        console.log('[资源管理] 所有资源已清理');
    }
};
