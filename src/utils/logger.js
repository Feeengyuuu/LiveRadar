/**
 * ====================================================================
 * Unified Logger System
 * ====================================================================
 *
 * Centralized logging with:
 * - Log levels (DEBUG, INFO, WARN, ERROR)
 * - Module prefixes for easy filtering
 * - Production mode auto-disable
 * - Performance timing utilities
 * - Grouped logging for related operations
 *
 * Usage:
 * ```javascript
 * import { Logger } from './utils/logger.js';
 * const log = Logger.create('ModuleName');
 *
 * log.debug('Debug message');
 * log.info('Info message');
 * log.warn('Warning message');
 * log.error('Error message', errorObject);
 * log.time('operationName');
 * log.timeEnd('operationName');
 * ```
 */

import { APP_CONFIG } from '../config/constants.js';

/**
 * Log levels enumeration
 * @readonly
 * @enum {number}
 */
export const LogLevel = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
    SILENT: 4
};

/**
 * Global logger configuration
 */
const LoggerConfig = {
    level: APP_CONFIG.DEBUG.ENABLED ? LogLevel.DEBUG : LogLevel.WARN,
    enableTimestamps: false,
    enableModuleColors: true,
    maxLogHistory: 100,

    // Module-specific log levels (override global)
    moduleOverrides: {
        // 'Network': LogLevel.DEBUG,
        // 'Renderer': LogLevel.INFO,
    }
};

/**
 * Color palette for module prefixes (for console styling)
 */
const MODULE_COLORS = {
    State: '#4CAF50',
    Network: '#2196F3',
    Renderer: '#FF9800',
    API: '#9C27B0',
    Storage: '#00BCD4',
    UI: '#E91E63',
    Audio: '#795548',
    Snow: '#607D8B',
    Proxy: '#FF5722',
    Bilibili: '#FB7299',
    Douyu: '#FF5D23',
    Twitch: '#9146FF',
    Kick: '#53FC18',
    Default: '#9E9E9E'
};

/**
 * Log history for debugging
 * @type {Array<{timestamp: number, level: string, module: string, message: string, data?: any}>}
 */
const logHistory = [];

/**
 * Performance timing storage
 * @type {Map<string, number>}
 */
const timings = new Map();

/**
 * Get color for module
 * @param {string} module - Module name
 * @returns {string} Color hex code
 */
function getModuleColor(module) {
    return MODULE_COLORS[module] || MODULE_COLORS.Default;
}

/**
 * Format log prefix with module name
 * @param {string} module - Module name
 * @param {string} level - Log level name
 * @returns {Array} Console formatting arguments
 */
function formatPrefix(module, level) {
    if (!LoggerConfig.enableModuleColors) {
        return [`[${module}]`];
    }

    const color = getModuleColor(module);
    const levelColors = {
        DEBUG: '#9E9E9E',
        INFO: '#2196F3',
        WARN: '#FF9800',
        ERROR: '#F44336'
    };

    return [
        `%c[${module}]`,
        `color: ${color}; font-weight: bold;`
    ];
}

/**
 * Add entry to log history
 * @param {string} level - Log level
 * @param {string} module - Module name
 * @param {string} message - Log message
 * @param {any} [data] - Additional data
 */
function addToHistory(level, module, message, data) {
    logHistory.push({
        timestamp: Date.now(),
        level,
        module,
        message,
        data
    });

    // Trim history if too long
    if (logHistory.length > LoggerConfig.maxLogHistory) {
        logHistory.shift();
    }
}

/**
 * Check if logging should occur for given level and module
 * @param {number} level - Log level
 * @param {string} module - Module name
 * @returns {boolean} Whether to log
 */
function shouldLog(level, module) {
    const moduleLevel = LoggerConfig.moduleOverrides[module];
    const effectiveLevel = moduleLevel !== undefined ? moduleLevel : LoggerConfig.level;
    return level >= effectiveLevel;
}

/**
 * Logger factory - creates a module-specific logger instance
 */
