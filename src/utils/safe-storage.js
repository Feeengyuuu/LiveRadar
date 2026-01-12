/**
 * ====================================================================
 * SafeStorage - Enhanced localStorage Wrapper
 * ====================================================================
 *
 * Features:
 * - iOS-compatible with quota error handling
 * - Automatic JSON serialization
 * - Memory cache fallback when localStorage fails
 * - Storage quota management with cleanup strategies
 * - Key priority system for data retention
 * - Storage usage monitoring
 *
 * @module utils/safe-storage
 */

// ====================================================================
// Configuration
// ====================================================================

/**
 * Storage configuration
 */
const CONFIG = {
    // Key prefix for app data
    PREFIX: 'pro_',

    // Maximum storage usage (5MB default for localStorage)
    MAX_STORAGE_BYTES: 5 * 1024 * 1024,

    // Warning threshold (warn when 80% full)
    WARNING_THRESHOLD: 0.8,

    // Keys that should never be auto-deleted (in order of priority)
    PROTECTED_KEYS: [
        'pro_monitored_rooms',   // User's room list - most important
        'pro_notify_enabled',    // User preferences
        'pro_auto_refresh',
        'pro_keepalive_enabled',
        'pro_snow_enabled',
        'pro_did'                // Device ID
    ],

    // Keys that can be safely cleared when storage is full
    CLEARABLE_KEYS: [
        'pro_room_cache',        // Can be rebuilt
        'pro_proxy_stats',       // Can be rebuilt
        'pro_search_history'     // Less important
    ]
};

// ====================================================================
// Simple Data Obfuscation (for sensitive data)
// ====================================================================

/**
 * Keys that should be obfuscated in storage
 */
const OBFUSCATED_KEYS = [
    'pro_did',           // Device ID
    'pro_proxy_stats'    // Proxy usage stats
];

/**
 * Simple obfuscation using Base64 + character reversal
 * NOTE: This is NOT encryption, just basic obfuscation to prevent casual inspection
 * @param {string} data - Data to obfuscate
 * @returns {string} Obfuscated data
 */
function obfuscate(data) {
    try {
        // Base64 encode + reverse string
        const encoded = btoa(encodeURIComponent(data));
        return encoded.split('').reverse().join('');
    } catch (e) {
        console.warn('[SafeStorage] Obfuscation failed, storing plain text');
        return data;
    }
}

/**
 * Deobfuscate data
 * @param {string} data - Obfuscated data
 * @returns {string} Original data
 */
function deobfuscate(data) {
    try {
        // Reverse string + Base64 decode
        const reversed = data.split('').reverse().join('');
        return decodeURIComponent(atob(reversed));
    } catch (e) {
        // If deobfuscation fails, might be plain text from old version
        return data;
    }
}

/**
 * Check if a key should be obfuscated
 * @param {string} key - Storage key
 * @returns {boolean} True if should be obfuscated
 */
function shouldObfuscate(key) {
    return OBFUSCATED_KEYS.includes(key);
}

// ====================================================================
// Memory Cache (Fallback)
// ====================================================================

/**
 * In-memory cache for when localStorage is unavailable
 * @type {Map<string, string>}
 */
const memoryCache = new Map();

/**
 * Flag indicating if we're using memory fallback
 * @type {boolean}
 */
let usingMemoryFallback = false;

// ====================================================================
// Storage Availability Check
// ====================================================================

/**
 * Check if localStorage is available
 * @returns {boolean} True if available
 */
function isLocalStorageAvailable() {
    try {
        const testKey = '__storage_test__';
        localStorage.setItem(testKey, testKey);
        localStorage.removeItem(testKey);
        return true;
    } catch (e) {
        return false;
    }
}

// Initialize availability check
const localStorageAvailable = isLocalStorageAvailable();

if (!localStorageAvailable) {
    console.warn('[SafeStorage] localStorage not available, using memory fallback');
    usingMemoryFallback = true;
}

// ====================================================================
// Quota Management
// ====================================================================

/**
 * Estimate current storage usage
 * @returns {{used: number, total: number, percentage: number}} Usage stats
 */
function getStorageUsage() {
    if (usingMemoryFallback) {
        let used = 0;
        memoryCache.forEach((value) => {
            used += value.length * 2; // UTF-16 encoding
        });
        return { used, total: CONFIG.MAX_STORAGE_BYTES, percentage: used / CONFIG.MAX_STORAGE_BYTES };
    }

    let used = 0;
    try {
        for (const key in localStorage) {
            if (localStorage.hasOwnProperty(key)) {
                used += (localStorage[key].length + key.length) * 2;
            }
        }
    } catch (e) {
        // Ignore errors
    }

    return {
        used,
        total: CONFIG.MAX_STORAGE_BYTES,
        percentage: used / CONFIG.MAX_STORAGE_BYTES
    };
}

