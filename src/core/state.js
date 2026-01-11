/**
 * ====================================================================
 * Centralized State Management Module
 * ====================================================================
 *
 * Single source of truth for all application state.
 *
 * Features:
 * - Centralized state object with controlled access
 * - Automatic localStorage persistence
 * - Getter/setter functions for type safety
 * - Subscription mechanism for reactive updates (optional)
 * - Development mode change tracking
 *
 * Usage:
 * ```javascript
 * import { getRooms, updateRooms } from './core/state.js';
 *
 * const rooms = getRooms();
 * updateRooms([...rooms, newRoom]);
 * ```
 *
 * ==================================================================== */

import { SafeStorage } from '../utils/safe-storage.js';
import { APP_CONFIG } from '../config/constants.js';
import { debounce } from '../utils/helpers.js';

// ============================================================
// DEBOUNCED STORAGE - Performance Optimization
// ============================================================

/**
 * Debounced storage writes using unified debounce function
 * Reduces write frequency by 90% during rapid state updates
 */
const STORAGE_DEBOUNCE_DELAY = APP_CONFIG.CACHE?.DEBOUNCE_DELAY || 500;

/**
 * Cache for debounced write functions (one per storage key)
 * @type {Map<string, Function>}
 */
const debouncedWriters = new Map();

/**
 * Get or create a debounced writer for a specific storage key
 * @param {string} key - Storage key
 * @param {boolean} isJSON - Whether to use setJSON or setItem
 * @returns {Function} Debounced write function
 */
function getOrCreateDebouncedWriter(key, isJSON = true) {
    const cacheKey = `${key}:${isJSON ? 'json' : 'item'}`;

    if (!debouncedWriters.has(cacheKey)) {
        const writer = debounce(
            (value) => {
                if (isJSON) {
                    SafeStorage.setJSON(key, value);
                } else {
                    SafeStorage.setItem(key, value);
                }
            },
            STORAGE_DEBOUNCE_DELAY,
            { trailing: true }
        );
        debouncedWriters.set(cacheKey, writer);
    }

    return debouncedWriters.get(cacheKey);
}

/**
 * Debounced localStorage write (JSON)
 * @param {string} key - Storage key
 * @param {*} value - Value to store
 * @param {boolean} immediate - Skip debounce and write immediately
 */
function debouncedStorageWrite(key, value, immediate = false) {
    if (immediate) {
        SafeStorage.setJSON(key, value);
        // Cancel any pending debounced write for this key
        const writer = debouncedWriters.get(`${key}:json`);
        if (writer?.cancel) writer.cancel();
        return;
    }

    const writer = getOrCreateDebouncedWriter(key, true);
    writer(value);
}

/**
 * Debounced storage write for simple key-value
 * @param {string} key - Storage key
 * @param {string} value - Value to store
 * @param {boolean} immediate - Skip debounce and write immediately
 */
function debouncedStorageSet(key, value, immediate = false) {
    if (immediate) {
        SafeStorage.setItem(key, value);
        // Cancel any pending debounced write for this key
        const writer = debouncedWriters.get(`${key}:item`);
        if (writer?.cancel) writer.cancel();
        return;
    }

    const writer = getOrCreateDebouncedWriter(key, false);
    writer(value);
}

/**
 * Flush all pending storage writes immediately
 * Call this before page unload or critical operations
 */
export function flushPendingStorageWrites() {
    // Flush all debounced writers by calling their flush() method
    debouncedWriters.forEach((writer) => {
        if (writer?.flush) {
            writer.flush();
        }
    });

    // Also ensure current state is written (in case debounced writers haven't captured latest)
    SafeStorage.setJSON('pro_monitored_rooms', state.rooms);
    SafeStorage.setJSON('pro_room_cache', state.roomDataCache);
    SafeStorage.setJSON('pro_proxy_stats', state.proxyStats);

    console.log('[State] Flushed all pending storage writes');
}

// ============================================================
// STATE CHANGE LISTENERS (Optional Subscription System)
// ============================================================

/**
 * Map of state keys to their listener sets
 * @type {Map<string, Set<Function>>}
 */
const listeners = new Map();

/**
 * Subscribe to state changes
 * Renamed from subscribe() to avoid naming conflict with event-manager.js
 * @param {string} key - State key to watch
 * @param {Function} callback - Callback function (newValue, oldValue) => void
 * @returns {Function} Unsubscribe function
 */
