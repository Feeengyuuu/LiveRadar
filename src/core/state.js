/**
 * ============================================================
 * CENTRALIZED STATE MANAGEMENT
 * ============================================================
 * This module manages all global application state with proper
 * encapsulation and provides controlled access through getters/setters.
 *
 * State is persisted to localStorage via SafeStorage for durability
 * across browser sessions.
 */

import { SafeStorage } from '../utils/safe-storage.js';
import { APP_CONFIG } from '../config/constants.js';

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
    imgTimestamp: Math.floor(Date.now() / APP_CONFIG.CACHE.IMAGE_TIMESTAMP_INTERVAL),

    // Refresh control
    lastRefreshTime: 0,
    isRefreshing: false,
    refreshStats: { total: 0, completed: 0, startTime: 0 },

    // Auto-refresh settings
    autoRefreshEnabled: localStorage.getItem('pro_auto_refresh') === 'true',
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
 */
export function updateRooms(newRooms) {
    // IMPORTANT: Modify array in-place to preserve references
    state.rooms.length = 0;
    state.rooms.push(...newRooms);
    SafeStorage.setJSON('pro_monitored_rooms', state.rooms);
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
    state.notificationsEnabled = enabled;
    SafeStorage.setItem('pro_notify_enabled', enabled);
}

/**
 * Update room data cache
 * @param {Object} newCache - New cache object
 */
export function updateRoomDataCache(newCache) {
    state.roomDataCache = newCache;
    SafeStorage.setJSON('pro_room_cache', newCache);
}

/**
 * Update single room cache entry
 * @param {string} key - Cache key (e.g., "douyu-6979222")
 * @param {Object} data - Room data
 */
export function updateRoomCache(key, data) {
    state.roomDataCache[key] = data;
    SafeStorage.setJSON('pro_room_cache', state.roomDataCache);
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
    localStorage.setItem('pro_auto_refresh', enabled);
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
    state.isRefreshing = isRefreshing;
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
 * Update image timestamp (for cache busting)
 */
export function updateImgTimestamp() {
    state.imgTimestamp = Math.floor(Date.now() / APP_CONFIG.CACHE.IMAGE_TIMESTAMP_INTERVAL);
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
    state.rooms.push(room);
    SafeStorage.setJSON('pro_monitored_rooms', state.rooms);
}

/**
 * Remove room from monitored list
 * @param {string} id - Room ID
 * @param {string} platform - Platform name
 */
export function removeRoom(id, platform) {
    // IMPORTANT: Modify array in-place to preserve references
    for (let i = state.rooms.length - 1; i >= 0; i--) {
        if (state.rooms[i].id === id && state.rooms[i].platform === platform) {
            state.rooms.splice(i, 1);
        }
    }
    SafeStorage.setJSON('pro_monitored_rooms', state.rooms);
}

/**
 * Toggle room favorite status
 * @param {string} id - Room ID
 * @param {string} platform - Platform name
 */
export function toggleRoomFavorite(id, platform) {
    // IMPORTANT: Modify objects in-place to preserve references
    const room = state.rooms.find(r => r.id === id && r.platform === platform);
    if (room) {
        room.isFav = !room.isFav;
        SafeStorage.setJSON('pro_monitored_rooms', state.rooms);
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
