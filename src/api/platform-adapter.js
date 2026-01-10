/**
 * ====================================================================
 * Platform Adapter Pattern
 * ====================================================================
 *
 * Base class and factory for platform-specific API integrations.
 * Reduces code duplication and provides consistent interface.
 *
 * Features:
 * - Common data structure for all platforms
 * - Shared error handling and retry logic
 * - Consistent response normalization
 * - Avatar and metadata handling
 *
 * @module api/platform-adapter
 */

import { Logger } from '../utils/logger.js';
import { ErrorHandler, retry, isRetryableError } from '../utils/error-handler.js';
import { fetchWithProxy, fetchQuick } from './proxy-manager.js';
import { APP_CONFIG } from '../config/constants.js';
import { getDouyuStatus, getBilibiliStatus, getTwitchStatus, getKickStatus } from './platform-sniffers.js';

const log = Logger.create('PlatformAdapter');

// ====================================================================
// Type Definitions (JSDoc)
// ====================================================================

/**
 * @typedef {Object} RoomStatus
 * @property {boolean} isLive - Whether the room is live
 * @property {boolean} isReplay - Whether playing a replay/video loop
 * @property {string} title - Stream title
 * @property {string} owner - Streamer name
 * @property {string} cover - Cover/thumbnail URL
 * @property {string} avatar - Streamer avatar URL
 * @property {number} heatValue - Viewer count or popularity value
 * @property {boolean} isError - Whether an error occurred
 * @property {number|null} startTime - Stream start timestamp (ms)
 * @property {number} [lastTitleUpdate] - Last title update timestamp
 */

/**
 * @typedef {Object} FetchOptions
 * @property {boolean} [fetchAvatar=true] - Whether to fetch avatar
 * @property {number} [timeout] - Request timeout in ms
 */

// ====================================================================
// Base Platform Adapter
// ====================================================================

/**
 * Base class for platform adapters
 * @abstract
 */
export class BasePlatformAdapter {
    /**
     * @param {string} platform - Platform identifier
     */
    constructor(platform) {
        this.platform = platform;
        this.log = Logger.create(this.constructor.name);
    }

    /**
     * Create default response object
     * @param {string} id - Room/channel ID
     * @param {Object} [prevData] - Previous cached data
     * @returns {RoomStatus} Default response
     */
    createDefaultResponse(id, prevData = {}) {
        return {
            isLive: false,
            isReplay: false,
            title: prevData?.title || '',
            owner: prevData?.owner || id,
            cover: prevData?.cover || '',
            avatar: prevData?.avatar || '',
            heatValue: 0,
            isError: false,
            startTime: null
        };
    }

    /**
     * Add timestamp to URL for cache busting (only when live)
     * @param {string} url - Base URL
     * @param {boolean} isLive - Whether stream is live
     * @returns {string} URL with optional timestamp
     */
    addTimestamp(url, isLive) {
        if (!url) return url;
        return isLive ? `${url}?t=${Date.now()}` : url;
    }

    /**
     * Fetch room/channel status
     * @abstract
     * @param {string} id - Room/channel ID
     * @param {FetchOptions} [options] - Fetch options
     * @param {Object} [prevData] - Previous cached data
     * @returns {Promise<RoomStatus|null>} Status or null on error
     */
    async getStatus(id, options = {}, prevData = null) {
        throw new Error('getStatus must be implemented by subclass');
    }

    /**
     * Validate room/channel ID
     * @param {string} id - ID to validate
     * @returns {boolean} Whether ID is valid
     */
    validateId(id) {
        return id && typeof id === 'string' && id.trim().length > 0;
    }

    /**
     * Normalize viewer count
     * @param {*} value - Raw viewer value
     * @returns {number} Normalized count
     */
    normalizeViewerCount(value) {
        if (typeof value === 'number') return Math.max(0, Math.floor(value));
        if (typeof value === 'string') {
            const parsed = parseInt(value.replace(/,/g, ''), 10);
            return isNaN(parsed) ? 0 : Math.max(0, parsed);
        }
        return 0;
    }
}

// ====================================================================
// Platform Registry
// ====================================================================

/**
 * Registry of platform adapters
 * @type {Map<string, BasePlatformAdapter>}
 */
const adapterRegistry = new Map();

/**
 * Register a platform adapter
 * @param {string} platform - Platform identifier
 * @param {BasePlatformAdapter} adapter - Adapter instance
 */
export function registerAdapter(platform, adapter) {
    adapterRegistry.set(platform, adapter);
    log.debug(`Registered adapter for platform: ${platform}`);
}

/**
 * Get adapter for a platform
 * @param {string} platform - Platform identifier
 * @returns {BasePlatformAdapter|null} Adapter or null if not found
 */
export function getAdapter(platform) {
    return adapterRegistry.get(platform) || null;
}

/**
 * Get all registered platforms
 * @returns {string[]} Array of platform identifiers
 */
export function getRegisteredPlatforms() {
    return Array.from(adapterRegistry.keys());
}

// ====================================================================
// Default Adapters (Wrapper around existing sniffers)
// ====================================================================