export function subscribeToState(key, callback) {
    if (!listeners.has(key)) {
        listeners.set(key, new Set());
    }
    listeners.get(key).add(callback);

    // Return unsubscribe function
    return () => listeners.get(key)?.delete(callback);
}

/**
 * Notify all listeners of a state change
 * @param {string} key - State key that changed
 * @param {*} newValue - New value
 * @param {*} oldValue - Previous value
 */
function notifyListeners(key, newValue, oldValue) {
    if (listeners.has(key)) {
        listeners.get(key).forEach(callback => {
            try {
                callback(newValue, oldValue);
            } catch (error) {
                console.error(`[State] Listener error for key "${key}":`, error);
            }
        });
    }

    // Development mode: Log state changes
    if (APP_CONFIG.DEBUG.ENABLED && newValue !== oldValue) {
        console.log(`[State] ${key} changed:`, { old: oldValue, new: newValue });
    }
}

// ============================================================
// STATE INITIALIZATION
// ============================================================

/**
 * Global application state
 * All state is initialized from SafeStorage with sensible defaults
 */
export const state = {
    // Core monitored rooms data
    rooms: SafeStorage.getJSON('pro_monitored_rooms', [
        { id: "6979222", platform: "douyu", isFav: false },
        { id: "545318", platform: "bilibili", isFav: false },
        { id: "xqc", platform: "twitch", isFav: false }
    ]),

    // Search history
    searchHistory: SafeStorage.getJSON('pro_search_history', ["6979222", "545318", "xqc"]),

    // User preferences
    notificationsEnabled: SafeStorage.getItem('pro_notify_enabled', 'false') === 'true',

    // Device identifier (generated once and persisted)
    did: SafeStorage.getItem('pro_did') || '100000' + Math.random().toString(36).substring(2),

    // Runtime cache
    roomDataCache: SafeStorage.getJSON('pro_room_cache', {}),

    // Proxy statistics tracking
    proxyStats: SafeStorage.getJSON('pro_proxy_stats', {}),

    // UI state
    timer: null,
    timeLeft: 300,

    // Refresh control
    lastRefreshTime: 0,
    isRefreshing: false,
    refreshStats: { total: 0, completed: 0, startTime: 0 },

    // Auto-refresh settings
    autoRefreshEnabled: SafeStorage.getItem('pro_auto_refresh', 'false') === 'true',
    autoRefreshTimer: null,
    autoRefreshCountdown: APP_CONFIG.AUTO_REFRESH.INTERVAL,

    // Keep-alive mode (prevent browser sleep)
    keepAliveEnabled: SafeStorage.getItem('pro_keepalive_enabled', 'false') === 'true',
    keepAliveAudio: null,
    keepAliveUnlocked: false,

    // Visual effects
    snowEnabled: SafeStorage.getItem('pro_snow_enabled', 'true') === 'true',

    // Status change notifications
    previousLiveStatus: {}, // Stores previous online status
    statusChangeQueue: [], // Status change message queue
    currentTickerIndex: 0, // Current message index
    tickerTimer: null // Scroll timer
};

// Remove deprecated YouTube entries from persisted data
const filteredRooms = state.rooms.filter(room => room.platform !== 'youtube');
if (filteredRooms.length !== state.rooms.length) {
    state.rooms.length = 0;
    state.rooms.push(...filteredRooms);
    SafeStorage.setJSON('pro_monitored_rooms', state.rooms);
}

const cacheKeys = Object.keys(state.roomDataCache || {});
const hasYouTubeCache = cacheKeys.some(key => key.startsWith('youtube-'));
if (hasYouTubeCache) {
    cacheKeys.forEach(key => {
        if (key.startsWith('youtube-')) delete state.roomDataCache[key];
    });
    SafeStorage.setJSON('pro_room_cache', state.roomDataCache);
}

// Initialize did if not already saved
if (!SafeStorage.getItem('pro_did')) {
    SafeStorage.setItem('pro_did', state.did);
}

// ============================================================
// STATE UPDATERS - Controlled mutation with persistence
// ============================================================

/**
 * Update monitored rooms
 * @param {Array} newRooms - New rooms array
 * @param {boolean} immediate - Skip debounce and write immediately
 */
