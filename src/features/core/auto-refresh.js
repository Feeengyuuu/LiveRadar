/**
 * Auto Refresh Module
 * Automatic room status refresh with countdown timer
 *
 * Uses ResourceManager for proper timer lifecycle management
 * to prevent memory leaks.
 */

import { APP_CONFIG } from '../../config/constants.js';
import { getElement } from '../../utils/dom-cache.js';
import { ResourceManager } from '../../utils/resource-manager.js';
import { isAutoRefreshEnabled, updateAutoRefreshEnabled } from '../../core/state.js';
import { on, emit, Events } from '../../core/event-bus.js';
import { showToast } from '../../utils/helpers.js';

// State
let autoRefreshTimer = null;
let autoRefreshCountdown = APP_CONFIG.AUTO_REFRESH.INTERVAL;
let disposeAutoRefresh = null;

/**
 * Format countdown in MM:SS format
 * @param {number} seconds - Seconds to format
 * @returns {string} Formatted time string
 */
function formatCountdown(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Update auto-refresh button UI
 */
function updateAutoRefreshBtn() {
    const btn = getElement('auto-refresh-btn');
    const label = getElement('auto-refresh-label');
    const metricRefresh = getElement('metric-refresh-count');
    if (!btn || !label) return;

    if (isAutoRefreshEnabled()) {
        btn.classList.remove('off');
        const countdown = formatCountdown(autoRefreshCountdown);
        label.textContent = `自动: ${countdown}`;
        if (metricRefresh) metricRefresh.textContent = countdown;
    } else {
        btn.classList.add('off');
        label.textContent = '自动: 关';
        if (metricRefresh) metricRefresh.textContent = '--:--';
    }
}

/**
 * Reset auto-refresh countdown (used by manual refresh)
 */
export function resetAutoRefreshCountdown() {
    autoRefreshCountdown = APP_CONFIG.AUTO_REFRESH.INTERVAL;
    updateAutoRefreshBtn();
}

/**
 * Start auto-refresh timer
 * Uses ResourceManager for proper lifecycle management
 */
export function startAutoRefresh() {
    // Clear existing timer if any (using ResourceManager)
    if (autoRefreshTimer) {
        ResourceManager.clearInterval(autoRefreshTimer);
        autoRefreshTimer = null;
    }
    autoRefreshCountdown = APP_CONFIG.AUTO_REFRESH.INTERVAL;

    const timerId = setInterval(() => {
        autoRefreshCountdown--;
        updateAutoRefreshBtn();

        if (autoRefreshCountdown <= 0) {
            console.log('[自动刷新] 触发刷新');
            autoRefreshCountdown = APP_CONFIG.AUTO_REFRESH.INTERVAL;
            emit(Events.REFRESH_REQUEST, false, true); // isAuto=true
        }
    }, 1000);

    // Track with ResourceManager for proper cleanup
    autoRefreshTimer = ResourceManager.addInterval(timerId);
}

/**
 * Stop auto-refresh timer
 * Properly removes timer from ResourceManager
 */
export function stopAutoRefresh() {
    if (autoRefreshTimer) {
        ResourceManager.clearInterval(autoRefreshTimer);
        autoRefreshTimer = null;
    }
    autoRefreshCountdown = APP_CONFIG.AUTO_REFRESH.INTERVAL;
}

/**
 * Toggle auto-refresh on/off
 */
export function toggleAutoRefresh() {
    const nextEnabled = !isAutoRefreshEnabled();
    updateAutoRefreshEnabled(nextEnabled);

    if (nextEnabled) {
        startAutoRefresh();
        showToast("自动刷新已开启 (每10分钟)");
    } else {
        stopAutoRefresh();
        showToast("自动刷新已关闭");
    }
    updateAutoRefreshBtn();
}

/**
 * Initialize auto-refresh on page load
 */
export function initAutoRefresh() {
    if (disposeAutoRefresh) {
        updateAutoRefreshBtn();
        return disposeAutoRefresh;
    }

    if (isAutoRefreshEnabled()) {
        startAutoRefresh();
    }
    updateAutoRefreshBtn();

    // Cross-module requests from refresh-manager flow through the event bus
    const unsubscribeReset = on(Events.AUTO_REFRESH_RESET, resetAutoRefreshCountdown);
    const unsubscribeUpdate = on(Events.AUTO_REFRESH_UPDATE_BTN, updateAutoRefreshBtn);

    disposeAutoRefresh = () => {
        unsubscribeReset();
        unsubscribeUpdate();
        stopAutoRefresh();
        disposeAutoRefresh = null;
    };

    return disposeAutoRefresh;
}