export const Logger = {
    /**
     * Create a logger instance for a specific module
     * @param {string} moduleName - Name of the module
     * @returns {Object} Logger instance with debug, info, warn, error methods
     */
    create(moduleName) {
        return {
            /**
             * Log debug message
             * @param {string} message - Log message
             * @param {...any} args - Additional arguments
             */
            debug(message, ...args) {
                if (!shouldLog(LogLevel.DEBUG, moduleName)) return;
                const prefix = formatPrefix(moduleName, 'DEBUG');
                console.log(...prefix, message, ...args);
                addToHistory('DEBUG', moduleName, message, args.length ? args : undefined);
            },

            /**
             * Log info message
             * @param {string} message - Log message
             * @param {...any} args - Additional arguments
             */
            info(message, ...args) {
                if (!shouldLog(LogLevel.INFO, moduleName)) return;
                const prefix = formatPrefix(moduleName, 'INFO');
                console.log(...prefix, message, ...args);
                addToHistory('INFO', moduleName, message, args.length ? args : undefined);
            },

            /**
             * Log warning message
             * @param {string} message - Log message
             * @param {...any} args - Additional arguments
             */
            warn(message, ...args) {
                if (!shouldLog(LogLevel.WARN, moduleName)) return;
                const prefix = formatPrefix(moduleName, 'WARN');
                console.warn(...prefix, message, ...args);
                addToHistory('WARN', moduleName, message, args.length ? args : undefined);
            },

            /**
             * Log error message
             * @param {string} message - Log message
             * @param {...any} args - Additional arguments
             */
            error(message, ...args) {
                if (!shouldLog(LogLevel.ERROR, moduleName)) return;
                const prefix = formatPrefix(moduleName, 'ERROR');
                console.error(...prefix, message, ...args);
                addToHistory('ERROR', moduleName, message, args.length ? args : undefined);
            },

            /**
             * Start a timer for performance measurement
             * @param {string} label - Timer label
             */
            time(label) {
                if (!shouldLog(LogLevel.DEBUG, moduleName)) return;
                const key = `${moduleName}:${label}`;
                timings.set(key, performance.now());
            },

            /**
             * End timer and log duration
             * @param {string} label - Timer label
             * @returns {number} Duration in milliseconds
             */
            timeEnd(label) {
                const key = `${moduleName}:${label}`;
                const start = timings.get(key);
                if (start === undefined) {
                    this.warn(`Timer "${label}" not found`);
                    return 0;
                }

                const duration = performance.now() - start;
                timings.delete(key);

                if (shouldLog(LogLevel.DEBUG, moduleName)) {
                    const prefix = formatPrefix(moduleName, 'DEBUG');
                    console.log(...prefix, `${label}: ${duration.toFixed(2)}ms`);
                }

                return duration;
            },

            /**
             * Create a grouped log section
             * @param {string} label - Group label
             * @param {Function} fn - Function to execute within group
             */
            group(label, fn) {
                if (!shouldLog(LogLevel.DEBUG, moduleName)) {
                    fn();
                    return;
                }

                const prefix = formatPrefix(moduleName, 'DEBUG');
                console.groupCollapsed(...prefix, label);
                try {
                    fn();
                } finally {
                    console.groupEnd();
                }
            },

            /**
             * Log a table of data
             * @param {Array|Object} data - Data to display as table
             * @param {string} [label] - Optional label
             */
            table(data, label) {
                if (!shouldLog(LogLevel.DEBUG, moduleName)) return;
                if (label) {
                    const prefix = formatPrefix(moduleName, 'DEBUG');
                    console.log(...prefix, label);
                }
                console.table(data);
            }
        };
    },

    /**
     * Set global log level
     * @param {number} level - Log level from LogLevel enum
     */
    setLevel(level) {
        LoggerConfig.level = level;
    },

    /**
     * Set module-specific log level
     * @param {string} module - Module name
     * @param {number} level - Log level from LogLevel enum
     */
    setModuleLevel(module, level) {
        LoggerConfig.moduleOverrides[module] = level;
    },

    /**
     * Get log history
     * @returns {Array} Log history array
     */
    getHistory() {
        return [...logHistory];
    },

    /**
     * Clear log history
     */
    clearHistory() {
        logHistory.length = 0;
    },

    /**
     * Export log history as JSON string
     * @returns {string} JSON formatted log history
     */
    exportHistory() {
        return JSON.stringify(logHistory, null, 2);
    }
};

// Export default logger for quick usage
export const log = Logger.create('App');

export default Logger;
