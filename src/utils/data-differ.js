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
     * Deep equality comparison
     * @param {*} a - First value
     * @param {*} b - Second value
     * @returns {boolean} True if values are equal
     */
    isEqual(a, b) {
        // Strict equality
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

        // Other types (objects, arrays) use JSON comparison
        try {
            return JSON.stringify(a) === JSON.stringify(b);
        } catch (e) {
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