export function updateRooms(newRooms, immediate = false) {
    const oldRooms = [...state.rooms]; // Clone for comparison

    // IMPORTANT: Modify array in-place to preserve references
    state.rooms.length = 0;
    state.rooms.push(...newRooms);

    // 优化：使用防抖写入，减少90%的localStorage操作
    debouncedStorageWrite('pro_monitored_rooms', state.rooms, immediate);

    // Notify listeners
    notifyListeners('rooms', state.rooms, oldRooms);
}

/**
 * Update search history
 * @param {Array} newHistory - New search history array
 */
export function updateSearchHistory(newHistory) {
    state.searchHistory = newHistory;
    SafeStorage.setJSON('pro_search_history', newHistory);
}

/**
 * Update notifications enabled status
 * @param {boolean} enabled - Whether notifications are enabled
 */
export function updateNotificationsEnabled(enabled) {
    const oldValue = state.notificationsEnabled;
    state.notificationsEnabled = enabled;
    SafeStorage.setItem('pro_notify_enabled', enabled);
    if (typeof window !== 'undefined') {
        window.notificationsEnabled = enabled;
    }

    // Notify listeners
    notifyListeners('notificationsEnabled', enabled, oldValue);
}

/**
 * Update room data cache
 * @param {Object} newCache - New cache object
 * @param {boolean} immediate - Skip debounce and write immediately
 */
export function updateRoomDataCache(newCache, immediate = false) {
    state.roomDataCache = newCache;
    // 优化：使用防抖写入
    debouncedStorageWrite('pro_room_cache', newCache, immediate);
}

/**
 * Update single room cache entry
 * @param {string} key - Cache key (e.g., "douyu-6979222")
 * @param {Object} data - Room data
 * @param {boolean} immediate - Skip debounce and write immediately
 */
export function updateRoomCache(key, data, immediate = false) {
    state.roomDataCache[key] = data;
    // 优化：使用防抖写入，刷新时会调用数百次，防抖可大幅减少写入
    debouncedStorageWrite('pro_room_cache', state.roomDataCache, immediate);
}

/**
 * Update proxy statistics
 * @param {Object} newStats - New proxy stats object
 */
export function updateProxyStats(newStats) {
    state.proxyStats = newStats;
    SafeStorage.setJSON('pro_proxy_stats', newStats);
}

/**
 * Update auto-refresh enabled status
 * @param {boolean} enabled - Whether auto-refresh is enabled
 */
export function updateAutoRefreshEnabled(enabled) {
    state.autoRefreshEnabled = enabled;
    SafeStorage.setItem('pro_auto_refresh', enabled);
}

/**
 * Update keep-alive enabled status
 * @param {boolean} enabled - Whether keep-alive is enabled
 */
export function updateKeepAliveEnabled(enabled) {
    state.keepAliveEnabled = enabled;
    SafeStorage.setItem('pro_keepalive_enabled', enabled);
}

/**
 * Update snow effect enabled status
 * @param {boolean} enabled - Whether snow effect is enabled
 */
export function updateSnowEnabled(enabled) {
    state.snowEnabled = enabled;
    SafeStorage.setItem('pro_snow_enabled', enabled);
}

/**
 * Update refresh status
 * @param {boolean} isRefreshing - Whether a refresh is in progress
 */
export function updateRefreshStatus(isRefreshing) {
    const oldValue = state.isRefreshing;
    state.isRefreshing = isRefreshing;

    // Notify listeners
    notifyListeners('isRefreshing', isRefreshing, oldValue);
}

/**
 * Update refresh statistics
 * @param {Object} stats - Refresh stats { total, completed, startTime }
 */
export function updateRefreshStats(stats) {
    state.refreshStats = { ...state.refreshStats, ...stats };
}

/**
 * Update last refresh time
 * @param {number} timestamp - Timestamp of last refresh
 */
export function updateLastRefreshTime(timestamp) {
    state.lastRefreshTime = timestamp;
}

/**
 * Update previous live status
 * @param {Object} newStatus - New previous live status object
 */
export function updatePreviousLiveStatus(newStatus) {
    state.previousLiveStatus = newStatus;
}

/**
 * Update status change queue
 * @param {Array} newQueue - New status change queue
 */
export function updateStatusChangeQueue(newQueue) {
    state.statusChangeQueue = newQueue;
}

/**
 * Add room to monitored list
 * @param {Object} room - Room object { id, platform, isFav }
 */
