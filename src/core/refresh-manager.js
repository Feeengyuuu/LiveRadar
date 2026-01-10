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
import { getState, getRooms, getRoomDataCache, updateRefreshStatus, updateRefreshStats, updateLastRefreshTime } from './state.js';
import { getDOMCache } from '../utils/dom-cache.js';

// External dependencies (only callbacks need injection)
let detectStatusChanges = null;

/**
 * Initialize refresh manager with external dependencies
 * @param {Object} deps - Dependencies object
 */
export function initRefreshManager(deps = {}) {
    if (deps.detectStatusChanges) detectStatusChanges = deps.detectStatusChanges;
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
    const state = getState();
    let renderScheduled = false; // Flag to prevent duplicate render schedules

    // Smart render scheduler: Use requestAnimationFrame for smoother updates
    const scheduleRender = () => {
        if (!renderScheduled) {
            renderScheduled = true;
            requestAnimationFrame(() => {
                if (window.renderAll) window.renderAll();
                renderScheduled = false;
            });
        }
    };

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
                updateRefreshStats({ completed: finishedCount });
                updateRefreshStatsDisplay();

                // Batch rendering with requestAnimationFrame for smoother updates
                if (finishedCount % notifyBatchSize === 0 || finishedCount === items.length) {
                    scheduleRender();
                }
            });
        pool.add(task);
    }
    await Promise.allSettled(pool);
}

/**
 * Update refresh progress display
 */
function updateRefreshStatsDisplay() {
    const cache = getDOMCache();
    const el = cache.refreshStats;
    if (!el) return;

    const state = getState();
    if (state.isRefreshing) {
        const elapsed = ((Date.now() - state.refreshStats.startTime) / 1000).toFixed(1);
        el.textContent = `${state.refreshStats.completed}/${state.refreshStats.total} (${elapsed}s)`;
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
    const state = getState();
    const rooms = getRooms();

    // Debounce: Prevent duplicate refresh
    const now = Date.now();
    if (!sl && state.isRefreshing) {
        if (window.showToast) window.showToast("目前正在刷新", "info");
        return;
    }
    if (!sl && !isAutoRefresh && state.lastRefreshTime && now - state.lastRefreshTime < APP_CONFIG.NETWORK.REFRESH_COOLDOWN) {
        if (window.showToast) window.showToast("目前正在刷新", "info");
        return;
    }

    // Manual refresh resets auto-refresh countdown
    if (!isAutoRefresh && state.autoRefreshEnabled) {
        if (window.resetAutoRefreshCountdown) {
            window.resetAutoRefreshCountdown();
        } else {
            state.autoRefreshCountdown = APP_CONFIG.AUTO_REFRESH.INTERVAL;
            if (window.updateAutoRefreshBtn) window.updateAutoRefreshBtn();
        }
    }

    updateLastRefreshTime(now);
    updateRefreshStatus(true);

    const cache = getDOMCache();
    if (cache.globalRefreshBtn) cache.globalRefreshBtn.classList.add('animate-spin-reverse');

    // Show refresh start toast (silent mode skips toast)
    if (!sl && window.showToast) {
        window.showToast('开始刷新...', 'info');
    }

    // 优化：视口检测辅助函数
    const isInViewport = (element) => {
        if (!element) return false;
        const rect = element.getBoundingClientRect();
        return rect.top < window.innerHeight && rect.bottom > 0;
    };

    // 优化：多级优先级排序 - 收藏 > 视口内 > 其他
    const sortedRooms = [...rooms].sort((a, b) => {
        // 1. 收藏优先（最高优先级）
        if (a.isFav !== b.isFav) return b.isFav - a.isFav;

        // 2. 视口内优先（第二优先级）
        const aCard = document.getElementById(`card-${a.platform}-${a.id}`);
        const bCard = document.getElementById(`card-${b.platform}-${b.id}`);
        const aInView = isInViewport(aCard);
        const bInView = isInViewport(bCard);

        if (aInView !== bInView) return bInView ? 1 : -1;

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
    updateRefreshStats({
        total: sortedRooms.length,
        completed: 0,
        startTime: Date.now()
    });
    updateRefreshStatsDisplay();

    // Dynamic batch size: Adjust based on total count
    const batchSize = sortedRooms.length > APP_CONFIG.BATCH.THRESHOLD
        ? APP_CONFIG.BATCH.SIZE_LARGE
        : APP_CONFIG.BATCH.SIZE_SMALL;

    try {
        await promisePool(sortedRooms, concurrency, fetchRoomStatus, batchSize, sl === true);

        // Incremental update: Count data changes
        const roomDataCache = getRoomDataCache();
        const changedCount = Object.values(roomDataCache).filter(d => d._hasChanges === true).length;
        const unchangedCount = Object.values(roomDataCache).filter(d => d._hasChanges === false).length;

        // Display completion info
        const currentState = getState();
        const elapsed = ((Date.now() - currentState.refreshStats.startTime) / 1000).toFixed(1);
        if (APP_CONFIG.INCREMENTAL.ENABLED && APP_CONFIG.DEBUG.LOG_PERFORMANCE) {
            console.log(`[LiveRadar] Refresh complete: ${sortedRooms.length} rooms, ${elapsed}s elapsed, concurrency ${concurrency}, changed ${changedCount}, unchanged ${unchangedCount}`);
        } else {
            console.log(`[LiveRadar] Refresh complete: ${sortedRooms.length} rooms, ${elapsed}s elapsed, concurrency ${concurrency}`);
        }

        // Show refresh complete toast (silent mode skips toast)
        if (!sl && window.showToast) {
            const changeInfo = APP_CONFIG.INCREMENTAL.ENABLED
                ? ` (${changedCount} 项更新)`
                : '';
            window.showToast(`刷新完成${changeInfo} - ${elapsed}s`, 'success');
        }

        // Detect status changes and show notifications
        if (detectStatusChanges) detectStatusChanges();
    } catch (error) {
        console.error('[LiveRadar] Refresh error:', error);
        if (window.showToast) window.showToast('刷新出错，请检查网络连接', 'error');
    } finally {
        // Cleanup work - execute regardless of success or failure
        updateRefreshStatus(false);
        updateLastRefreshTime(0);
        updateRefreshStatsDisplay();

        if (cache.globalRefreshBtn) cache.globalRefreshBtn.classList.remove('animate-spin-reverse');

    }
}

// ====================================================================
// Exports
// ====================================================================

export { promisePool };

export default refreshAll;
