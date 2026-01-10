/**
 * ====================================================================
 * Type Definitions (JSDoc)
 * ====================================================================
 *
 * This file provides JSDoc type definitions for the entire application.
 * Import these types in other files for better IDE support and documentation.
 *
 * Usage:
 * ```javascript
 * // In any file that needs types
 * /** @typedef {import('../types/index.js').RoomStatus} RoomStatus * /
 * /** @typedef {import('../types/index.js').Room} Room * /
 * ```
 *
 * @module types
 */

// ====================================================================
// Room Types
// ====================================================================

/**
 * Platform identifiers
 * @typedef {'douyu' | 'bilibili' | 'twitch' | 'kick'} Platform
 */

/**
 * Room configuration stored in state
 * @typedef {Object} Room
 * @property {string} id - Room/channel ID
 * @property {Platform} platform - Platform identifier
 * @property {boolean} isFav - Whether room is favorited
 */

/**
 * Room status returned from API
 * @typedef {Object} RoomStatus
 * @property {boolean} isLive - Whether the room is currently live
 * @property {boolean} isReplay - Whether playing a replay/video loop
 * @property {string} title - Stream title
 * @property {string} owner - Streamer/channel name
 * @property {string} cover - Cover/thumbnail URL
 * @property {string} avatar - Streamer avatar URL
 * @property {number} heatValue - Viewer count or popularity value
 * @property {boolean} isError - Whether an error occurred fetching status
 * @property {number|null} startTime - Stream start timestamp (milliseconds)
 * @property {number} [lastTitleUpdate] - Last title update timestamp (Twitch)
 */

/**
 * Room data cache entry (stored data)
 * @typedef {Object} RoomCacheEntry
 * @property {string} owner - Cached owner name
 * @property {string} avatar - Cached avatar URL
 * @property {string} title - Cached title
 * @property {string} cover - Cached cover URL
 * @property {boolean} [isLive] - Last known live status
 * @property {number} [lastUpdate] - Last update timestamp
 */

// ====================================================================
// State Types
// ====================================================================

/**
 * Application state
 * @typedef {Object} AppState
 * @property {Room[]} rooms - Monitored rooms list
 * @property {string[]} searchHistory - Search history
 * @property {boolean} notificationsEnabled - Notifications enabled
 * @property {string} did - Device identifier
 * @property {Object<string, RoomCacheEntry>} roomDataCache - Room data cache
 * @property {Object<string, ProxyStats>} proxyStats - Proxy statistics
 * @property {number|null} timer - Timer ID
 * @property {number} timeLeft - Time left in seconds
 * @property {number} lastRefreshTime - Last refresh timestamp
 * @property {boolean} isRefreshing - Whether refresh is in progress
 * @property {RefreshStats} refreshStats - Refresh statistics
 * @property {boolean} autoRefreshEnabled - Auto-refresh enabled
 * @property {number|null} autoRefreshTimer - Auto-refresh timer ID
 * @property {number} autoRefreshCountdown - Auto-refresh countdown
 * @property {boolean} keepAliveEnabled - Keep-alive mode enabled
 * @property {HTMLAudioElement|null} keepAliveAudio - Keep-alive audio element
 * @property {boolean} keepAliveUnlocked - Whether audio is unlocked
 * @property {boolean} snowEnabled - Snow effect enabled
 * @property {Object<string, boolean>} previousLiveStatus - Previous live status map
 * @property {StatusChange[]} statusChangeQueue - Status change queue
 * @property {number} currentTickerIndex - Current ticker index
 * @property {number|null} tickerTimer - Ticker timer ID
 */

/**
 * Refresh statistics
 * @typedef {Object} RefreshStats
 * @property {number} total - Total rooms to refresh
 * @property {number} completed - Completed rooms
 * @property {number} startTime - Refresh start timestamp
 */

/**
 * Status change notification
 * @typedef {Object} StatusChange
 * @property {string} id - Room ID
 * @property {Platform} platform - Platform
 * @property {string} owner - Streamer name
 * @property {boolean} isLive - New live status
 * @property {number} timestamp - Change timestamp
 */

// ====================================================================
// Network Types
// ====================================================================

