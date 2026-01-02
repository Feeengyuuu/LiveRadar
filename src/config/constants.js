import SafeStorage from '../utils/safe-storage.js';

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
    REFRESH_COOLDOWN: 5000,
    MAX_PROXY_STATS: 100,
    RETRY_DELAY: 1000,
  },

  // Cache configuration (优化：增加缓存时间以减少不必要的网络请求)
  CACHE: {
    DEBOUNCE_DELAY: 500,
    AVATAR_UPDATE_INTERVAL: 90 * 24 * 60 * 60 * 1000, // 90 days
    IMAGE_TIMESTAMP_INTERVAL: 1800000, // 优化：从5分钟(300000)改为30分钟(1800000)
  },

  // UI configuration
  UI: {
    TOAST_DURATION: 3000,
    LOADER_FADE_DURATION: 500,
    SCROLL_THRESHOLD: 300,
    STATS_HIDE_DELAY: 2000,
  },

  // Concurrency control (优化：降低并发数以减少带宽占用，避免视频卡顿)
  CONCURRENCY: {
    DEFAULT: 2,        // 从4降到2
    MEDIUM: 3,         // 从5降到3
    HIGH: 4,           // 从6降到4
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
