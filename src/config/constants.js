/**
 * ====================================================================
 * Application Constants & Configuration
 * ====================================================================
 *
 * Centralized configuration for the entire application.
 * All magic numbers, timeouts, URLs, and settings should be defined here.
 *
 * @module config/constants
 */

import SafeStorage from '../utils/safe-storage.js';

// ====================================================================
// Loading Messages
// ====================================================================

/**
 * Loading Messages - Random "Old Man" themed messages
 */
export const LOADING_MESSAGES = [
  '老头正在往搪瓷茶缸里吹气...',
  '老头正在把收音机的天线拉到最长...',
  '老头正在透过老花镜打量陌生人...',
  '老头正在跟送外卖的小伙子指路...',
  '老头正在用苍蝇拍瞄准窗户上的苍蝇...',
  '老头正在研究晚报上的中缝广告...',
  '老头正在把掉在地上的快递踢回角落...',
  '老头正在眯着眼听收音机里的京剧...',
  '老头正在盘两个油光发亮的核桃...',
  '老头正在假装没看见忘记带门禁卡的你...',
];

/**
 * Minimum loader display time
 */
export const MIN_LOADER_DISPLAY_TIME = 1500; // milliseconds

// ====================================================================
// Platform API Endpoints
// ====================================================================

/**
 * API endpoints for each platform
 * Centralized to make updates easier
 */
export const API_ENDPOINTS = {
  DOUYU: {
    RATE_STREAM: 'https://m.douyu.com/api/room/ratestream',
    BETARD: 'https://www.douyu.com/betard',
    ROOM_URL: 'https://www.douyu.com',
  },
  BILIBILI: {
    ROOM_INIT: 'https://api.live.bilibili.com/room/v1/Room/room_init',
    ROOM_INFO: 'https://api.live.bilibili.com/room/v1/Room/get_info',
    MASTER_INFO: 'https://api.live.bilibili.com/live_user/v1/Master/info',
    USER_INFO: 'https://api.bilibili.com/x/space/acc/info',
    ROOM_URL: 'https://live.bilibili.com',
  },
  TWITCH: {
    DECAPI_BASE: 'https://decapi.me/twitch',
    THUMBNAIL_BASE: 'https://static-cdn.jtvnw.net/previews-ttv',
    ROOM_URL: 'https://www.twitch.tv',
  },
  KICK: {
    API_V2: 'https://kick.com/api/v2/channels',
    ROOM_URL: 'https://kick.com',
  },
};

// ====================================================================
// Platform Configuration
// ====================================================================

/**
 * Platform-specific configuration
 */
export const PLATFORM_CONFIG = {
  douyu: {
    name: '斗鱼',
    color: '#FF5D23',
    icon: '🐟',
    idPattern: /^\d+$/,
    idPlaceholder: '房间号 (纯数字)',
    maxIdLength: 10,
  },
  bilibili: {
    name: 'B站',
    color: '#FB7299',
    icon: '📺',
    idPattern: /^\d+$/,
    idPlaceholder: '房间号 (纯数字)',
    maxIdLength: 15,
  },
  twitch: {
    name: 'Twitch',
    color: '#9146FF',
    icon: '🎮',
    idPattern: /^[a-zA-Z0-9_]+$/,
    idPlaceholder: '频道名 (英文/数字)',
    maxIdLength: 25,
  },
  kick: {
    name: 'Kick',
    color: '#53FC18',
    icon: '👊',
    idPattern: /^[a-zA-Z0-9_]+$/,
    idPlaceholder: '频道名 (英文/数字)',
    maxIdLength: 25,
  },
};

// ====================================================================
// Error Handling Configuration
// ====================================================================

/**
 * Error handling and retry configuration
 */
export const ERROR_CONFIG = {
  // Retry settings
  RETRY: {
    MAX_ATTEMPTS: 3,
    BASE_DELAY: 1000,      // 1 second
    MAX_DELAY: 10000,      // 10 seconds
    BACKOFF_FACTOR: 2,
  },

  // Circuit breaker settings
  CIRCUIT_BREAKER: {
    FAILURE_THRESHOLD: 5,  // Open after 5 failures
    SUCCESS_THRESHOLD: 2,  // Close after 2 successes
    TIMEOUT: 30000,        // 30 seconds before retry
  },

  // Error messages (Chinese)
  MESSAGES: {
    NETWORK: '网络连接失败',
    TIMEOUT: '请求超时',
    API_ERROR: '服务器错误',
    NOT_FOUND: '房间不存在',
    RATE_LIMITED: '请求过于频繁',
    UNKNOWN: '未知错误',
  },
};

// ====================================================================
// Main App Configuration
// ====================================================================