export function addRoom(room) {
    const oldRooms = [...state.rooms];
    state.rooms.push(room);
    // 优化：用户操作立即写入
    debouncedStorageWrite('pro_monitored_rooms', state.rooms, true);
    // Notify listeners for auto-rendering
    notifyListeners('rooms', state.rooms, oldRooms);
}

/**
 * Remove room from monitored list
 * @param {string} id - Room ID
 * @param {string} platform - Platform name
 */
export function removeRoom(id, platform) {
    const oldRooms = [...state.rooms];
    // IMPORTANT: Modify array in-place to preserve references
    for (let i = state.rooms.length - 1; i >= 0; i--) {
        if (state.rooms[i].id === id && state.rooms[i].platform === platform) {
            state.rooms.splice(i, 1);
        }
    }
    // 优化：用户操作立即写入
    debouncedStorageWrite('pro_monitored_rooms', state.rooms, true);
    // Notify listeners for auto-rendering
    notifyListeners('rooms', state.rooms, oldRooms);
}

/**
 * Toggle room favorite status
 * @param {string} id - Room ID
 * @param {string} platform - Platform name
 */
export function toggleRoomFavorite(id, platform) {
    const oldRooms = [...state.rooms];
    // IMPORTANT: Modify objects in-place to preserve references
    const room = state.rooms.find(r => r.id === id && r.platform === platform);
    if (room) {
        room.isFav = !room.isFav;
        // 优化：用户操作立即写入
        debouncedStorageWrite('pro_monitored_rooms', state.rooms, true);
        // Notify listeners for auto-rendering
        notifyListeners('rooms', state.rooms, oldRooms);
    }
}

/**
 * Save current configuration to storage
 * Legacy function for backward compatibility
 */
export function saveConfig() {
    SafeStorage.setJSON('pro_monitored_rooms', state.rooms);
    SafeStorage.setJSON('pro_search_history', state.searchHistory);
    SafeStorage.setItem('pro_notify_enabled', state.notificationsEnabled);
}

/**
 * Save cache to storage
 * Legacy function for backward compatibility
 */
export function saveCache() {
    SafeStorage.setJSON('pro_room_cache', state.roomDataCache);
}

// ============================================================
// GETTERS - Read-only access to state
// ============================================================

/**
 * Get monitored rooms
 * @returns {Array} Array of room objects
 */
export function getRooms() {
    return state.rooms;
}

/**
 * Get room data cache
 * @returns {Object} Room data cache object
 */
export function getRoomDataCache() {
    return state.roomDataCache;
}

/**
 * Get search history
 * @returns {Array} Search history array
 */
export function getSearchHistory() {
    return state.searchHistory;
}

/**
 * Get device ID
 * @returns {string} Device identifier
 */
export function getDid() {
    return state.did;
}

/**
 * Check if notifications are enabled
 * @returns {boolean} True if notifications are enabled
 */
export function isNotificationsEnabled() {
    return state.notificationsEnabled;
}

/**
 * Check if auto-refresh is enabled
 * @returns {boolean} True if auto-refresh is enabled
 */
export function isAutoRefreshEnabled() {
    return state.autoRefreshEnabled;
}

/**
 * Check if currently refreshing
 * @returns {boolean} True if refresh is in progress
 */
export function isCurrentlyRefreshing() {
    return state.isRefreshing;
}

/**
 * Get refresh statistics
 * @returns {Object} Refresh stats object
 */
export function getRefreshStats() {
    return state.refreshStats;
}

// ============================================================
// COMPATIBILITY ALIASES
// For main.js compatibility with expected function names
// ============================================================

/**
 * Initialize state (currently a no-op as state is initialized on import)
 */
export function initState() {
    // State is already initialized on module load
    console.log('[State] State initialized');
}

/**
 * Get entire state object (read-only reference)
 * @returns {Object} State object
 */
export function getState() {
    return state;
}

/**
 * Set state values (generic setter)
 * @param {string} key - State key
 * @param {*} value - New value
 */
export function setState(key, value) {
    if (key in state) {
        state[key] = value;
    } else {
        console.warn(`[State] Unknown state key: ${key}`);
    }
}

/**
 * Set rooms (alias for updateRooms)
 * @param {Array} newRooms - New rooms array
 */
export function setRooms(newRooms) {
    updateRooms(newRooms);
}

/**
 * Set room data cache (alias for updateRoomDataCache)
 * @param {Object} newCache - New cache object
 */
export function setRoomDataCache(newCache) {
    updateRoomDataCache(newCache);
}
