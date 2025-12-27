/**
 * ====================================================================
 * Refresh Manager - Auto-Refresh Logic & Concurrent Request Pool
 * ====================================================================
 *
 * Features:
 * - Smart concurrent request pooling with configurable limits
 * - Auto-refresh with countdown timer
 * - Batch rendering for performance optimization
 * - Progress tracking and statistics
 * - Debounce protection against duplicate refreshes
 * - Dynamic concurrency based on room count
 *
 * @module core/refresh-manager
 */

import { APP_CONFIG } from '../config/constants.js';
import { ResourceManager } from '../utils/resource-manager.js';
import { fetchRoomStatus } from './status-fetcher.js';

// External dependencies (injected)
let rooms = [];
let roomDataCache = {};
let isRefreshing = false;
let lastRefreshTime = 0;
let imgTimestamp = 0;
let refreshStats = { total: 0, completed: 0, startTime: 0 };
let autoRefreshEnabled = false;
let autoRefreshCountdown = 0;
let loaderStartTime = 0;

// Dependency injection functions
let updateRefreshStats = null;
let updateAutoRefreshBtn = null;
let detectStatusChanges = null;

const MIN_LOADER_DISPLAY_TIME = 1500; // Minimum display 1.5 seconds

/**
 * Initialize refresh manager with external dependencies
 * @param {Object} deps - Dependencies object
 */
export function initRefreshManager(deps = {}) {
    if (deps.rooms) rooms = deps.rooms;
    if (deps.roomDataCache) roomDataCache = deps.roomDataCache;
    if (deps.updateRefreshStats) updateRefreshStats = deps.updateRefreshStats;
    if (deps.updateAutoRefreshBtn) updateAutoRefreshBtn = deps.updateAutoRefreshBtn;
    if (deps.detectStatusChanges) detectStatusChanges = deps.detectStatusChanges;
    if (deps.loaderStartTime !== undefined) loaderStartTime = deps.loaderStartTime;
}

/**
 * Update refresh manager state
 * @param {Object} state - State object to update
 */
export function updateRefreshState(state) {
    if (state.isRefreshing !== undefined) isRefreshing = state.isRefreshing;
    if (state.lastRefreshTime !== undefined) lastRefreshTime = state.lastRefreshTime;
    if (state.imgTimestamp !== undefined) imgTimestamp = state.imgTimestamp;
    if (state.autoRefreshEnabled !== undefined) autoRefreshEnabled = state.autoRefreshEnabled;
    if (state.autoRefreshCountdown !== undefined) autoRefreshCountdown = state.autoRefreshCountdown;
}

/**
 * Get current refresh state
 * @returns {Object} Current state
 */
export function getRefreshState() {
    return {
        isRefreshing,
        lastRefreshTime,
        imgTimestamp,
        refreshStats,
        autoRefreshEnabled,
        autoRefreshCountdown
    };
}

// ====================================================================
// Smart Concurrent Pool
// ====================================================================

/**
 * Execute tasks with controlled concurrency
 * @param {Array} items - Items to process
 * @param {number} concurrentLimit - Maximum concurrent tasks
 * @param {Function} taskFn - Task function (item, jitter) => Promise
 * @param {number} notifyBatchSize - Batch size for rendering updates
 * @param {boolean} isInitial - Whether this is initial load (applies jitter)
 * @returns {Promise<void>}
 */
async function promisePool(items, concurrentLimit, taskFn, notifyBatchSize = 3, isInitial = false) {
    const pool = new Set();
    let finishedCount = 0;

    // Use injected function or fallback to internal implementation
    const statsUpdater = updateRefreshStats || updateRefreshStatsInternal;

    for (const item of items) {
        if (pool.size >= concurrentLimit) await Promise.race(pool);

        const jitter = isInitial ? Math.floor(Math.random() * APP_CONFIG.AUTO_REFRESH.JITTER_MAX_INITIAL) : 0;
        const task = taskFn(item, jitter)
            .catch(error => {
                console.error(`[promisePool] Task execution failed:`, error);
            })
            .finally(() => {
                pool.delete(task);
                finishedCount++;

                // Update progress
                refreshStats.completed = finishedCount;
                statsUpdater();

                // Batch rendering
                if (finishedCount % notifyBatchSize === 0 || finishedCount === items.length) {
                    if (window.renderAll) window.renderAll();
                }
            });
        pool.add(task);
    }
    await Promise.allSettled(pool);
}

/**
 * Update refresh progress display
 */
function updateRefreshStatsInternal() {
    const el = document.getElementById('refresh-stats');
    if (!el) return;

    if (isRefreshing) {
        const elapsed = ((Date.now() - refreshStats.startTime) / 1000).toFixed(1);
        el.textContent = `${refreshStats.completed}/${refreshStats.total} (${elapsed}s)`;
        el.classList.remove('hidden');
        el.classList.add('active');
    } else {
        el.classList.remove('active');
        const timerId = setTimeout(() => el.classList.add('hidden'), APP_CONFIG.UI.STATS_HIDE_DELAY);
        ResourceManager.addTimer(timerId);
    }
}

// ====================================================================
// Main Refresh Function
// ====================================================================

