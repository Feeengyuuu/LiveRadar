/**
 * ====================================================================
 * Viewport Tracker - Performance-Optimized Viewport Detection
 * ====================================================================
 *
 * Uses IntersectionObserver to track element visibility in viewport.
 * Replaces expensive getBoundingClientRect() calls with async tracking.
 *
 * Performance Benefits:
 * - Eliminates forced synchronous layout (reflow)
 * - Reduces DOM queries from O(n) per refresh to O(1) lookup
 * - Asynchronous updates don't block main thread
 * - Automatic tracking of viewport changes
 *
 * Usage:
 * ```javascript
 * import { viewportTracker } from './viewport-tracker.js';
 *
 * // Register element for tracking
 * viewportTracker.observe(element);
 *
 * // Check visibility (O(1) operation, no DOM query)
 * const isVisible = viewportTracker.isInViewport(element.id);
 *
 * // Unregister when element is removed
 * viewportTracker.unobserve(element);
 * ```
 *
 * @module utils/viewport-tracker
 */

/**
 * ViewportTracker class
 * Manages IntersectionObserver for efficient viewport tracking
 */
class ViewportTracker {
    constructor() {
        /**
         * Map of element IDs to their visibility status
         * @type {Map<string, boolean>}
         */
        this.visibilityMap = new Map();

        /**
         * IntersectionObserver instance
         * @type {IntersectionObserver|null}
         */
        this.observer = null;

        /**
         * Initialization flag
         * @type {boolean}
         */
        this.initialized = false;

        // Initialize observer
        this.init();
    }

    /**
     * Initialize IntersectionObserver
     */
    init() {
        // Check for IntersectionObserver support
        if (!('IntersectionObserver' in window)) {
            console.warn('[ViewportTracker] IntersectionObserver not supported');
            this.initialized = false;
            return;
        }

        try {
            this.observer = new IntersectionObserver(
                (entries) => {
                    entries.forEach(entry => {
                        const elementId = entry.target.id;
                        if (elementId) {
                            // Update visibility status
                            this.visibilityMap.set(elementId, entry.isIntersecting);
                        }
                    });
                },
                {
                    root: null, // viewport
                    rootMargin: '0px', // No margin
                    threshold: 0.01 // Trigger when 1% visible
                }
            );

            this.initialized = true;
            console.log('[ViewportTracker] Initialized successfully');
        } catch (error) {
            console.error('[ViewportTracker] Initialization failed:', error);
            this.initialized = false;
        }
    }

    /**
     * Register element for viewport tracking
     * @param {HTMLElement} element - Element to track
     */
    observe(element) {
        if (!this.initialized || !this.observer || !element) {
            return;
        }

        // Start observing
        this.observer.observe(element);

        // Initialize with false until first intersection callback
        if (element.id && !this.visibilityMap.has(element.id)) {
            this.visibilityMap.set(element.id, false);
        }
    }

    /**
     * Unregister element from viewport tracking
     * @param {HTMLElement} element - Element to stop tracking
     */
    unobserve(element) {
        if (!this.initialized || !this.observer || !element) {
            return;
        }

        // Stop observing
        this.observer.unobserve(element);

        // Clean up visibility map
        if (element.id) {
            this.visibilityMap.delete(element.id);
        }
    }

    /**
     * Check if element is in viewport
     * O(1) map lookup - no DOM query
     * @param {string} elementId - Element ID
     * @returns {boolean} True if element is visible in viewport
     */
    isInViewport(elementId) {
        if (!this.initialized) {
            // Fallback: assume not visible if observer not supported
            return false;
        }

        return this.visibilityMap.get(elementId) || false;
    }

    /**
     * Get all visible element IDs
     * @returns {string[]} Array of visible element IDs
     */
    getVisibleElements() {
        const visible = [];
        this.visibilityMap.forEach((isVisible, elementId) => {
            if (isVisible) {
                visible.push(elementId);
            }
        });
        return visible;
    }

    /**
     * Clear all tracked elements
     */
    clear() {
        if (this.observer) {
            this.observer.disconnect();
        }
        this.visibilityMap.clear();
        console.log('[ViewportTracker] Cleared all tracked elements');
    }

    /**
     * Get tracking statistics
     * @returns {Object} Statistics object
     */
    getStats() {
        const total = this.visibilityMap.size;
        const visible = this.getVisibleElements().length;

        return {
            total,
            visible,
            hidden: total - visible,
            initialized: this.initialized
        };
    }
}

// Create singleton instance
export const viewportTracker = new ViewportTracker();

// Expose for debugging
if (typeof window !== 'undefined') {
    window.__viewportTracker = viewportTracker;
}
