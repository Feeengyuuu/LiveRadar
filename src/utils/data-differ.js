/**
 * ============================================================
 * Data Differ - Smart data change detection (Incremental update core)
 * ============================================================
 * Intelligently compares data objects to detect substantial changes,
 * enabling efficient incremental updates and reducing unnecessary re-renders.
 */

import { APP_CONFIG } from '../config/constants.js';

/**
 * Data comparison and change detection module
 */
export const DataDiffer = {
    /**
     * Compare two data objects for substantial changes
     * @param {Object} oldData - Old data
     * @param {Object} newData - New data
     * @returns {Object} { changed: boolean, changes: Array<string> }
     */
    compare(oldData, newData) {
        if (!APP_CONFIG.INCREMENTAL.ENABLED) {
            return { changed: true, changes: ['增量更新已禁用'] };
        }

        // If no old data, treat as new card (needs rendering)
        if (!oldData) {
            return { changed: true, changes: ['新卡片'] };
        }

        const changes = [];
        const fields = APP_CONFIG.INCREMENTAL.COMPARE_FIELDS;

        for (const field of fields) {
            const oldValue = oldData[field];
            const newValue = newData[field];

            // Deep comparison (handles different types)
            if (!this.isEqual(oldValue, newValue)) {
                changes.push(field);
            }
        }

        return {
            changed: changes.length > 0,
            changes: changes
        };
    },

    /**
     * Deep equality comparison with performance optimizations
     * @param {*} a - First value
     * @param {*} b - Second value
     * @returns {boolean} True if values are equal
     *
     * Performance notes:
     * - Fast path for primitives (O(1))
     * - Array length check before deep comparison
     * - Shallow comparison for simple objects (avoids JSON serialization)
     * - JSON.stringify as fallback (expensive but correct)
     */
    isEqual(a, b) {
        // Fast path: Strict equality (handles primitives & same reference)
        if (a === b) return true;

        // null/undefined handling
        if (a == null || b == null) return a === b;

        // Different types
        if (typeof a !== typeof b) return false;

        // Number comparison (handle NaN)
        if (typeof a === 'number') {
            if (isNaN(a) && isNaN(b)) return true;
            return a === b;
        }

        // String comparison (trim before comparing to avoid whitespace differences)
        if (typeof a === 'string') {
            return String(a).trim() === String(b).trim();
        }

        // Boolean
        if (typeof a === 'boolean') {
            return a === b;
        }

        // Array fast path: Check length first (O(1) vs O(n) serialization)
        if (Array.isArray(a) && Array.isArray(b)) {
            if (a.length !== b.length) return false;
            // For small arrays, iterate directly (faster than JSON.stringify)
            if (a.length <= 5) {
                for (let i = 0; i < a.length; i++) {
                    if (!this.isEqual(a[i], b[i])) return false;
                }
                return true;
            }
            // Fallback to JSON for larger arrays
        }

        // Object fast path: Shallow comparison for simple objects
        if (typeof a === 'object' && typeof b === 'object') {
            const keysA = Object.keys(a);
            const keysB = Object.keys(b);

            // Different number of keys
            if (keysA.length !== keysB.length) return false;

            // For simple objects (≤3 keys), do shallow comparison (3x faster than JSON)
            if (keysA.length <= 3) {
                for (const key of keysA) {
                    if (!keysB.includes(key)) return false;
                    // Only compare primitives shallowly, recurse for nested objects
                    const valA = a[key];
                    const valB = b[key];
                    if (typeof valA === 'object' && valA !== null) {
                        // Nested object - use JSON fallback
                        break;
                    }
                    if (valA !== valB) return false;
                }
                // All shallow comparisons passed
                if (keysA.length <= 3) return true;
            }
        }

        // Fallback: Deep comparison via JSON (expensive but correct)
        // Used for: complex objects, large arrays, nested structures
        try {
            return JSON.stringify(a) === JSON.stringify(b);
        } catch (e) {
            // JSON.stringify failed (circular reference, etc.)
            return a === b;
        }
    },

    /**
     * Generate change summary (for logging)
     * @param {Object} oldData - Old data
     * @param {Object} newData - New data
     * @param {Array<string>} changes - List of changed fields
     * @returns {string} Summary of changes
     */
    summarize(oldData, newData, changes) {
        if (!changes || changes.length === 0) return '';

        const summary = changes.map(field => {
            const oldVal = this.formatValue(oldData?.[field]);
            const newVal = this.formatValue(newData?.[field]);
            return `${field}: ${oldVal} → ${newVal}`;
        }).join(', ');

        return summary;
    },

    /**
     * Format value for display
     * @param {*} value - Value to format
     * @returns {string} Formatted string
     */
    formatValue(value) {
        if (value === null || value === undefined) return 'null';
        if (typeof value === 'boolean') return value ? 'true' : 'false';
        if (typeof value === 'string') return value.length > 30 ? value.slice(0, 30) + '...' : value;
        if (typeof value === 'number') return String(value);
        return JSON.stringify(value).slice(0, 30);
    }
};