/**
 * Proxy configuration
 * @typedef {Object} ProxyConfig
 * @property {string} name - Proxy name
 * @property {string} tier - Proxy tier (premium/standard/fallback)
 * @property {number} weight - Selection weight
 * @property {string} [region] - Geographic region
 * @property {boolean} [wrap] - Whether response needs unwrapping
 * @property {function(string): string} url - URL builder function
 */

/**
 * Proxy statistics
 * @typedef {Object} ProxyStats
 * @property {number} success - Successful requests count
 * @property {number} fail - Failed requests count
 * @property {number} lastSuccessTime - Last success timestamp
 * @property {number} totalResponseTime - Total response time
 * @property {number} avgResponseTime - Average response time
 */

/**
 * Fetch options
 * @typedef {Object} FetchOptions
 * @property {boolean} [fetchAvatar=true] - Whether to fetch avatar
 * @property {number} [timeout] - Request timeout in ms
 * @property {boolean} [useProxy=true] - Whether to use proxy
 */

// ====================================================================
// Error Types
// ====================================================================

/**
 * Error types
 * @typedef {'NETWORK' | 'TIMEOUT' | 'API' | 'PARSE' | 'VALIDATION' | 'STORAGE' | 'UNKNOWN'} ErrorType
 */

/**
 * Error severity levels
 * @typedef {'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'} ErrorSeverity
 */

/**
 * Retry configuration
 * @typedef {Object} RetryConfig
 * @property {number} [maxRetries=3] - Maximum retry attempts
 * @property {number} [baseDelay=1000] - Base delay in ms
 * @property {number} [maxDelay=10000] - Maximum delay in ms
 * @property {number} [backoffFactor=2] - Exponential backoff factor
 * @property {function(Error, number): boolean} [shouldRetry] - Custom retry condition
 * @property {function(Error, number, number): void} [onRetry] - Callback on each retry
 */

// ====================================================================
// UI Types
// ====================================================================

/**
 * Toast notification types
 * @typedef {'info' | 'success' | 'warning' | 'error'} ToastType
 */

/**
 * Toast options
 * @typedef {Object} ToastOptions
 * @property {ToastType} [type='info'] - Toast type
 * @property {number} [duration=3000] - Display duration in ms
 */

/**
 * DOM cache structure
 * @typedef {Object} DOMCache
 * @property {HTMLElement|null} roomsGrid - Rooms grid container
 * @property {HTMLElement|null} platformSelect - Platform select dropdown
 * @property {HTMLInputElement|null} roomInput - Room ID input
 * @property {HTMLButtonElement|null} addRoomBtn - Add room button
 * @property {HTMLButtonElement|null} refreshBtn - Refresh button
 * @property {HTMLElement|null} toastContainer - Toast container
 * @property {HTMLElement|null} loader - Loader element
 */

// ====================================================================
// Logger Types
// ====================================================================

/**
 * Log levels
 * @typedef {0 | 1 | 2 | 3 | 4} LogLevel
 */

/**
 * Log level names
 * @typedef {'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'SILENT'} LogLevelName
 */

/**
 * Logger instance
 * @typedef {Object} LoggerInstance
 * @property {function(string, ...any): void} debug - Log debug message
 * @property {function(string, ...any): void} info - Log info message
 * @property {function(string, ...any): void} warn - Log warning message
 * @property {function(string, ...any): void} error - Log error message
 * @property {function(string): void} time - Start timer
 * @property {function(string): number} timeEnd - End timer and return duration
 * @property {function(string, Function): void} group - Create log group
 * @property {function(Array|Object, string=): void} table - Log table
 */

// ====================================================================
// Storage Types
// ====================================================================

/**
 * Storage usage statistics
 * @typedef {Object} StorageUsage
 * @property {number} used - Used bytes
 * @property {number} total - Total available bytes
 * @property {number} percentage - Usage percentage (0-1)
 * @property {string} usedMB - Used in MB (formatted)
 * @property {boolean} isNearFull - Whether storage is near capacity
 */

// ====================================================================
// Export (for documentation purposes)
// ====================================================================

/**
 * Export empty object to make this a module
 * Types are imported via JSDoc @typedef imports
 */
export default {};