/**
 * App-wide Configuration
 * Centralized config to eliminate magic numbers
 */
export const APP_CONFIG = {
  // Network configuration
  NETWORK: {
    PROXY_TIMEOUT: 6000,
    PROXY_TIMEOUT_QUICK: 4000,
    PROXY_TIMEOUT_TWITCH: 6000,
    PROXY_TIMEOUT_TWITCH_META: 3000,
    PROXY_TIMEOUT_DIRECT: 4000,  // Direct connection timeout
    REFRESH_COOLDOWN: 5000,
    MAX_PROXY_STATS: 100,
    RETRY_DELAY: 1000,
    HEDGE_REQUESTS_ENABLED: true,
    HEDGE_DELAY_MS: 150, // 优化：从250ms降到150ms，减少100ms等待时间
  },

  // Proxy scoring configuration
  PROXY_SCORING: {
    TIER_PRIORITY: {
      premium: 1000,
      standard: 500,
      fallback: 100,
    },
    RECENCY_DECAY_HOURS: 24,      // 24-hour decay window
    SPEED_THRESHOLD_MS: 3000,     // Response time threshold for scoring
    QUALITY_SCORE_MULTIPLIER: 100,
    SUCCESS_RATE_WEIGHT: 0.4,
    RECENCY_WEIGHT: 0.3,
    SPEED_WEIGHT: 0.3,
  },

  // Cache configuration (优化：增加缓存时间以减少不必要的网络请求)
  CACHE: {
    DEBOUNCE_DELAY: 500,
    AVATAR_UPDATE_INTERVAL: 14 * 24 * 60 * 60 * 1000, // 14 days
    IMAGE_TIMESTAMP_INTERVAL: 1800000, // 优化：从5分钟(300000)改为30分钟(1800000)
  },

  // UI configuration
  UI: {
    TOAST_DURATION: 3000,
    LOADER_FADE_DURATION: 500,
    SCROLL_THRESHOLD: 300,
    STATS_HIDE_DELAY: 2000,
  },

  // Concurrency control (优化：提升并发数以加快刷新速度)
  CONCURRENCY: {
    DEFAULT: 4,        // 恢复到4，提升50-100%刷新速度
    MEDIUM: 5,         // 恢复到5
    HIGH: 6,           // 恢复到6
    THRESHOLD_MEDIUM: 5,
    THRESHOLD_HIGH: 15,
  },

  // Batch rendering
  BATCH: {
    SIZE_SMALL: 2,
    SIZE_LARGE: 4,
    THRESHOLD: 10,
  },

  // Auto-refresh (优化：增加抖动延迟以分散请求，减少突发流量)
  AUTO_REFRESH: {
    INTERVAL: 600, // seconds
    JITTER_MAX_INITIAL: 3000,  // 优化：从2000ms增加到3000ms
  },

  // Snow effect
  SNOW: {
    ENABLED:
      typeof window !== 'undefined' &&
      window.innerWidth >= 768 &&
      SafeStorage.getItem('pro_snow_enabled', 'false') === 'true',
    COUNT: 500,
    MAX_SIZE: 3.5,
    MIN_SIZE: 1,
    MAX_SPEED: 1.2,
    MIN_SPEED: 0.3,
    MAX_ACCUMULATED: 12,
    FALL_SPEED_BOOST: 1.5,
    ACCUMULATED_SIZE_MULT: 1.3,
    COLLISION_OFFSET: 5,
    POSITION_UPDATE_INTERVAL: 100,
  },

  // Performance
  PERFORMANCE: {
    LOW_MEMORY_THRESHOLD: 4,
    LOW_CPU_THRESHOLD: 4,
    ENABLE_PERFORMANCE_MODE: false,
  },

  // Incremental updates
  INCREMENTAL: {
    ENABLED: true,
    COMPARE_FIELDS: [
      'isLive',
      'isReplay',
      'title',
      'owner',
      'cover',
      'avatar',
      'viewers',
      'heatValue',
      'startTime',
    ],
    LOG_CHANGES: true,
  },

  // Audio
  AUDIO: {
    NOTIFICATION_VOLUME: 1.0,
    ENABLE_ON_IOS: false,
    AUTO_UNLOCK: true,
  },

  // Region detection
  REGION: {
    AUTO_DETECT: true,
    IS_MAINLAND_CHINA: null,
    DETECTION_TIMEOUT: 5000,
    MAINLAND_PROXY_STRATEGY: 'direct',
    DISABLE_TWITCH_IN_MAINLAND: true,
  },

  // Debug
  DEBUG: {
    ENABLED: false,
    LOG_NETWORK: false,
    LOG_RENDER: false,
    LOG_PERFORMANCE: true,
    LOG_AUDIO: true,
  },
};