class DouyuAdapter extends BasePlatformAdapter {
    constructor() { super('douyu'); }
    async getStatus(id, options = {}, prevData = null) {
        const fetchAvatar = options.fetchAvatar !== false;
        return getDouyuStatus(id, fetchAvatar, prevData);
    }
}

class BilibiliAdapter extends BasePlatformAdapter {
    constructor() { super('bilibili'); }
    async getStatus(id, options = {}, prevData = null) {
        const fetchAvatar = options.fetchAvatar !== false;
        return getBilibiliStatus(id, fetchAvatar, prevData);
    }
}

class TwitchAdapter extends BasePlatformAdapter {
    constructor() { super('twitch'); }
    async getStatus(id, options = {}, prevData = null) {
        const fetchAvatar = options.fetchAvatar !== false;
        return getTwitchStatus(id, fetchAvatar, prevData);
    }
}

class KickAdapter extends BasePlatformAdapter {
    constructor() { super('kick'); }
    async getStatus(id, options = {}, prevData = null) {
        const fetchAvatar = options.fetchAvatar !== false;
        return getKickStatus(id, fetchAvatar, prevData);
    }
}

/**
 * Register default platform adapters (once)
 */
export function registerDefaultAdapters() {
    if (!getAdapter('douyu')) registerAdapter('douyu', new DouyuAdapter());
    if (!getAdapter('bilibili')) registerAdapter('bilibili', new BilibiliAdapter());
    if (!getAdapter('twitch')) registerAdapter('twitch', new TwitchAdapter());
    if (!getAdapter('kick')) registerAdapter('kick', new KickAdapter());
}

// ====================================================================
// Unified Fetch Function
// ====================================================================

/**
 * Fetch status for any platform
 * @param {string} platform - Platform identifier
 * @param {string} id - Room/channel ID
 * @param {FetchOptions} [options] - Fetch options
 * @param {Object} [prevData] - Previous cached data
 * @returns {Promise<RoomStatus|null>} Status or null on error
 */
export async function fetchPlatformStatus(platform, id, options = {}, prevData = null) {
    const adapter = getAdapter(platform);

    if (!adapter) {
        log.error(`No adapter registered for platform: ${platform}`);
        return null;
    }

    if (!adapter.validateId(id)) {
        log.warn(`Invalid ID for ${platform}: ${id}`);
        return null;
    }

    try {
        return await adapter.getStatus(id, options, prevData);
    } catch (error) {
        ErrorHandler.log(error, `${platform}:${id}`);
        return null;
    }
}

// ====================================================================
// Shared Utilities for Adapters
// ====================================================================

/**
 * Shared utilities for platform adapters
 */
export const AdapterUtils = {
    /**
     * Fetch JSON with retry logic
     * @param {string} url - URL to fetch
     * @param {Object} options - Options
     * @returns {Promise<Object|null>} JSON data or null
     */
    async fetchJSON(url, options = {}) {
        const { timeout = 8000, useProxy = true, maxRetries = 1 } = options;

        try {
            if (useProxy) {
                return await fetchWithProxy(url, false, timeout);
            }

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);

            const response = await fetch(url, { signal: controller.signal });
            clearTimeout(timeoutId);

            if (!response.ok) return null;
            return await response.json();
        } catch (error) {
            if (maxRetries > 0 && isRetryableError(error)) {
                return this.fetchJSON(url, { ...options, maxRetries: maxRetries - 1 });
            }
            return null;
        }
    },

    /**
     * Fetch text with timeout
     * @param {string} url - URL to fetch
     * @param {number} [timeout=6000] - Timeout in ms
     * @returns {Promise<string|null>} Text or null
     */
    async fetchText(url, timeout = 6000) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);

            const response = await fetch(url, { signal: controller.signal });
            clearTimeout(timeoutId);

            if (!response.ok) return null;
            return await response.text();
        } catch (error) {
            return null;
        }
    },

    /**
     * Parse timestamp to milliseconds
     * @param {*} value - Timestamp value (seconds, ms, or date string)
     * @returns {number|null} Timestamp in ms or null
     */
    parseTimestamp(value) {
        if (!value) return null;

        // Already in milliseconds (> year 2000)
        if (typeof value === 'number' && value > 946684800000) {
            return value;
        }

        // Unix timestamp in seconds
        if (typeof value === 'number' && value > 946684800) {
            return value * 1000;
        }

        // Date string
        if (typeof value === 'string') {
            const date = new Date(value.replace(' ', 'T'));
            return isNaN(date.getTime()) ? null : date.getTime();
        }

        return null;
    },

    /**
     * Safe get nested property
     * @param {Object} obj - Object to traverse
     * @param {string} path - Dot-separated path
     * @param {*} [defaultValue] - Default if not found
     * @returns {*} Value or default
     */
    get(obj, path, defaultValue = undefined) {
        const keys = path.split('.');
        let result = obj;

        for (const key of keys) {
            if (result === null || result === undefined) {
                return defaultValue;
            }
            result = result[key];
        }

        return result === undefined ? defaultValue : result;
    }
};

// ====================================================================
// Export
// ====================================================================

export default {
    BasePlatformAdapter,
    registerAdapter,
    getAdapter,
    getRegisteredPlatforms,
    fetchPlatformStatus,
    AdapterUtils
};