/**
 * Check if storage is near capacity
 * @returns {boolean} True if above warning threshold
 */
function isStorageNearFull() {
    const usage = getStorageUsage();
    return usage.percentage >= CONFIG.WARNING_THRESHOLD;
}

/**
 * Clean up storage to make room for new data
 * @param {number} [bytesNeeded=0] - Minimum bytes to free
 * @returns {number} Bytes freed
 */
function cleanupStorage(bytesNeeded = 0) {
    let bytesFreed = 0;

    // First, try to clear clearable keys
    for (const key of CONFIG.CLEARABLE_KEYS) {
        try {
            const storage = usingMemoryFallback ? memoryCache : localStorage;
            const value = usingMemoryFallback ? memoryCache.get(key) : localStorage.getItem(key);

            if (value) {
                const size = (key.length + value.length) * 2;

                if (usingMemoryFallback) {
                    memoryCache.delete(key);
                } else {
                    localStorage.removeItem(key);
                }

                bytesFreed += size;
                console.log(`[SafeStorage] Cleared ${key} (${(size / 1024).toFixed(1)}KB)`);

                if (bytesFreed >= bytesNeeded) {
                    break;
                }
            }
        } catch (e) {
            // Continue to next key
        }
    }

    // If still not enough, try to compress cache data
    if (bytesFreed < bytesNeeded) {
        bytesFreed += compressCacheData();
    }

    return bytesFreed;
}

/**
 * Compress cache data by removing old entries
 * @returns {number} Bytes freed
 */
function compressCacheData() {
    let bytesFreed = 0;

    try {
        const cacheKey = 'pro_room_cache';
        const cache = SafeStorage.getJSON(cacheKey, {});

        if (Object.keys(cache).length > 0) {
            const originalSize = JSON.stringify(cache).length * 2;

            // Keep only essential fields for each room
            const compressedCache = {};
            for (const [key, data] of Object.entries(cache)) {
                if (data) {
                    compressedCache[key] = {
                        owner: data.owner,
                        avatar: data.avatar,
                        title: data.title,
                        cover: data.cover
                    };
                }
            }

            const newSize = JSON.stringify(compressedCache).length * 2;
            bytesFreed = originalSize - newSize;

            if (bytesFreed > 0) {
                SafeStorage.setJSON(cacheKey, compressedCache);
                console.log(`[SafeStorage] Compressed cache (freed ${(bytesFreed / 1024).toFixed(1)}KB)`);
            }
        }
    } catch (e) {
        // Ignore errors
    }

    return bytesFreed;
}

// ====================================================================
// Main SafeStorage Object
// ====================================================================

/**
 * SafeStorage - Safe localStorage wrapper
 */