/**
 * Refresh all rooms with smart concurrency management
 * @param {boolean} sl - Silent mode (initial load)
 * @param {boolean} isAutoRefresh - Whether triggered by auto-refresh
 * @returns {Promise<void>}
 */
export async function refreshAll(sl = false, isAutoRefresh = false) {
    // Debounce: Prevent duplicate refresh (skip check for auto-refresh)
    const now = Date.now();
    if (!sl && !isAutoRefresh && isRefreshing) {
        if (window.showToast) window.showToast("正在刷新中...", "info");
        return;
    }
    if (!sl && !isAutoRefresh && now - lastRefreshTime < APP_CONFIG.NETWORK.REFRESH_COOLDOWN) {
        const remaining = Math.ceil((APP_CONFIG.NETWORK.REFRESH_COOLDOWN - (now - lastRefreshTime)) / 1000);
        if (window.showToast) window.showToast(`请${remaining}秒后再试`, "info");
        return;
    }

    // Manual refresh resets auto-refresh countdown
    if (!isAutoRefresh && autoRefreshEnabled) {
        autoRefreshCountdown = APP_CONFIG.AUTO_REFRESH.INTERVAL;
        if (updateAutoRefreshBtn) updateAutoRefreshBtn();
    }

    lastRefreshTime = now;
    isRefreshing = true;
    imgTimestamp = Math.floor(Date.now() / APP_CONFIG.CACHE.IMAGE_TIMESTAMP_INTERVAL);

    const b = document.getElementById('global-refresh-btn');
    if (b) b.classList.add('animate-spin-reverse');

    // Priority sorting: Favorites first
    const sortedRooms = [...rooms].sort((a, b) => {
        if (a.isFav !== b.isFav) return b.isFav - a.isFav;
        return 0;
    });

    // Dynamic concurrency: Adjust based on room count and device performance
    let concurrency = APP_CONFIG.CONCURRENCY.DEFAULT;
    if (sortedRooms.length > APP_CONFIG.CONCURRENCY.THRESHOLD_HIGH) {
        concurrency = APP_CONFIG.CONCURRENCY.HIGH;
    } else if (sortedRooms.length > APP_CONFIG.CONCURRENCY.THRESHOLD_MEDIUM) {
        concurrency = APP_CONFIG.CONCURRENCY.MEDIUM;
    }

    // Initialize statistics
    refreshStats = {
        total: sortedRooms.length,
        completed: 0,
        startTime: Date.now()
    };

    // Use internal or external updateRefreshStats
    const statsUpdater = updateRefreshStats || updateRefreshStatsInternal;
    statsUpdater();

    // Dynamic batch size: Adjust based on total count
    const batchSize = sortedRooms.length > APP_CONFIG.BATCH.THRESHOLD
        ? APP_CONFIG.BATCH.SIZE_LARGE
        : APP_CONFIG.BATCH.SIZE_SMALL;

    try {
        await promisePool(sortedRooms, concurrency, fetchRoomStatus, batchSize, sl === true);

        // Incremental update: Count data changes
        const changedCount = Object.values(roomDataCache).filter(d => d._hasChanges === true).length;
        const unchangedCount = Object.values(roomDataCache).filter(d => d._hasChanges === false).length;

        // Display completion info
        const elapsed = ((Date.now() - refreshStats.startTime) / 1000).toFixed(1);
        if (APP_CONFIG.INCREMENTAL.ENABLED && APP_CONFIG.DEBUG.LOG_PERFORMANCE) {
            console.log(`[LiveRadar] Refresh complete: ${sortedRooms.length} rooms, ${elapsed}s elapsed, concurrency ${concurrency}, changed ${changedCount}, unchanged ${unchangedCount}`);
        } else {
            console.log(`[LiveRadar] Refresh complete: ${sortedRooms.length} rooms, ${elapsed}s elapsed, concurrency ${concurrency}`);
        }

        // Detect status changes and show notifications
        if (detectStatusChanges) detectStatusChanges();
    } catch (error) {
        console.error('[LiveRadar] Refresh error:', error);
        if (window.showToast) window.showToast('刷新出错，请检查网络连接', 'error');
    } finally {
        // Cleanup work - execute regardless of success or failure
        isRefreshing = false;
        statsUpdater();

        if (b) b.classList.remove('animate-spin-reverse');

        // Ensure initial loader is always removed (minimum display 1.5 seconds)
        if (sl) {
            const l = document.getElementById('initial-loader');
            if (l) {
                // Calculate elapsed display time
                const elapsedTime = Date.now() - loaderStartTime;
                const remainingTime = Math.max(0, MIN_LOADER_DISPLAY_TIME - elapsedTime);

                // Ensure at least 1.5 seconds display before fade out
                const timerId = setTimeout(() => {
                    l.style.opacity = '0';
                    // 恢复主内容的可见性 - 移除loading class
                    document.body.classList.remove('loading');
                    document.body.style.overflow = '';
                    const fadeTimerId = setTimeout(() => l.remove(), APP_CONFIG.UI.LOADER_FADE_DURATION);
                    ResourceManager.addTimer(fadeTimerId);
                }, remainingTime);
                ResourceManager.addTimer(timerId);
            }
        }
    }
}

// ====================================================================
// Exports
// ====================================================================

export { promisePool };

export default refreshAll;