const SafeStorage = {
    /**
     * Get item from storage
     * @param {string} key - Storage key
     * @param {*} [defaultValue=null] - Default value if not found
     * @returns {string|*} Stored value or default
     */
    getItem(key, defaultValue = null) {
        try {
            let value;

            if (usingMemoryFallback) {
                value = memoryCache.get(key);
            } else {
                value = localStorage.getItem(key);
            }

            if (value === null || value === undefined) {
                return defaultValue;
            }

            // Deobfuscate sensitive data
            if (shouldObfuscate(key)) {
                value = deobfuscate(value);
            }

            return value;
        } catch (e) {
            console.warn(`[SafeStorage] Read failed: ${key}`, e.message);
            return defaultValue;
        }
    },

    /**
     * Set item in storage with quota handling
     * @param {string} key - Storage key
     * @param {string} value - Value to store
     * @returns {boolean} True if successful
     */
    setItem(key, value) {
        try {
            let finalValue = String(value);

            // Obfuscate sensitive data before storing
            if (shouldObfuscate(key)) {
                finalValue = obfuscate(finalValue);
            }

            if (usingMemoryFallback) {
                memoryCache.set(key, finalValue);
                return true;
            }

            localStorage.setItem(key, finalValue);
            return true;
        } catch (e) {
            // Check if it's a quota error
            if (this.isQuotaError(e)) {
                console.warn(`[SafeStorage] Quota exceeded, attempting cleanup...`);

                // Estimate needed space
                const bytesNeeded = (key.length + String(value).length) * 2;
                cleanupStorage(bytesNeeded);

                // Retry
                try {
                    let finalValue = String(value);
                    if (shouldObfuscate(key)) {
                        finalValue = obfuscate(finalValue);
                    }
                    localStorage.setItem(key, finalValue);
                    return true;
                } catch (retryError) {
                    console.error(`[SafeStorage] Write failed after cleanup: ${key}`);

                    // Fallback to memory
                    let finalValue = String(value);
                    if (shouldObfuscate(key)) {
                        finalValue = obfuscate(finalValue);
                    }
                    memoryCache.set(key, finalValue);
                    return true;
                }
            }

            console.warn(`[SafeStorage] Write failed: ${key}`, e.message);
            return false;
        }
    },

    /**
     * Get and parse JSON from storage
     * @param {string} key - Storage key
     * @param {*} [defaultValue=null] - Default value if not found or parse fails
     * @returns {*} Parsed value or default
     */
    getJSON(key, defaultValue = null) {
        try {
            const value = this.getItem(key);
            if (value === null || value === undefined) {
                return defaultValue;
            }
            return JSON.parse(value);
        } catch (e) {
            console.warn(`[SafeStorage] JSON parse failed: ${key}`, e.message);
            return defaultValue;
        }
    },

    /**
     * Stringify and set JSON in storage
     * @param {string} key - Storage key
     * @param {*} value - Value to store (will be JSON stringified)
     * @returns {boolean} True if successful
     */
    setJSON(key, value) {
        try {
            const stringified = JSON.stringify(value);
            return this.setItem(key, stringified);
        } catch (e) {
            console.warn(`[SafeStorage] JSON stringify failed: ${key}`, e.message);
            return false;
        }
    },

    /**
     * Remove item from storage
     * @param {string} key - Storage key
     * @returns {boolean} True if successful
     */
    removeItem(key) {
        try {
            if (usingMemoryFallback) {
                memoryCache.delete(key);
            } else {
                localStorage.removeItem(key);
            }
            return true;
        } catch (e) {
            console.warn(`[SafeStorage] Remove failed: ${key}`, e.message);
            return false;
        }
    },

    /**
     * Clear all app-related storage
     * @param {boolean} [includeProtected=false] - Also clear protected keys
     * @returns {boolean} True if successful
     */
    clear(includeProtected = false) {
        try {
            if (usingMemoryFallback) {
                if (includeProtected) {
                    memoryCache.clear();
                } else {
                    for (const key of memoryCache.keys()) {
                        if (!CONFIG.PROTECTED_KEYS.includes(key)) {
                            memoryCache.delete(key);
                        }
                    }
                }
                return true;
            }

            const keysToRemove = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key?.startsWith(CONFIG.PREFIX)) {
                    if (includeProtected || !CONFIG.PROTECTED_KEYS.includes(key)) {
                        keysToRemove.push(key);
                    }
                }
            }

            keysToRemove.forEach(key => localStorage.removeItem(key));
            return true;
        } catch (e) {
            console.warn('[SafeStorage] Clear failed:', e.message);
            return false;
        }
    },

    /**
     * Check if error is a quota exceeded error
     * @param {Error} error - Error to check
     * @returns {boolean} True if quota error
     */
    isQuotaError(error) {
        return (
            error instanceof DOMException && (
                error.code === 22 ||                    // Legacy code
                error.code === 1014 ||                  // Firefox
                error.name === 'QuotaExceededError' ||  // Modern browsers
                error.name === 'NS_ERROR_DOM_QUOTA_REACHED'  // Firefox
            )
        );
    },

    /**
     * Get storage usage statistics
     * @returns {{used: number, total: number, percentage: number, usedMB: string, isNearFull: boolean}}
     */
    getUsage() {
        const usage = getStorageUsage();
        return {
            ...usage,
            usedMB: (usage.used / 1024 / 1024).toFixed(2),
            isNearFull: usage.percentage >= CONFIG.WARNING_THRESHOLD
        };
    },

    /**
     * Check if using memory fallback
     * @returns {boolean} True if using memory cache
     */
    isUsingMemoryFallback() {
        return usingMemoryFallback;
    },

    /**
     * Get all keys stored by this app
     * @returns {string[]} Array of keys
     */
    getKeys() {
        const keys = [];

        if (usingMemoryFallback) {
            for (const key of memoryCache.keys()) {
                keys.push(key);
            }
        } else {
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key?.startsWith(CONFIG.PREFIX)) {
                    keys.push(key);
                }
            }
        }

        return keys;
    },

    /**
     * Export all data as JSON (for backup)
     * @returns {Object} All stored data
     */
    exportData() {
        const data = {};
        const keys = this.getKeys();

        keys.forEach(key => {
            try {
                const value = this.getJSON(key);
                data[key] = value;
            } catch (e) {
                data[key] = this.getItem(key);
            }
        });

        return data;
    },

    /**
     * Import data from backup
     * @param {Object} data - Data to import
     * @returns {boolean} True if successful
     */
    importData(data) {
        try {
            for (const [key, value] of Object.entries(data)) {
                if (typeof value === 'object') {
                    this.setJSON(key, value);
                } else {
                    this.setItem(key, String(value));
                }
            }
            return true;
        } catch (e) {
            console.error('[SafeStorage] Import failed:', e.message);
            return false;
        }
    },

    /**
     * Perform storage cleanup
     * @returns {number} Bytes freed
     */
    cleanup() {
        return cleanupStorage();
    }
};

export { SafeStorage };
export default SafeStorage;
